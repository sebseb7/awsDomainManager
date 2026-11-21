use crate::aws_client::build_sdk_config;
use aws_sdk_ec2::types::{Filter, IpPermission, IpRange};
use aws_sdk_ec2::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityGroupDto {
    pub group_id: String,
    pub group_name: String,
    pub description: String,
    pub vpc_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboundRuleDto {
    pub id: String,
    #[serde(rename = "type")]
    pub rule_type: String,
    pub protocol: String,
    pub port: String,
    pub from_port: Option<i32>,
    pub to_port: Option<i32>,
    pub source: String,
    pub description: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddRuleInput {
    pub protocol: String,
    pub from_port: Option<i32>,
    pub to_port: Option<i32>,
    pub source: String,
    pub description: Option<String>,
}

fn format_port_range(from_port: Option<i32>, to_port: Option<i32>) -> String {
    match (from_port, to_port) {
        (Some(-1), _) | (None, None) => "All".to_string(),
        (Some(f), Some(t)) if f == t => f.to_string(),
        (Some(f), None) => f.to_string(),
        (Some(f), Some(t)) => format!("{} - {}", f, t),
        (None, Some(t)) => t.to_string(),
    }
}

fn get_protocol_name(protocol: Option<&str>) -> String {
    match protocol {
        Some("tcp") | Some("6") => "TCP".to_string(),
        Some("udp") | Some("17") => "UDP".to_string(),
        Some("icmp") | Some("1") => "ICMP".to_string(),
        Some("-1") | None => "All".to_string(),
        Some("50") => "ESP".to_string(),
        Some("51") => "AH".to_string(),
        Some(other) => other.to_uppercase(),
    }
}

pub async fn list_security_groups(profile: &str) -> Result<Vec<SecurityGroupDto>, String> {
    let config = build_sdk_config(profile, None).await?;
    let client = Client::new(&config);

    let resp = client
        .describe_security_groups()
        .send()
        .await
        .map_err(|e| format!("Failed to load security groups: {}", e))?;

    let groups = resp
        .security_groups()
        .iter()
        .map(|g| SecurityGroupDto {
            group_id: g.group_id().unwrap_or_default().to_string(),
            group_name: g.group_name().unwrap_or_default().to_string(),
            description: g.description().unwrap_or_default().to_string(),
            vpc_id: g.vpc_id().unwrap_or("-").to_string(),
        })
        .collect();

    Ok(groups)
}

pub async fn list_inbound_rules(
    profile: &str,
    group_id: &str,
) -> Result<Vec<InboundRuleDto>, String> {
    let config = build_sdk_config(profile, None).await?;
    let client = Client::new(&config);

    let filter = Filter::builder()
        .name("group-id")
        .values(group_id)
        .build();

    let resp = client
        .describe_security_group_rules()
        .filters(filter)
        .max_results(1000)
        .send()
        .await
        .map_err(|e| format!("Failed to load inbound rules: {}", e))?;

    let rules = resp
        .security_group_rules()
        .iter()
        .filter(|r| !r.is_egress().unwrap_or(false))
        .map(|r| {
            let source = r
                .cidr_ipv4()
                .or_else(|| r.cidr_ipv6())
                .or_else(|| r.referenced_group_info().and_then(|g| g.group_id()))
                .unwrap_or("N/A")
                .to_string();

            InboundRuleDto {
                id: r.security_group_rule_id().unwrap_or_default().to_string(),
                rule_type: get_protocol_name(r.ip_protocol()),
                protocol: r.ip_protocol().unwrap_or("-1").to_string(),
                port: format_port_range(r.from_port(), r.to_port()),
                from_port: r.from_port(),
                to_port: r.to_port(),
                source,
                description: r.description().unwrap_or("-").to_string(),
            }
        })
        .collect();

    Ok(rules)
}

pub async fn add_inbound_rule(
    profile: &str,
    group_id: &str,
    rule: AddRuleInput,
) -> Result<(), String> {
    let config = build_sdk_config(profile, None).await?;
    let client = Client::new(&config);

    let protocol = if rule.protocol.trim().is_empty() {
        "tcp".to_string()
    } else {
        rule.protocol.trim().to_string()
    };

    let cidr = if rule.source.trim().is_empty() {
        "0.0.0.0/0".to_string()
    } else {
        rule.source.trim().to_string()
    };

    let mut ip_range_builder = IpRange::builder().cidr_ip(cidr);
    if let Some(desc) = rule.description {
        if !desc.trim().is_empty() {
            ip_range_builder = ip_range_builder.description(desc.trim());
        }
    }

    let mut perm_builder = IpPermission::builder()
        .ip_protocol(protocol)
        .ip_ranges(ip_range_builder.build());

    if let Some(from_p) = rule.from_port {
        perm_builder = perm_builder.from_port(from_p);
    }
    if let Some(to_p) = rule.to_port {
        perm_builder = perm_builder.to_port(to_p);
    }

    client
        .authorize_security_group_ingress()
        .group_id(group_id)
        .ip_permissions(perm_builder.build())
        .send()
        .await
        .map_err(|e| format!("Failed to add inbound rule: {}", e))?;

    Ok(())
}

pub async fn delete_inbound_rule(
    profile: &str,
    group_id: &str,
    rule_id: &str,
) -> Result<(), String> {
    let config = build_sdk_config(profile, None).await?;
    let client = Client::new(&config);

    client
        .revoke_security_group_ingress()
        .group_id(group_id)
        .security_group_rule_ids(rule_id)
        .send()
        .await
        .map_err(|e| format!("Failed to delete inbound rule: {}", e))?;

    Ok(())
}
