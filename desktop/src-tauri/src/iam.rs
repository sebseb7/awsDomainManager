use crate::aws_client::build_sdk_config;
use aws_sdk_iam::error::DisplayErrorContext;
use aws_sdk_iam::types::Tag;
use aws_sdk_iam::Client;
use serde::Serialize;
use serde_json::json;
use std::collections::HashSet;

const BUCKET_USER_PATH: &str = "/s3-bucket-users/";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedIamUserDto {
    pub bucket_name: String,
    pub user_name: String,
    pub role: String,
    pub role_label: String,
    pub access_key_id: String,
    pub secret_access_key: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IamAccessKeyMetaDto {
    pub access_key_id: String,
    pub status: String,
    pub create_date: String,
    pub last_used_date: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BucketIamUserDto {
    pub bucket_name: String,
    pub user_name: String,
    pub role: String,
    pub role_label: String,
    pub created_at: String,
    pub last_used_at: String,
    pub access_keys: Vec<IamAccessKeyMetaDto>,
}

fn role_label(role: &str) -> &'static str {
    match role {
        "put-only" => "Put Only (no read, no delete)",
        "read-only" => "Read Only (no put, no delete)",
        _ => "Unknown",
    }
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

fn resolve_users(
    bucket_name: &str,
    access_mode: &str,
    custom_user_name: &str,
) -> Result<Vec<(String, &'static str)>, String> {
    if access_mode.is_empty() || access_mode == "none" {
        return Ok(Vec::new());
    }

    let trimmed_custom = custom_user_name.trim();
    match access_mode {
        "put-only" => {
            let name = if !trimmed_custom.is_empty() {
                validate_iam_username(trimmed_custom)?
            } else {
                validate_iam_username(&format!("{}-put", truncate_prefix(bucket_name, 60)))?
            };
            Ok(vec![(name, "put-only")])
        }
        "read-only" => {
            let name = if !trimmed_custom.is_empty() {
                validate_iam_username(trimmed_custom)?
            } else {
                validate_iam_username(&format!("{}-read", truncate_prefix(bucket_name, 59)))?
            };
            Ok(vec![(name, "read-only")])
        }
        "both" => {
            let base = if trimmed_custom.is_empty() {
                bucket_name
            } else {
                trimmed_custom
            };
            let put_name = validate_iam_username(&format!("{}-put", truncate_prefix(base, 60)))?;
            let read_name = validate_iam_username(&format!("{}-read", truncate_prefix(base, 59)))?;
            Ok(vec![(put_name, "put-only"), (read_name, "read-only")])
        }
        other => Err(format!("Invalid IAM access mode: \"{}\".", other)),
    }
}

fn build_bucket_policy(bucket_name: &str, role: &str) -> Result<String, String> {
    let bucket_arn = format!("arn:aws:s3:::{}", bucket_name);
    let objects_arn = format!("arn:aws:s3:::{}/*", bucket_name);

    let deny_delete = json!({
        "Sid": "DenyAllDelete",
        "Effect": "Deny",
        "Action": [
            "s3:DeleteObject",
            "s3:DeleteObjectVersion",
            "s3:DeleteBucket"
        ],
        "Resource": [bucket_arn, objects_arn]
    });

    let doc = match role {
        "put-only" => json!({
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "AllowPutObjectOnly",
                    "Effect": "Allow",
                    "Action": ["s3:PutObject"],
                    "Resource": [objects_arn]
                },
                deny_delete
            ]
        }),
        "read-only" => json!({
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "AllowListBucket",
                    "Effect": "Allow",
                    "Action": ["s3:ListBucket"],
                    "Resource": [bucket_arn]
                },
                {
                    "Sid": "AllowGetObjectOnly",
                    "Effect": "Allow",
                    "Action": ["s3:GetObject"],
                    "Resource": [objects_arn]
                },
                deny_delete
            ]
        }),
        other => return Err(format!("Unsupported IAM bucket role: \"{}\".", other)),
    };

    Ok(doc.to_string())
}

pub async fn create_bucket_iam_users(
    profile: &str,
    bucket_name: &str,
    access_mode: &str,
    custom_user_name: &str,
) -> Result<Vec<CreatedIamUserDto>, String> {
    let users_to_create = resolve_users(bucket_name, access_mode, custom_user_name)?;
    if users_to_create.is_empty() {
        return Ok(Vec::new());
    }

    let config = build_sdk_config(profile, Some("us-east-1")).await?;
    let client = Client::new(&config);
    let mut created = Vec::new();

    for (user_name, role) in users_to_create {
        let tag_managed = Tag::builder()
            .key("ManagedBy")
            .value("aws-domain-manager")
            .build()
            .map_err(|e| format!("Failed building tag: {}", e))?;
        let tag_bucket = Tag::builder()
            .key("S3Bucket")
            .value(bucket_name)
            .build()
            .map_err(|e| format!("Failed building tag: {}", e))?;
        let tag_access = Tag::builder()
            .key("S3Access")
            .value(role)
            .build()
            .map_err(|e| format!("Failed building tag: {}", e))?;

        client
            .create_user()
            .user_name(&user_name)
            .path(BUCKET_USER_PATH)
            .tags(tag_managed)
            .tags(tag_bucket)
            .tags(tag_access)
            .send()
            .await
            .map_err(|e| {
                format!(
                    "Bucket \"{}\" was created, but failed creating IAM user \"{}\": {}",
                    bucket_name,
                    user_name,
                    DisplayErrorContext(&e)
                )
            })?;

        let policy_doc = build_bucket_policy(bucket_name, role)?;
        let policy_name_full = format!("s3-{}-{}", role, bucket_name);
        let policy_name = truncate_prefix(&policy_name_full, 128);

        client
            .put_user_policy()
            .user_name(&user_name)
            .policy_name(policy_name)
            .policy_document(policy_doc)
            .send()
            .await
            .map_err(|e| {
                format!(
                    "Bucket \"{}\" was created, but failed attaching policy to IAM user \"{}\": {}",
                    bucket_name,
                    user_name,
                    DisplayErrorContext(&e)
                )
            })?;

        let key_resp = client
            .create_access_key()
            .user_name(&user_name)
            .send()
            .await
            .map_err(|e| {
                format!(
                    "Bucket \"{}\" was created, but failed creating access key for IAM user \"{}\": {}",
                    bucket_name,
                    user_name,
                    DisplayErrorContext(&e)
                )
            })?;

        let access_key = key_resp.access_key();
        created.push(CreatedIamUserDto {
            bucket_name: bucket_name.to_string(),
            user_name,
            role: role.to_string(),
            role_label: role_label(role).to_string(),
            access_key_id: access_key
                .map(|k| k.access_key_id().to_string())
                .unwrap_or_default(),
            secret_access_key: access_key
                .map(|k| k.secret_access_key().to_string())
                .unwrap_or_default(),
        });
    }

    Ok(created)
}

async fn list_all_managed_users(
    client: &Client,
) -> Result<Vec<aws_sdk_iam::types::User>, String> {
    let mut users = Vec::new();
    let mut marker: Option<String> = None;

    loop {
        let mut req = client.list_users().path_prefix(BUCKET_USER_PATH);
        if let Some(m) = &marker {
            req = req.marker(m);
        }
        let resp = req
            .send()
            .await
            .map_err(|e| format!("Failed listing IAM users: {}", DisplayErrorContext(&e)))?;
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

fn candidate_user_names_for_bucket(bucket_name: &str) -> Vec<String> {
    let mut names = Vec::new();
    if let Ok(put_name) = validate_iam_username(&format!("{}-put", truncate_prefix(bucket_name, 60))) {
        names.push(put_name);
    }
    if let Ok(read_name) = validate_iam_username(&format!("{}-read", truncate_prefix(bucket_name, 59))) {
        names.push(read_name);
    }
    for i in 2..=6 {
        let suffix = format!("-read-{}", i);
        if let Ok(read_n) = validate_iam_username(&format!(
            "{}{}",
            truncate_prefix(bucket_name, 64 - suffix.len()),
            suffix
        )) {
            names.push(read_n);
        }
    }
    names
}

async fn inspect_candidate_user(
    client: &Client,
    bucket_name: &str,
    user_name: &str,
    created_at_hint: Option<String>,
) -> Result<Option<BucketIamUserDto>, String> {
    let tags_resp = match client.list_user_tags().user_name(user_name).send().await {
        Ok(resp) => resp,
        Err(e) => {
            let msg = format!("{}", DisplayErrorContext(&e));
            if msg.contains("NoSuchEntity") {
                return Ok(None);
            }
            return Err(format!(
                "Failed reading tags for IAM user \"{}\": {}",
                user_name, msg
            ));
        }
    };

    let mut tag_bucket: Option<&str> = None;
    let mut tag_access: Option<&str> = None;
    for t in tags_resp.tags() {
        if t.key() == "S3Bucket" {
            tag_bucket = Some(t.value());
        } else if t.key() == "S3Access" {
            tag_access = Some(t.value());
        }
    }

    let role = match (tag_bucket, tag_access) {
        (Some(b), Some("put-only")) if b == bucket_name => "put-only",
        (Some(b), Some("read-only")) if b == bucket_name => "read-only",
        (None, None) if user_name.ends_with("-put") => "put-only",
        (None, None) if user_name.contains("-read") => "read-only",
        _ => return Ok(None),
    };

    let keys_resp = client
        .list_access_keys()
        .user_name(user_name)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed listing access keys for IAM user \"{}\": {}",
                user_name,
                DisplayErrorContext(&e)
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

    Ok(Some(BucketIamUserDto {
        bucket_name: bucket_name.to_string(),
        user_name: user_name.to_string(),
        role: role.to_string(),
        role_label: role_label(role).to_string(),
        created_at,
        last_used_at,
        access_keys,
    }))
}

pub async fn list_bucket_iam_users(
    profile: &str,
    bucket_name: &str,
) -> Result<Vec<BucketIamUserDto>, String> {
    let config = build_sdk_config(profile, Some("us-east-1")).await?;
    let client = Client::new(&config);

    let mut matching = Vec::new();

    match list_all_managed_users(&client).await {
        Ok(all_users) => {
            for user in all_users {
                let user_name = user.user_name().to_string();
                let created_hint = Some(user.create_date().to_string());
                if let Some(dto) =
                    inspect_candidate_user(&client, bucket_name, &user_name, created_hint).await?
                {
                    matching.push(dto);
                }
            }
        }
        Err(_list_err) => {
            // Fallback when iam:ListUsers on "*" is not granted: probe deterministic bucket usernames
            for candidate in candidate_user_names_for_bucket(bucket_name) {
                if let Some(dto) =
                    inspect_candidate_user(&client, bucket_name, &candidate, None).await?
                {
                    matching.push(dto);
                }
            }
        }
    }

    matching.sort_by(|a, b| {
        let rank_a = if a.role == "put-only" { 0 } else { 1 };
        let rank_b = if b.role == "put-only" { 0 } else { 1 };
        rank_a.cmp(&rank_b).then_with(|| a.user_name.cmp(&b.user_name))
    });

    Ok(matching)
}

fn pick_default_username(
    bucket_name: &str,
    role: &str,
    existing_names: &HashSet<String>,
) -> Result<String, String> {
    let base_suffix = if role == "put-only" { "-put" } else { "-read" };
    let first = validate_iam_username(&format!(
        "{}{}",
        truncate_prefix(bucket_name, 64 - base_suffix.len()),
        base_suffix
    ))?;
    if !existing_names.contains(&first) {
        return Ok(first);
    }
    for i in 2..=999 {
        let suffix = format!("{}-{}", base_suffix, i);
        let candidate = validate_iam_username(&format!(
            "{}{}",
            truncate_prefix(bucket_name, 64 - suffix.len()),
            suffix
        ))?;
        if !existing_names.contains(&candidate) {
            return Ok(candidate);
        }
    }
    Err("Could not generate a unique IAM username. Please specify a custom username.".to_string())
}

pub async fn create_bucket_iam_user(
    profile: &str,
    bucket_name: &str,
    role: &str,
    custom_user_name: &str,
) -> Result<CreatedIamUserDto, String> {
    if role != "put-only" && role != "read-only" {
        return Err(format!(
            "Invalid IAM role: \"{}\". Must be \"put-only\" or \"read-only\".",
            role
        ));
    }

    let existing_for_bucket = list_bucket_iam_users(profile, bucket_name).await?;
    if role == "put-only" {
        if let Some(existing_write) = existing_for_bucket.iter().find(|u| u.role == "put-only") {
            return Err(format!(
                "Only one write (put-only) key/user is allowed per bucket. Revoke or recreate \"{}\" instead.",
                existing_write.user_name
            ));
        }
    }

    let config = build_sdk_config(profile, Some("us-east-1")).await?;
    let client = Client::new(&config);

    let existing_names: HashSet<String> = match list_all_managed_users(&client).await {
        Ok(all_managed) => all_managed
            .iter()
            .map(|u| u.user_name().to_string())
            .collect(),
        Err(_) => existing_for_bucket
            .iter()
            .map(|u| u.user_name.clone())
            .collect(),
    };

    let trimmed_custom = custom_user_name.trim();
    let user_name = if !trimmed_custom.is_empty() {
        validate_iam_username(trimmed_custom)?
    } else {
        pick_default_username(bucket_name, role, &existing_names)?
    };

    let tag_managed = Tag::builder()
        .key("ManagedBy")
        .value("aws-domain-manager")
        .build()
        .map_err(|e| format!("Failed building tag: {}", e))?;
    let tag_bucket = Tag::builder()
        .key("S3Bucket")
        .value(bucket_name)
        .build()
        .map_err(|e| format!("Failed building tag: {}", e))?;
    let tag_access = Tag::builder()
        .key("S3Access")
        .value(role)
        .build()
        .map_err(|e| format!("Failed building tag: {}", e))?;

    client
        .create_user()
        .user_name(&user_name)
        .path(BUCKET_USER_PATH)
        .tags(tag_managed)
        .tags(tag_bucket)
        .tags(tag_access)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed creating IAM user \"{}\": {}",
                user_name,
                DisplayErrorContext(&e)
            )
        })?;

    let policy_doc = build_bucket_policy(bucket_name, role)?;
    let policy_name_full = format!("s3-{}-{}", role, bucket_name);
    let policy_name = truncate_prefix(&policy_name_full, 128);

    client
        .put_user_policy()
        .user_name(&user_name)
        .policy_name(policy_name)
        .policy_document(policy_doc)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed attaching policy to IAM user \"{}\": {}",
                user_name,
                DisplayErrorContext(&e)
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
                DisplayErrorContext(&e)
            )
        })?;

    let access_key = key_resp.access_key();
    Ok(CreatedIamUserDto {
        bucket_name: bucket_name.to_string(),
        user_name,
        role: role.to_string(),
        role_label: role_label(role).to_string(),
        access_key_id: access_key
            .map(|k| k.access_key_id().to_string())
            .unwrap_or_default(),
        secret_access_key: access_key
            .map(|k| k.secret_access_key().to_string())
            .unwrap_or_default(),
    })
}

pub async fn recreate_bucket_iam_user(
    profile: &str,
    bucket_name: &str,
    user_name: &str,
    role: &str,
) -> Result<CreatedIamUserDto, String> {
    if role != "put-only" && role != "read-only" {
        return Err(format!("Invalid IAM role: \"{}\".", role));
    }

    let config = build_sdk_config(profile, Some("us-east-1")).await?;
    let client = Client::new(&config);

    let keys_resp = client
        .list_access_keys()
        .user_name(user_name)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed listing access keys for \"{}\": {}",
                user_name,
                DisplayErrorContext(&e)
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
                        DisplayErrorContext(&e)
                    )
                })?;
        }
    }

    let policy_doc = build_bucket_policy(bucket_name, role)?;
    let policy_name_full = format!("s3-{}-{}", role, bucket_name);
    let policy_name = truncate_prefix(&policy_name_full, 128);

    client
        .put_user_policy()
        .user_name(user_name)
        .policy_name(policy_name)
        .policy_document(policy_doc)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed updating policy for \"{}\": {}",
                user_name,
                DisplayErrorContext(&e)
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
                DisplayErrorContext(&e)
            )
        })?;

    let access_key = key_resp.access_key();
    Ok(CreatedIamUserDto {
        bucket_name: bucket_name.to_string(),
        user_name: user_name.to_string(),
        role: role.to_string(),
        role_label: role_label(role).to_string(),
        access_key_id: access_key
            .map(|k| k.access_key_id().to_string())
            .unwrap_or_default(),
        secret_access_key: access_key
            .map(|k| k.secret_access_key().to_string())
            .unwrap_or_default(),
    })
}

pub async fn revoke_bucket_iam_user(profile: &str, user_name: &str) -> Result<(), String> {
    let config = build_sdk_config(profile, Some("us-east-1")).await?;
    let client = Client::new(&config);

    let keys_resp = client
        .list_access_keys()
        .user_name(user_name)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed listing access keys for \"{}\": {}",
                user_name,
                DisplayErrorContext(&e)
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
                        "Failed deleting access key \"{}\" for \"{}\": {}",
                        key_id,
                        user_name,
                        DisplayErrorContext(&e)
                    )
                })?;
        }
    }

    let policies_resp = client
        .list_user_policies()
        .user_name(user_name)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed listing inline policies for \"{}\": {}",
                user_name,
                DisplayErrorContext(&e)
            )
        })?;

    for policy_name in policies_resp.policy_names() {
        client
            .delete_user_policy()
            .user_name(user_name)
            .policy_name(policy_name)
            .send()
            .await
            .map_err(|e| {
                format!(
                    "Failed deleting inline policy \"{}\" for \"{}\": {}",
                    policy_name,
                    user_name,
                    DisplayErrorContext(&e)
                )
            })?;
    }

    client
        .delete_user()
        .user_name(user_name)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed deleting IAM user \"{}\": {}",
                user_name,
                DisplayErrorContext(&e)
            )
        })?;

    Ok(())
}
