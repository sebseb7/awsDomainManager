use crate::aws_client::{build_sdk_config, format_aws_err};
use crate::route53::{
    check_dkim_records_in_list, check_dmarc_record_in_list, check_ses_mx_record_in_list,
    extract_domain_from_identity, find_mx_record_in_list, list_dns_records,
    load_all_zones_across_profiles, match_domain_in_zones, ses_inbound_mx_value,
    upsert_ses_dns_records, upsert_ses_mx_record, DnsRecordDto,
};
use aws_sdk_sesv2::error::ProvideErrorMetadata;
use aws_sdk_sesv2::Client;
use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SesIdentityDto {
    pub identity_name: String,
    pub identity_type: String,
    pub type_label: String,
    pub domain: String,
    pub verification_status: String,
    pub dkim_status: String,
    pub dkim_tokens: Vec<String>,
    pub dkim_records_published: bool,
    pub dmarc_record_published: bool,
    pub dns_records_published: bool,
    pub mx_record_published: bool,
    pub mx_record_value: String,
    pub mx_existing_value: Option<String>,
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
    let ses_region = config
        .region()
        .map(|r| r.as_ref().to_string())
        .unwrap_or_else(|| "us-east-1".to_string());
    let mx_record_value = ses_inbound_mx_value(&ses_region);
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

    let all_zones = if !raw_identities.is_empty() {
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
        let domain = extract_domain_from_identity(&identity_name);
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

        let matched_zone = match_domain_in_zones(&domain, &all_zones);

        let mut dkim_records_published = identity_type != "DOMAIN" || dkim_status == "SUCCESS";
        let mut dmarc_record_published = false;
        let mut mx_record_published = false;
        let mut mx_existing_value: Option<String> = None;

        if let Some(mz) = &matched_zone {
            let records = if let Some(cached) = zone_records_cache.get(&mz.zone_id) {
                cached.clone()
            } else {
                let fetched = list_dns_records(&mz.profile, &mz.zone_id, &mz.zone_name)
                    .await
                    .unwrap_or_default();
                zone_records_cache.insert(mz.zone_id.clone(), fetched.clone());
                fetched
            };

            if !dkim_records_published && !dkim_tokens.is_empty() {
                dkim_records_published = check_dkim_records_in_list(
                    &domain,
                    &mz.zone_name,
                    &dkim_tokens,
                    &records,
                );
            }
            dmarc_record_published = check_dmarc_record_in_list(&domain, &mz.zone_name, &records);
            if identity_type == "DOMAIN" {
                mx_existing_value = find_mx_record_in_list(&domain, &mz.zone_name, &records);
                mx_record_published =
                    check_ses_mx_record_in_list(&domain, &mz.zone_name, &ses_region, &records);
            }
        }

        let dns_records_published = if identity_type == "DOMAIN" {
            dkim_records_published && dmarc_record_published
        } else {
            dmarc_record_published && (dkim_tokens.is_empty() || dkim_records_published)
        };

        let type_label = format_type_label(&identity_type).to_string();
        identities.push(SesIdentityDto {
            identity_name,
            identity_type,
            type_label,
            domain,
            verification_status,
            dkim_status,
            dkim_tokens,
            dkim_records_published,
            dmarc_record_published,
            dns_records_published,
            mx_record_published,
            mx_record_value: mx_record_value.clone(),
            mx_existing_value,
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

    let domain = extract_domain_from_identity(trimmed);
    let mut tokens: Vec<String> = resp
        .dkim_attributes()
        .map(|d| d.tokens().to_vec())
        .unwrap_or_default();

    if tokens.is_empty() && !trimmed.contains('@') {
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

    let email_hint = if trimmed.contains('@') {
        " Check the inbox for the verification email and click the provided link."
    } else {
        ""
    };

    let all_zones = load_all_zones_across_profiles(profile).await;
    if let Some(matched) = match_domain_in_zones(&domain, &all_zones) {
        let existing_records =
            list_dns_records(&matched.profile, &matched.zone_id, &matched.zone_name)
                .await
                .unwrap_or_default();
        let need_dmarc = !check_dmarc_record_in_list(&domain, &matched.zone_name, &existing_records);

        if !tokens.is_empty() || need_dmarc {
            if let Ok(count) = upsert_ses_dns_records(
                &matched.profile,
                &matched.zone_id,
                &domain,
                &tokens,
                need_dmarc,
            )
            .await
            {
                return Ok(format!(
                    "Created SES identity \"{}\" and automatically published {} DNS record{} (DKIM/DMARC) to Route53 zone \"{}\" ({}).{}",
                    trimmed,
                    count,
                    if count == 1 { "" } else { "s" },
                    matched.zone_name,
                    matched.profile,
                    email_hint
                ));
            }
        }
    }

    Ok(format!("Created SES identity \"{}\".{}", trimmed, email_hint))
}

pub async fn resend_ses_verification_email(
    profile: &str,
    identity_name: &str,
) -> Result<String, String> {
    let trimmed = identity_name.trim();
    if trimmed.is_empty() || !trimmed.contains('@') {
        return Err(
            "Verification emails can only be resent for email address identities.".to_string(),
        );
    }

    let config = build_sdk_config(profile, None).await?;
    let client = Client::new(&config);

    let mut config_set_name: Option<String> = None;
    let mut tags = Vec::new();

    if let Ok(detail) = client
        .get_email_identity()
        .email_identity(trimmed)
        .send()
        .await
    {
        if detail.identity_type().map(|t| t.as_str()) == Some("DOMAIN") {
            return Err(
                "Verification emails can only be resent for email address identities.".to_string(),
            );
        }
        if detail.verification_status().map(|s| s.as_str()) == Some("SUCCESS") {
            return Ok(format!("SES identity \"{}\" is already verified.", trimmed));
        }
        config_set_name = detail.configuration_set_name().map(|s| s.to_string());
        tags = detail.tags().to_vec();
    }

    if let Err(err) = client
        .delete_email_identity()
        .email_identity(trimmed)
        .send()
        .await
    {
        if err.code() != Some("NotFoundException") {
            return Err(format!(
                "Failed to reset pending SES identity \"{}\": {}",
                trimmed,
                format_aws_err(&err)
            ));
        }
    }

    let mut last_err: Option<String> = None;
    for attempt in 0..2 {
        let mut req = client.create_email_identity().email_identity(trimmed);
        if let Some(ref cs) = config_set_name {
            req = req.configuration_set_name(cs);
        }
        if !tags.is_empty() {
            req = req.set_tags(Some(tags.clone()));
        }

        match req.send().await {
            Ok(_) => {
                return Ok(format!(
                    "Verification email resent to \"{}\". Check the inbox and click the provided link.",
                    trimmed
                ));
            }
            Err(err) => {
                if attempt == 0 && err.code() == Some("AlreadyExistsException") {
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    continue;
                }
                last_err = Some(format_aws_err(&err));
                break;
            }
        }
    }

    Err(format!(
        "Failed to resend verification email to \"{}\": {}",
        trimmed,
        last_err.unwrap_or_else(|| "Unknown error".to_string())
    ))
}

pub async fn publish_ses_dkim_records(
    profile: &str,
    domain: &str,
    dkim_tokens: Vec<String>,
) -> Result<String, String> {
    let trimmed = domain.trim();
    if trimmed.is_empty() {
        return Err("Identity or domain name is required.".to_string());
    }
    let clean_domain = extract_domain_from_identity(trimmed);

    let mut tokens = dkim_tokens;
    if tokens.is_empty() && !trimmed.contains('@') {
        let config = build_sdk_config(profile, None).await?;
        let client = Client::new(&config);
        if let Ok(detail) = client
            .get_email_identity()
            .email_identity(trimmed)
            .send()
            .await
        {
            tokens = detail
                .dkim_attributes()
                .map(|d| d.tokens().to_vec())
                .unwrap_or_default();
        }
    }

    let all_zones = load_all_zones_across_profiles(profile).await;
    let matched = match_domain_in_zones(&clean_domain, &all_zones).ok_or_else(|| {
        format!(
            "No matching Route53 hosted zone found for \"{}\" in any configured AWS account.",
            clean_domain
        )
    })?;

    let existing_records =
        list_dns_records(&matched.profile, &matched.zone_id, &matched.zone_name)
            .await
            .unwrap_or_default();
    let need_dmarc =
        !check_dmarc_record_in_list(&clean_domain, &matched.zone_name, &existing_records);
    let include_dmarc = need_dmarc || tokens.is_empty();

    let count = upsert_ses_dns_records(
        &matched.profile,
        &matched.zone_id,
        &clean_domain,
        &tokens,
        include_dmarc,
    )
    .await?;

    Ok(format!(
        "Published {} SES DNS record{} (DKIM/DMARC) for \"{}\" to Route53 zone \"{}\" ({}).",
        count,
        if count == 1 { "" } else { "s" },
        clean_domain,
        matched.zone_name,
        matched.profile
    ))
}

pub async fn publish_ses_mx_record(profile: &str, domain: &str) -> Result<String, String> {
    let trimmed = domain.trim();
    if trimmed.is_empty() || trimmed.contains('@') {
        return Err("Inbound MX records can only be published for SES domain identities.".to_string());
    }
    let clean_domain = extract_domain_from_identity(trimmed);
    let config = build_sdk_config(profile, None).await?;
    let ses_region = config
        .region()
        .map(|r| r.as_ref().to_string())
        .unwrap_or_else(|| "us-east-1".to_string());

    let all_zones = load_all_zones_across_profiles(profile).await;
    let matched = match_domain_in_zones(&clean_domain, &all_zones).ok_or_else(|| {
        format!(
            "No matching Route53 hosted zone found for \"{}\" in any configured AWS account.",
            clean_domain
        )
    })?;

    let mx_value = upsert_ses_mx_record(
        &matched.profile,
        &matched.zone_id,
        &clean_domain,
        &ses_region,
    )
    .await?;

    Ok(format!(
        "Published SES inbound MX record ({}) for \"{}\" to Route53 zone \"{}\" ({}).",
        mx_value, clean_domain, matched.zone_name, matched.profile
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
