use crate::aws_client::build_sdk_config;
use crate::iam::IamAccessKeyMetaDto;
use aws_sdk_iam::error::{DisplayErrorContext, ProvideErrorMetadata};
use aws_sdk_iam::types::Tag;
use aws_sdk_iam::Client;
use base64::Engine as _;
use hmac::{Hmac, KeyInit, Mac};
use lettre::message::header::ContentType;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::Sha256;
use std::collections::HashSet;
use std::time::Duration;

type HmacSha256 = Hmac<Sha256>;

pub const SES_SMTP_USER_PATH: &str = "/ses-smtp-users/";
pub const SES_SENDING_POLICY_NAME: &str = "AmazonSesSendingAccess";

fn format_aws_err<E: ProvideErrorMetadata + std::error::Error>(err: &E) -> String {
    match (err.code(), err.message()) {
        (Some(code), Some(msg)) => format!("{}: {}", code, msg),
        (None, Some(msg)) => msg.to_string(),
        _ => format!("{}", DisplayErrorContext(err)),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SesSenderKeyUserDto {
    pub identity_name: String,
    pub user_name: String,
    pub region: String,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub policy_name: String,
    pub created_at: String,
    pub last_used_at: String,
    pub access_keys: Vec<IamAccessKeyMetaDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedSesSenderKeyDto {
    pub identity_name: String,
    pub user_name: String,
    pub region: String,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_username: String,
    pub smtp_password: String,
    pub access_key_id: String,
    pub secret_access_key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmtpTestSendInput {
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_username: String,
    pub smtp_password: String,
    pub from_email: String,
    pub to_email: String,
    pub subject: String,
    pub body: String,
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts key of any size");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

pub fn ses_smtp_host(region: &str) -> String {
    let r = if region.trim().is_empty() {
        "us-east-1"
    } else {
        region.trim()
    };
    format!("email-smtp.{}.amazonaws.com", r)
}

/// Derive an Amazon SES SMTP password from an IAM Secret Access Key using AWS SigV4.
pub fn derive_ses_smtp_password(secret_access_key: &str, region: &str) -> String {
    let clean_region = if region.trim().is_empty() {
        "us-east-1"
    } else {
        region.trim()
    };
    let k_secret = format!("AWS4{}", secret_access_key);
    let k_date = hmac_sha256(k_secret.as_bytes(), b"11111111");
    let k_region = hmac_sha256(&k_date, clean_region.as_bytes());
    let k_service = hmac_sha256(&k_region, b"ses");
    let k_signing = hmac_sha256(&k_service, b"aws4_request");
    let signature = hmac_sha256(&k_signing, b"SendRawEmail");

    let mut payload = Vec::with_capacity(1 + signature.len());
    payload.push(0x04);
    payload.extend_from_slice(&signature);

    base64::engine::general_purpose::STANDARD.encode(payload)
}

fn validate_iam_username(user_name: &str) -> Result<String, String> {
    let trimmed = user_name.trim();
    if trimmed.is_empty() {
        return Err("IAM username cannot be empty.".to_string());
    }
    if trimmed.len() > 64 {
        return Err("IAM username must be 64 characters or fewer.".to_string());
    }
    if !trimmed.chars().all(|c| {
        c.is_ascii_alphanumeric()
            || matches!(c, '+' | '=' | ',' | '.' | '@' | '_' | '-')
    }) {
        return Err(
            "IAM username may only contain letters, digits, and +=,.@_- characters.".to_string(),
        );
    }
    Ok(trimmed.to_string())
}

fn truncate_prefix(s: &str, max_len: usize) -> &str {
    if s.len() <= max_len {
        s
    } else {
        &s[..max_len]
    }
}

fn sanitize_identity_prefix(identity_name: &str) -> String {
    let cleaned: String = identity_name
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let collapsed = cleaned.trim_matches('-').to_string();
    let base = if collapsed.is_empty() {
        "ses-smtp".to_string()
    } else {
        format!("ses-{}", collapsed)
    };
    truncate_prefix(&base, 58).trim_end_matches('-').to_string()
}

fn build_ses_sending_policy(identity_name: &str) -> String {
    let trimmed = identity_name.trim();
    let condition = if trimmed.contains('@') {
        json!({
            "StringEqualsIgnoreCase": {
                "ses:FromAddress": trimmed
            }
        })
    } else {
        json!({
            "StringLike": {
                "ses:FromAddress": format!("*@{}", trimmed.trim_end_matches('.'))
            }
        })
    };

    json!({
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": SES_SENDING_POLICY_NAME,
                "Effect": "Allow",
                "Action": ["ses:SendRawEmail"],
                "Resource": "*",
                "Condition": condition
            }
        ]
    })
    .to_string()
}

async fn resolve_profile_region(profile: &str) -> Result<String, String> {
    let cfg = build_sdk_config(profile, None).await?;
    Ok(cfg
        .region()
        .map(|r| r.as_ref().to_string())
        .unwrap_or_else(|| "us-east-1".to_string()))
}

async fn list_all_managed_ses_users(
    client: &Client,
) -> Result<Vec<aws_sdk_iam::types::User>, String> {
    let mut users = Vec::new();
    let mut marker: Option<String> = None;

    loop {
        let mut req = client.list_users().path_prefix(SES_SMTP_USER_PATH);
        if let Some(m) = &marker {
            req = req.marker(m);
        }
        let resp = req
            .send()
            .await
            .map_err(|e| format!("Failed listing SES SMTP IAM users: {}", format_aws_err(&e)))?;
        users.extend(resp.users().iter().cloned());
        if resp.is_truncated() {
            marker = resp.marker().map(|s| s.to_string());
            if marker.is_none() {
                break;
            }
        } else {
            break;
        }
    }

    Ok(users)
}

fn candidate_usernames_for_identity(identity_name: &str) -> Vec<String> {
    let prefix = sanitize_identity_prefix(identity_name);
    let mut names = Vec::new();
    if let Ok(first) = validate_iam_username(&prefix) {
        names.push(first);
    }
    for i in 2..=6 {
        let suffix = format!("-{}", i);
        let candidate = format!("{}{}", truncate_prefix(&prefix, 64 - suffix.len()), suffix);
        if let Ok(valid) = validate_iam_username(&candidate) {
            names.push(valid);
        }
    }
    names
}

async fn inspect_ses_candidate_user(
    client: &Client,
    identity_name: &str,
    default_region: &str,
    user_name: &str,
    created_at_hint: Option<String>,
) -> Result<Option<SesSenderKeyUserDto>, String> {
    let tags_resp = match client.list_user_tags().user_name(user_name).send().await {
        Ok(resp) => resp,
        Err(e) => {
            let msg = format_aws_err(&e);
            if msg.contains("NoSuchEntity") {
                return Ok(None);
            }
            return Err(format!(
                "Failed reading tags for IAM user \"{}\": {}",
                user_name, msg
            ));
        }
    };

    let mut tag_identity: Option<String> = None;
    let mut tag_region: Option<String> = None;
    for t in tags_resp.tags() {
        if t.key() == "SesIdentity" {
            tag_identity = Some(t.value().to_string());
        } else if t.key() == "SesRegion" {
            tag_region = Some(t.value().to_string());
        }
    }

    let expected_id = identity_name.trim().to_ascii_lowercase();
    let matches_identity = match tag_identity {
        Some(ref id) => id.trim().to_ascii_lowercase() == expected_id,
        None => false,
    };
    if !matches_identity {
        return Ok(None);
    }

    let region = tag_region
        .filter(|r| !r.trim().is_empty())
        .unwrap_or_else(|| default_region.to_string());

    let keys_resp = client
        .list_access_keys()
        .user_name(user_name)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed listing access keys for IAM user \"{}\": {}",
                user_name,
                format_aws_err(&e)
            )
        })?;

    let mut access_keys: Vec<IamAccessKeyMetaDto> = Vec::new();
    for k in keys_resp.access_key_metadata() {
        let key_id = k.access_key_id().unwrap_or_default().to_string();
        let status = k
            .status()
            .map(|s| s.as_str().to_string())
            .unwrap_or_else(|| "Unknown".to_string());
        let create_date = k
            .create_date()
            .map(|d| d.to_string())
            .unwrap_or_else(|| "-".to_string());

        let last_used_date = if !key_id.is_empty() {
            match client
                .get_access_key_last_used()
                .access_key_id(&key_id)
                .send()
                .await
            {
                Ok(used_resp) => used_resp
                    .access_key_last_used()
                    .and_then(|u| u.last_used_date())
                    .map(|d| d.to_string())
                    .unwrap_or_else(|| "Never".to_string()),
                Err(_) => "-".to_string(),
            }
        } else {
            "-".to_string()
        };

        access_keys.push(IamAccessKeyMetaDto {
            access_key_id: key_id,
            status,
            create_date,
            last_used_date,
        });
    }

    let created_at = access_keys
        .first()
        .map(|k| k.create_date.clone())
        .or(created_at_hint)
        .unwrap_or_else(|| "-".to_string());

    let last_used_at = access_keys
        .first()
        .map(|k| k.last_used_date.clone())
        .unwrap_or_else(|| "Never".to_string());

    Ok(Some(SesSenderKeyUserDto {
        identity_name: identity_name.trim().to_string(),
        user_name: user_name.to_string(),
        smtp_host: ses_smtp_host(&region),
        smtp_port: 587,
        region,
        policy_name: SES_SENDING_POLICY_NAME.to_string(),
        created_at,
        last_used_at,
        access_keys,
    }))
}

pub async fn list_ses_sender_keys(
    profile: &str,
    identity_name: &str,
) -> Result<Vec<SesSenderKeyUserDto>, String> {
    let trimmed = identity_name.trim();
    if trimmed.is_empty() {
        return Err("SES identity name is required.".to_string());
    }
    let ses_region = resolve_profile_region(profile).await?;
    let iam_config = build_sdk_config(profile, Some("us-east-1")).await?;
    let client = Client::new(&iam_config);

    let mut matching = Vec::new();
    match list_all_managed_ses_users(&client).await {
        Ok(all_users) => {
            for user in all_users {
                let user_name = user.user_name().to_string();
                let created_hint = Some(user.create_date().to_string());
                if let Some(dto) = inspect_ses_candidate_user(
                    &client,
                    trimmed,
                    &ses_region,
                    &user_name,
                    created_hint,
                )
                .await?
                {
                    matching.push(dto);
                }
            }
        }
        Err(_) => {
            for candidate in candidate_usernames_for_identity(trimmed) {
                if let Some(dto) = inspect_ses_candidate_user(
                    &client,
                    trimmed,
                    &ses_region,
                    &candidate,
                    None,
                )
                .await?
                {
                    matching.push(dto);
                }
            }
        }
    }

    matching.sort_by(|a, b| a.user_name.cmp(&b.user_name));
    Ok(matching)
}

fn pick_default_ses_username(
    identity_name: &str,
    existing_names: &HashSet<String>,
) -> Result<String, String> {
    let prefix = sanitize_identity_prefix(identity_name);
    let first = validate_iam_username(&prefix)?;
    if !existing_names.contains(&first) {
        return Ok(first);
    }
    for i in 2..=999 {
        let suffix = format!("-{}", i);
        let candidate = validate_iam_username(&format!(
            "{}{}",
            truncate_prefix(&prefix, 64 - suffix.len()),
            suffix
        ))?;
        if !existing_names.contains(&candidate) {
            return Ok(candidate);
        }
    }
    Err("Could not generate a unique IAM username. Please specify a custom username.".to_string())
}

pub async fn create_ses_sender_key(
    profile: &str,
    identity_name: &str,
    custom_user_name: &str,
) -> Result<CreatedSesSenderKeyDto, String> {
    let trimmed_identity = identity_name.trim();
    if trimmed_identity.is_empty() {
        return Err("SES email identity is required.".to_string());
    }

    let ses_region = resolve_profile_region(profile).await?;
    let iam_config = build_sdk_config(profile, Some("us-east-1")).await?;
    let client = Client::new(&iam_config);

    let existing_names: HashSet<String> = match list_all_managed_ses_users(&client).await {
        Ok(all) => all.iter().map(|u| u.user_name().to_string()).collect(),
        Err(_) => HashSet::new(),
    };

    let trimmed_custom = custom_user_name.trim();
    let user_name = if !trimmed_custom.is_empty() {
        validate_iam_username(trimmed_custom)?
    } else {
        pick_default_ses_username(trimmed_identity, &existing_names)?
    };

    let tag_managed = Tag::builder()
        .key("ManagedBy")
        .value("aws-domain-manager")
        .build()
        .map_err(|e| format!("Failed building tag: {}", e))?;
    let tag_identity = Tag::builder()
        .key("SesIdentity")
        .value(trimmed_identity.to_ascii_lowercase())
        .build()
        .map_err(|e| format!("Failed building tag: {}", e))?;
    let tag_region = Tag::builder()
        .key("SesRegion")
        .value(&ses_region)
        .build()
        .map_err(|e| format!("Failed building tag: {}", e))?;

    client
        .create_user()
        .user_name(&user_name)
        .path(SES_SMTP_USER_PATH)
        .tags(tag_managed)
        .tags(tag_identity)
        .tags(tag_region)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed creating SES SMTP IAM user \"{}\": {}",
                user_name,
                format_aws_err(&e)
            )
        })?;

    let policy_doc = build_ses_sending_policy(trimmed_identity);
    client
        .put_user_policy()
        .user_name(&user_name)
        .policy_name(SES_SENDING_POLICY_NAME)
        .policy_document(policy_doc)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed attaching {} policy to IAM user \"{}\": {}",
                SES_SENDING_POLICY_NAME,
                user_name,
                format_aws_err(&e)
            )
        })?;

    let key_resp = client
        .create_access_key()
        .user_name(&user_name)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed creating access key for IAM user \"{}\": {}",
                user_name,
                format_aws_err(&e)
            )
        })?;

    let access_key = key_resp.access_key();
    let access_key_id = access_key
        .map(|k| k.access_key_id().to_string())
        .unwrap_or_default();
    let secret_access_key = access_key
        .map(|k| k.secret_access_key().to_string())
        .unwrap_or_default();
    let smtp_password = derive_ses_smtp_password(&secret_access_key, &ses_region);

    Ok(CreatedSesSenderKeyDto {
        identity_name: trimmed_identity.to_string(),
        user_name,
        smtp_host: ses_smtp_host(&ses_region),
        smtp_port: 587,
        region: ses_region,
        smtp_username: access_key_id.clone(),
        smtp_password,
        access_key_id,
        secret_access_key,
    })
}

pub async fn recreate_ses_sender_key(
    profile: &str,
    identity_name: &str,
    user_name: &str,
) -> Result<CreatedSesSenderKeyDto, String> {
    let trimmed_identity = identity_name.trim();
    if trimmed_identity.is_empty() {
        return Err("SES email identity is required.".to_string());
    }

    let ses_region = resolve_profile_region(profile).await?;
    let iam_config = build_sdk_config(profile, Some("us-east-1")).await?;
    let client = Client::new(&iam_config);

    let keys_resp = client
        .list_access_keys()
        .user_name(user_name)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed listing access keys for \"{}\": {}",
                user_name,
                format_aws_err(&e)
            )
        })?;

    for k in keys_resp.access_key_metadata() {
        if let Some(key_id) = k.access_key_id() {
            client
                .delete_access_key()
                .user_name(user_name)
                .access_key_id(key_id)
                .send()
                .await
                .map_err(|e| {
                    format!(
                        "Failed deleting old access key \"{}\" for \"{}\": {}",
                        key_id,
                        user_name,
                        format_aws_err(&e)
                    )
                })?;
        }
    }

    let policy_doc = build_ses_sending_policy(trimmed_identity);
    client
        .put_user_policy()
        .user_name(user_name)
        .policy_name(SES_SENDING_POLICY_NAME)
        .policy_document(policy_doc)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed updating {} policy for \"{}\": {}",
                SES_SENDING_POLICY_NAME,
                user_name,
                format_aws_err(&e)
            )
        })?;

    let key_resp = client
        .create_access_key()
        .user_name(user_name)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed creating new access key for \"{}\": {}",
                user_name,
                format_aws_err(&e)
            )
        })?;

    let access_key = key_resp.access_key();
    let access_key_id = access_key
        .map(|k| k.access_key_id().to_string())
        .unwrap_or_default();
    let secret_access_key = access_key
        .map(|k| k.secret_access_key().to_string())
        .unwrap_or_default();
    let smtp_password = derive_ses_smtp_password(&secret_access_key, &ses_region);

    Ok(CreatedSesSenderKeyDto {
        identity_name: trimmed_identity.to_string(),
        user_name: user_name.to_string(),
        smtp_host: ses_smtp_host(&ses_region),
        smtp_port: 587,
        region: ses_region,
        smtp_username: access_key_id.clone(),
        smtp_password,
        access_key_id,
        secret_access_key,
    })
}

pub async fn revoke_ses_sender_key(profile: &str, user_name: &str) -> Result<(), String> {
    crate::iam::revoke_bucket_iam_user(profile, user_name).await
}

pub async fn test_ses_smtp_send(input: SmtpTestSendInput) -> Result<String, String> {
    let host = input.smtp_host.trim();
    let username = input.smtp_username.trim();
    let password = input.smtp_password.trim();
    let from = input.from_email.trim();
    let to = input.to_email.trim();
    let port = if input.smtp_port == 0 {
        587
    } else {
        input.smtp_port
    };

    if host.is_empty() {
        return Err("SMTP host is required.".to_string());
    }
    if username.is_empty() {
        return Err("SMTP username (Access Key ID) is required.".to_string());
    }
    if password.is_empty() {
        return Err("SMTP password is required.".to_string());
    }
    if from.is_empty() {
        return Err("From email address is required.".to_string());
    }
    if to.is_empty() {
        return Err("Recipient (To) email address is required.".to_string());
    }

    let from_mailbox = from
        .parse()
        .map_err(|e| format!("Invalid From email address \"{}\": {}", from, e))?;
    let to_mailbox = to
        .parse()
        .map_err(|e| format!("Invalid To email address \"{}\": {}", to, e))?;

    let subject = if input.subject.trim().is_empty() {
        format!("AWS SES SMTP Test — {}", from)
    } else {
        input.subject.trim().to_string()
    };
    let body = if input.body.trim().is_empty() {
        format!(
            "This is an SMTP test email sent from {} via {}:{}.",
            from, host, port
        )
    } else {
        input.body.clone()
    };

    let email = Message::builder()
        .from(from_mailbox)
        .to(to_mailbox)
        .subject(subject)
        .header(ContentType::TEXT_PLAIN)
        .body(body)
        .map_err(|e| format!("Failed building SMTP email message: {}", e))?;

    let creds = Credentials::new(username.to_string(), password.to_string());
    let builder = if port == 465 {
        AsyncSmtpTransport::<Tokio1Executor>::relay(host)
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(host)
    }
    .map_err(|e| format!("Failed configuring SMTP transport for \"{}\": {}", host, e))?;

    let mailer = builder
        .port(port)
        .credentials(creds)
        .timeout(Some(Duration::from_secs(20)))
        .build();

    let response = mailer
        .send(email)
        .await
        .map_err(|e| format!("SMTP send failed ({}:{}): {}", host, port, e))?;

    let detail: String = response
        .message()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    Ok(format!(
        "SMTP test email sent from \"{}\" to \"{}\" via {}:{} ({} {}).",
        from,
        to,
        host,
        port,
        response.code(),
        if detail.is_empty() { "OK" } else { &detail }
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derives_valid_sigv4_ses_smtp_password() {
        let pw = derive_ses_smtp_password(
            "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            "eu-central-1",
        );
        assert_eq!(pw, "BF0/eIJm0ruTHsSjOkRuOGzGF+zeSyE3aiRzrzUQ8LwG");
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(&pw)
            .expect("valid base64");
        assert_eq!(decoded.len(), 33);
        assert_eq!(decoded[0], 0x04);
    }
}
