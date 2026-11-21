use crate::aws_client::build_sdk_config;
use aws_sdk_route53::types::{
    Change, ChangeAction, ChangeBatch, ResourceRecord, ResourceRecordSet, RrType,
};
use aws_sdk_route53::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostedZoneDto {
    pub id: String,
    pub name: String,
    pub record_count: i64,
    pub is_private: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsRecordDto {
    pub name: String,
    #[serde(rename = "type")]
    pub record_type: String,
    pub value: String,
    pub ttl: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordInput {
    pub name: String,
    #[serde(rename = "type")]
    pub record_type: String,
    pub value: String,
    pub ttl: i64,
}

fn format_record_name(record_name: &str, zone_name: &str) -> String {
    let mut name = record_name.trim_end_matches('.').to_string();
    let normalized_zone = zone_name.trim_end_matches('.');
    if name.ends_with(normalized_zone) {
        let new_len = name.len().saturating_sub(normalized_zone.len());
        name.truncate(new_len);
        if name.ends_with('.') {
            name.pop();
        }
    }
    if name.is_empty() {
        "@".to_string()
    } else {
        name
    }
}

pub fn full_record_name(name: &str, zone_name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed == "@" {
        zone_name.to_string()
    } else {
        format!("{}.{}", trimmed, zone_name)
    }
}

pub fn extract_domain_from_identity(identity: &str) -> String {
    let trimmed = identity.trim().trim_end_matches('.');
    if let Some((_, domain)) = trimmed.rsplit_once('@') {
        domain.to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn check_dmarc_record_in_list(
    domain: &str,
    zone_name: &str,
    records: &[DnsRecordDto],
) -> bool {
    let clean_domain = extract_domain_from_identity(domain).to_ascii_lowercase();
    if clean_domain.is_empty() {
        return false;
    }
    let expected_fqdn = format!("_dmarc.{}", clean_domain);
    records.iter().any(|r| {
        r.record_type == "TXT"
            && full_record_name(&r.name, zone_name)
                .trim_end_matches('.')
                .to_ascii_lowercase()
                == expected_fqdn
            && r.value.to_ascii_lowercase().contains("v=dmarc1")
    })
}

pub fn check_dkim_records_in_list(
    domain: &str,
    zone_name: &str,
    dkim_tokens: &[String],
    records: &[DnsRecordDto],
) -> bool {
    if dkim_tokens.is_empty() {
        return false;
    }
    let clean_domain = extract_domain_from_identity(domain).to_ascii_lowercase();
    dkim_tokens.iter().all(|token| {
        let trimmed_token = token.trim().to_ascii_lowercase();
        if trimmed_token.is_empty() {
            return false;
        }
        let expected_fqdn = format!("{}._domainkey.{}", trimmed_token, clean_domain);
        records.iter().any(|r| {
            r.record_type == "CNAME"
                && full_record_name(&r.name, zone_name)
                    .trim_end_matches('.')
                    .to_ascii_lowercase()
                    == expected_fqdn
        })
    })
}

pub async fn list_hosted_zones(profile: &str) -> Result<Vec<HostedZoneDto>, String> {
    let config = build_sdk_config(profile, Some("us-east-1")).await?;
    let client = Client::new(&config);

    let resp = client
        .list_hosted_zones()
        .send()
        .await
        .map_err(|e| format!("Failed to load hosted zones: {}", e))?;

    let zones = resp
        .hosted_zones()
        .iter()
        .map(|z| HostedZoneDto {
            id: z.id().to_string(),
            name: z.name().to_string(),
            record_count: z.resource_record_set_count().unwrap_or(0),
            is_private: z.config().map(|c| c.private_zone()).unwrap_or(false),
        })
        .collect();

    Ok(zones)
}

pub async fn list_dns_records(
    profile: &str,
    zone_id: &str,
    zone_name: &str,
) -> Result<Vec<DnsRecordDto>, String> {
    let config = build_sdk_config(profile, Some("us-east-1")).await?;
    let client = Client::new(&config);

    let resp = client
        .list_resource_record_sets()
        .hosted_zone_id(zone_id)
        .max_items(300)
        .send()
        .await
        .map_err(|e| format!("Failed to load DNS records: {}", e))?;

    let supported = ["A", "AAAA", "CNAME", "MX", "TXT", "NS"];
    let records = resp
        .resource_record_sets()
        .iter()
        .filter(|r| supported.contains(&r.r#type().as_str()))
        .map(|r| {
            let value = r
                .resource_records()
                .iter()
                .map(|rr| rr.value().to_string())
                .collect::<Vec<_>>()
                .join(", ");
            DnsRecordDto {
                name: format_record_name(r.name(), zone_name),
                record_type: r.r#type().as_str().to_string(),
                value,
                ttl: r.ttl().unwrap_or(300),
            }
        })
        .collect();

    Ok(records)
}

pub async fn create_dns_record(
    profile: &str,
    zone_id: &str,
    zone_name: &str,
    record: RecordInput,
) -> Result<(), String> {
    let config = build_sdk_config(profile, Some("us-east-1")).await?;
    let client = Client::new(&config);

    let fqdn = full_record_name(&record.name, zone_name);
    let rr_type = RrType::from(record.record_type.as_str());

    let resource_record = ResourceRecord::builder()
        .value(record.value.trim())
        .build()
        .map_err(|e| format!("Invalid record value: {}", e))?;

    let rrs = ResourceRecordSet::builder()
        .name(fqdn)
        .r#type(rr_type)
        .ttl(record.ttl)
        .resource_records(resource_record)
        .build()
        .map_err(|e| format!("Invalid record set: {}", e))?;

    let change = Change::builder()
        .action(ChangeAction::Create)
        .resource_record_set(rrs)
        .build()
        .map_err(|e| format!("Invalid change: {}", e))?;

    let batch = ChangeBatch::builder()
        .changes(change)
        .build()
        .map_err(|e| format!("Invalid change batch: {}", e))?;

    client
        .change_resource_record_sets()
        .hosted_zone_id(zone_id)
        .change_batch(batch)
        .send()
        .await
        .map_err(|e| format!("Failed to add record: {}", e))?;

    Ok(())
}

pub async fn delete_dns_record(
    profile: &str,
    zone_id: &str,
    zone_name: &str,
    record: RecordInput,
) -> Result<(), String> {
    let config = build_sdk_config(profile, Some("us-east-1")).await?;
    let client = Client::new(&config);

    let fqdn = full_record_name(&record.name, zone_name);
    let rr_type = RrType::from(record.record_type.as_str());

    let mut resource_records = Vec::new();
    for val in record.value.split(", ") {
        let rr = ResourceRecord::builder()
            .value(val)
            .build()
            .map_err(|e| format!("Invalid record value: {}", e))?;
        resource_records.push(rr);
    }

    let rrs = ResourceRecordSet::builder()
        .name(fqdn)
        .r#type(rr_type)
        .ttl(record.ttl)
        .set_resource_records(Some(resource_records))
        .build()
        .map_err(|e| format!("Invalid record set: {}", e))?;

    let change = Change::builder()
        .action(ChangeAction::Delete)
        .resource_record_set(rrs)
        .build()
        .map_err(|e| format!("Invalid change: {}", e))?;

    let batch = ChangeBatch::builder()
        .changes(change)
        .build()
        .map_err(|e| format!("Invalid change batch: {}", e))?;

    client
        .change_resource_record_sets()
        .hosted_zone_id(zone_id)
        .change_batch(batch)
        .send()
        .await
        .map_err(|e| format!("Failed to delete record: {}", e))?;

    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchedZoneInfo {
    pub profile: String,
    pub zone_id: String,
    pub zone_name: String,
}

fn domain_matches_zone(domain: &str, zone_name: &str) -> bool {
    let norm_domain = domain.trim().trim_end_matches('.').to_ascii_lowercase();
    let norm_zone = zone_name.trim().trim_end_matches('.').to_ascii_lowercase();
    if norm_domain.is_empty() || norm_zone.is_empty() {
        return false;
    }
    norm_domain == norm_zone || norm_domain.ends_with(&format!(".{}", norm_zone))
}

pub async fn load_all_zones_across_profiles(
    primary_profile: &str,
) -> Vec<(String, HostedZoneDto)> {
    let mut profiles_to_check = vec![primary_profile.to_string()];
    if let Ok(all_profiles) = crate::profiles::get_aws_profiles() {
        for p in all_profiles {
            if !profiles_to_check.contains(&p.profile) {
                profiles_to_check.push(p.profile);
            }
        }
    }

    let mut all_zones = Vec::new();
    for prof in profiles_to_check {
        if let Ok(zones) = list_hosted_zones(&prof).await {
            for z in zones {
                all_zones.push((prof.clone(), z));
            }
        }
    }
    all_zones
}

pub fn match_domain_in_zones(
    domain: &str,
    zones: &[(String, HostedZoneDto)],
) -> Option<MatchedZoneInfo> {
    let mut best: Option<&(String, HostedZoneDto)> = None;
    for entry in zones {
        let (_, z) = entry;
        if !domain_matches_zone(domain, &z.name) {
            continue;
        }
        match best {
            None => best = Some(entry),
            Some((_, current_best)) => {
                // Prefer public zone over private zone, then longest zone name match
                let best_public = !current_best.is_private;
                let cand_public = !z.is_private;
                if (cand_public && !best_public)
                    || (cand_public == best_public && z.name.len() > current_best.name.len())
                {
                    best = Some(entry);
                }
            }
        }
    }
    best.map(|(prof, z)| MatchedZoneInfo {
        profile: prof.clone(),
        zone_id: z.id.clone(),
        zone_name: z.name.clone(),
    })
}

pub async fn upsert_ses_dns_records(
    zone_profile: &str,
    zone_id: &str,
    domain: &str,
    dkim_tokens: &[String],
    include_dmarc: bool,
) -> Result<usize, String> {
    let config = build_sdk_config(zone_profile, Some("us-east-1")).await?;
    let client = Client::new(&config);
    let clean_domain = extract_domain_from_identity(domain);
    if clean_domain.is_empty() {
        return Err("Domain name cannot be empty.".to_string());
    }

    let mut changes = Vec::new();
    for token in dkim_tokens {
        let trimmed_token = token.trim();
        if trimmed_token.is_empty() {
            continue;
        }
        let record_fqdn = format!("{}._domainkey.{}.", trimmed_token, clean_domain);
        let record_target = format!("{}.dkim.amazonses.com", trimmed_token);

        let rr = ResourceRecord::builder()
            .value(record_target)
            .build()
            .map_err(|e| format!("Invalid DKIM record value: {}", e))?;

        let rrs = ResourceRecordSet::builder()
            .name(record_fqdn)
            .r#type(RrType::Cname)
            .ttl(300)
            .resource_records(rr)
            .build()
            .map_err(|e| format!("Invalid DKIM record set: {}", e))?;

        let change = Change::builder()
            .action(ChangeAction::Upsert)
            .resource_record_set(rrs)
            .build()
            .map_err(|e| format!("Invalid DKIM change: {}", e))?;

        changes.push(change);
    }

    if include_dmarc {
        let dmarc_fqdn = format!("_dmarc.{}.", clean_domain);
        let dmarc_rr = ResourceRecord::builder()
            .value("\"v=DMARC1; p=none;\"")
            .build()
            .map_err(|e| format!("Invalid DMARC record value: {}", e))?;

        let dmarc_rrs = ResourceRecordSet::builder()
            .name(dmarc_fqdn)
            .r#type(RrType::Txt)
            .ttl(300)
            .resource_records(dmarc_rr)
            .build()
            .map_err(|e| format!("Invalid DMARC record set: {}", e))?;

        let dmarc_change = Change::builder()
            .action(ChangeAction::Upsert)
            .resource_record_set(dmarc_rrs)
            .build()
            .map_err(|e| format!("Invalid DMARC change: {}", e))?;

        changes.push(dmarc_change);
    }

    if changes.is_empty() {
        return Err(format!("No DNS records to publish for \"{}\".", clean_domain));
    }

    let count = changes.len();
    let batch = ChangeBatch::builder()
        .set_changes(Some(changes))
        .build()
        .map_err(|e| format!("Invalid DNS change batch: {}", e))?;

    client
        .change_resource_record_sets()
        .hosted_zone_id(zone_id)
        .change_batch(batch)
        .send()
        .await
        .map_err(|e| format!("Failed publishing SES DNS records to Route53: {}", e))?;

    Ok(count)
}
