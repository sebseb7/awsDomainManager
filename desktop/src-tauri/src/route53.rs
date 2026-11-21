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

fn full_record_name(name: &str, zone_name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed == "@" {
        zone_name.to_string()
    } else {
        format!("{}.{}", trimmed, zone_name)
    }
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
