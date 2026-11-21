use crate::aws_client::build_sdk_config;
use crate::route53::{
    check_dkim_records_in_list, list_dns_records, load_all_zones_across_profiles,
    match_domain_in_zones, upsert_dkim_cname_records, DnsRecordDto,
};
use aws_sdk_sesv2::error::{DisplayErrorContext, ProvideErrorMetadata};
use aws_sdk_sesv2::Client;
use serde::Serialize;
use std::collections::HashMap;

fn format_aws_err<E: ProvideErrorMetadata + std::error::Error>(err: &E) -> String {
    match (err.code(), err.message()) {
        (Some(code), Some(msg)) => format!("{}: {}", code, msg),
        (None, Some(msg)) => msg.to_string(),
        _ => format!("{}", DisplayErrorContext(err)),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SesIdentityDto {
    pub identity_name: String,
    pub identity_type: String,
    pub type_label: String,
    pub verification_status: String,
    pub dkim_status: String,
    pub dkim_tokens: Vec<String>,
    pub dkim_records_published: bool,
    pub sending_enabled: bool,
    pub matched_zone_id: Option<String>,
    pub matched_zone_name: Option<String>,
    pub matched_zone_profile: Option<String>,
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
            .map_err(|e| format!("Failed to load SES identities: {}", format_aws_err(&e)))?;

        raw_identities.extend(resp.email_identities().iter().cloned());
        next_token = resp.next_token().map(|s| s.to_string());
        if next_token.is_none() {
            break;
        }
    }

    let has_domains = raw_identities
        .iter()
        .any(|i| i.identity_type().map(|t| t.as_str()) == Some("DOMAIN"));
    let all_zones = if has_domains {
        load_all_zones_across_profiles(profile).await
    } else {
        Vec::new()
    };

    let mut zone_records_cache: HashMap<String, Vec<DnsRecordDto>> = HashMap::new();
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
        let mut dkim_tokens: Vec<String> = Vec::new();

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
                dkim_tokens = dkim.tokens().to_vec();
            }
        }

        let matched_zone = if identity_type == "DOMAIN" {
            match_domain_in_zones(&identity_name, &all_zones)
        } else {
            None
        };

        let mut dkim_records_published = dkim_status == "SUCCESS";
        if !dkim_records_published && !dkim_tokens.is_empty() {
            if let Some(mz) = &matched_zone {
                let records = if let Some(cached) = zone_records_cache.get(&mz.zone_id) {
                    cached.clone()
                } else {
                    let fetched =
                        list_dns_records(&mz.profile, &mz.zone_id, &mz.zone_name)
                            .await
                            .unwrap_or_default();
                    zone_records_cache.insert(mz.zone_id.clone(), fetched.clone());
                    fetched
                };
                dkim_records_published = check_dkim_records_in_list(
                    &identity_name,
                    &mz.zone_name,
                    &dkim_tokens,
                    &records,
                );
            }
        }

        let type_label = format_type_label(&identity_type).to_string();
        identities.push(SesIdentityDto {
            identity_name,
            identity_type,
            type_label,
            verification_status,
            dkim_status,
            dkim_tokens,
            dkim_records_published,
            sending_enabled: item.sending_enabled(),
            matched_zone_id: matched_zone.as_ref().map(|z| z.zone_id.clone()),
            matched_zone_name: matched_zone.as_ref().map(|z| z.zone_name.clone()),
            matched_zone_profile: matched_zone.as_ref().map(|z| z.profile.clone()),
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

    let resp = client
        .create_email_identity()
        .email_identity(trimmed)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed to create SES identity \"{}\": {}",
                trimmed,
                format_aws_err(&e)
            )
        })?;

    // If this is a domain identity and we own its Route53 hosted zone, automatically publish the DKIM CNAME records
    if !trimmed.contains('@') {
        let mut tokens: Vec<String> = resp
            .dkim_attributes()
            .map(|d| d.tokens().to_vec())
            .unwrap_or_default();

        if tokens.is_empty() {
            if let Ok(detail) = client
                .get_email_identity()
                .email_identity(trimmed)
                .send()
                .await
            {
                if let Some(dkim) = detail.dkim_attributes() {
                    tokens = dkim.tokens().to_vec();
                }
            }
        }

        if !tokens.is_empty() {
            let all_zones = load_all_zones_across_profiles(profile).await;
            if let Some(matched) = match_domain_in_zones(trimmed, &all_zones) {
                if let Ok(count) = upsert_dkim_cname_records(
                    &matched.profile,
                    &matched.zone_id,
                    trimmed,
                    &tokens,
                )
                .await
                {
                    return Ok(format!(
                        "Created SES domain \"{}\" and automatically published {} DKIM CNAME records to Route53 zone \"{}\" ({}).",
                        trimmed, count, matched.zone_name, matched.profile
                    ));
                }
            }
        }
    }

    Ok(format!("Created SES identity \"{}\".", trimmed))
}

pub async fn publish_ses_dkim_records(
    profile: &str,
    domain: &str,
    dkim_tokens: Vec<String>,
) -> Result<String, String> {
    let trimmed = domain.trim();
    if trimmed.is_empty() {
        return Err("Domain name is required.".to_string());
    }

    let mut tokens = dkim_tokens;
    if tokens.is_empty() {
        let config = build_sdk_config(profile, None).await?;
        let client = Client::new(&config);
        let detail = client
            .get_email_identity()
            .email_identity(trimmed)
            .send()
            .await
            .map_err(|e| {
                format!(
                    "Failed to fetch DKIM tokens for \"{}\": {}",
                    trimmed,
                    format_aws_err(&e)
                )
            })?;
        tokens = detail
            .dkim_attributes()
            .map(|d| d.tokens().to_vec())
            .unwrap_or_default();
    }

    if tokens.is_empty() {
        return Err(format!(
            "No Easy DKIM tokens found for domain \"{}\".",
            trimmed
        ));
    }

    let all_zones = load_all_zones_across_profiles(profile).await;
    let matched = match_domain_in_zones(trimmed, &all_zones).ok_or_else(|| {
        format!(
            "No matching Route53 hosted zone found for \"{}\" in any configured AWS account.",
            trimmed
        )
    })?;

    let count =
        upsert_dkim_cname_records(&matched.profile, &matched.zone_id, trimmed, &tokens).await?;

    Ok(format!(
        "Published {} DKIM CNAME records for \"{}\" to Route53 zone \"{}\" ({}).",
        count, trimmed, matched.zone_name, matched.profile
    ))
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
                format_aws_err(&e)
            )
        })?;

    Ok(())
}
