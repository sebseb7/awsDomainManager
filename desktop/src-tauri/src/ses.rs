use crate::aws_client::build_sdk_config;
use aws_sdk_sesv2::error::DisplayErrorContext;
use aws_sdk_sesv2::Client;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SesIdentityDto {
    pub identity_name: String,
    pub identity_type: String,
    pub type_label: String,
    pub verification_status: String,
    pub dkim_status: String,
    pub sending_enabled: bool,
}

fn format_type_label(identity_type: &str) -> &'static str {
    match identity_type {
        "DOMAIN" => "Domain",
        "EMAIL_ADDRESS" => "Email",
        "MANAGED_DOMAIN" => "Managed Domain",
        _ => "Unknown",
    }
}

pub async fn list_ses_identities(profile: &str) -> Result<Vec<SesIdentityDto>, String> {
    let config = build_sdk_config(profile, None).await?;
    let client = Client::new(&config);

    let mut raw_identities = Vec::new();
    let mut next_token: Option<String> = None;

    loop {
        let mut req = client.list_email_identities().page_size(100);
        if let Some(token) = &next_token {
            req = req.next_token(token);
        }
        let resp = req
            .send()
            .await
            .map_err(|e| format!("Failed to load SES identities: {}", DisplayErrorContext(&e)))?;

        raw_identities.extend(resp.email_identities().iter().cloned());
        next_token = resp.next_token().map(|s| s.to_string());
        if next_token.is_none() {
            break;
        }
    }

    let mut identities = Vec::new();
    for item in raw_identities {
        let identity_name = match item.identity_name() {
            Some(name) if !name.is_empty() => name.to_string(),
            _ => continue,
        };
        let identity_type = item
            .identity_type()
            .map(|t| t.as_str().to_string())
            .unwrap_or_else(|| "EMAIL_ADDRESS".to_string());
        let mut verification_status = item
            .verification_status()
            .map(|s| s.as_str().to_string())
            .unwrap_or_else(|| "UNKNOWN".to_string());
        let mut dkim_status = "-".to_string();

        if let Ok(detail) = client
            .get_email_identity()
            .email_identity(&identity_name)
            .send()
            .await
        {
            if let Some(vs) = detail.verification_status() {
                verification_status = vs.as_str().to_string();
            }
            if let Some(dkim) = detail.dkim_attributes() {
                if let Some(ds) = dkim.status() {
                    dkim_status = ds.as_str().to_string();
                }
            }
        }

        let type_label = format_type_label(&identity_type).to_string();
        identities.push(SesIdentityDto {
            identity_name,
            identity_type,
            type_label,
            verification_status,
            dkim_status,
            sending_enabled: item.sending_enabled(),
        });
    }

    identities.sort_by(|a, b| {
        let rank_a = if a.identity_type == "DOMAIN" { 0 } else { 1 };
        let rank_b = if b.identity_type == "DOMAIN" { 0 } else { 1 };
        rank_a
            .cmp(&rank_b)
            .then_with(|| a.identity_name.cmp(&b.identity_name))
    });

    Ok(identities)
}

pub async fn create_ses_identity(profile: &str, identity_name: &str) -> Result<String, String> {
    let trimmed = identity_name.trim();
    if trimmed.is_empty() {
        return Err("Domain or email address is required.".to_string());
    }

    let config = build_sdk_config(profile, None).await?;
    let client = Client::new(&config);

    client
        .create_email_identity()
        .email_identity(trimmed)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed to create SES identity \"{}\": {}",
                trimmed,
                DisplayErrorContext(&e)
            )
        })?;

    Ok(trimmed.to_string())
}

pub async fn delete_ses_identity(profile: &str, identity_name: &str) -> Result<(), String> {
    let config = build_sdk_config(profile, None).await?;
    let client = Client::new(&config);

    client
        .delete_email_identity()
        .email_identity(identity_name)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed to delete SES identity \"{}\": {}",
                identity_name,
                DisplayErrorContext(&e)
            )
        })?;

    Ok(())
}
