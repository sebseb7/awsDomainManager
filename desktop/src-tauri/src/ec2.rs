use crate::aws_client::build_sdk_config;
use aws_sdk_ec2::types::{DomainType, Filter, IpPermission, IpRange, Tag};
use aws_sdk_ec2::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ec2InstanceDto {
    pub instance_id: String,
    pub name: String,
    pub state: String,
    pub instance_type: String,
    pub availability_zone: String,
    pub public_ip: String,
    pub private_ip: String,
    pub ipv6_address: String,
    pub elastic_ip: Option<String>,
    pub elastic_ip_allocation_id: Option<String>,
    pub vpc_id: String,
    pub subnet_id: String,
    pub key_name: String,
    pub architecture: String,
    pub platform: String,
    pub launch_time: String,
    pub security_groups: Vec<String>,
    pub reboot_lock: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElasticIpDto {
    pub allocation_id: String,
    pub public_ip: String,
    pub name: String,
    pub association_id: Option<String>,
    pub instance_id: Option<String>,
    pub instance_name: Option<String>,
    pub private_ip: String,
    pub network_interface_id: String,
    pub domain: String,
    pub public_ipv4_pool: String,
    pub network_border_group: String,
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

fn find_tag_value(tags: &[Tag], key: &str) -> Option<String> {
    tags.iter()
        .find(|t| t.key().map(|k| k.eq_ignore_ascii_case(key)).unwrap_or(false))
        .and_then(|t| t.value())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn is_reboot_locked_from_tags(tags: &[Tag]) -> bool {
    for key in ["RebootLock", "aws-domain-manager:reboot-lock"] {
        if let Some(val) = find_tag_value(tags, key) {
            let lower = val.to_ascii_lowercase();
            if lower == "true" || lower == "1" || lower == "yes" || lower == "locked" {
                return true;
            }
        }
    }
    false
}

pub async fn list_ec2_instances(profile: &str) -> Result<Vec<Ec2InstanceDto>, String> {
    let config = build_sdk_config(profile, None).await?;
    let client = Client::new(&config);

    let inst_resp = client
        .describe_instances()
        .send()
        .await
        .map_err(|e| format!("Failed to load EC2 instances: {}", e))?;

    // Map instance_id -> (public_ip, allocation_id) from Elastic IPs if permission allows
    let mut eip_by_instance: HashMap<String, (String, String)> = HashMap::new();
    let mut eip_by_public_ip: HashMap<String, String> = HashMap::new();
    if let Ok(addr_resp) = client.describe_addresses().send().await {
        for addr in addr_resp.addresses() {
            let pub_ip = addr.public_ip().unwrap_or_default().to_string();
            let alloc_id = addr.allocation_id().unwrap_or_default().to_string();
            if !pub_ip.is_empty() && !alloc_id.is_empty() {
                eip_by_public_ip.insert(pub_ip.clone(), alloc_id.clone());
            }
            if let Some(inst_id) = addr.instance_id() {
                if !inst_id.is_empty() && !pub_ip.is_empty() {
                    eip_by_instance.insert(inst_id.to_string(), (pub_ip, alloc_id));
                }
            }
        }
    }

    let mut instances = Vec::new();
    for reservation in inst_resp.reservations() {
        for inst in reservation.instances() {
            let instance_id = inst.instance_id().unwrap_or_default().to_string();
            if instance_id.is_empty() {
                continue;
            }
            let tags = inst.tags();
            let name = find_tag_value(tags, "Name").unwrap_or_else(|| "-".to_string());
            let reboot_lock = is_reboot_locked_from_tags(tags);
            let state = inst
                .state()
                .and_then(|s| s.name())
                .map(|n| n.as_str().to_string())
                .unwrap_or_else(|| "unknown".to_string());
            let instance_type = inst
                .instance_type()
                .map(|t| t.as_str().to_string())
                .unwrap_or_else(|| "-".to_string());
            let availability_zone = inst
                .placement()
                .and_then(|p| p.availability_zone())
                .unwrap_or("-")
                .to_string();
            let public_ip = inst.public_ip_address().unwrap_or("-").to_string();
            let private_ip = inst.private_ip_address().unwrap_or("-").to_string();
            let ipv6_address = inst
                .ipv6_address()
                .map(|s| s.to_string())
                .or_else(|| {
                    inst.network_interfaces()
                        .iter()
                        .flat_map(|ni| ni.ipv6_addresses())
                        .find_map(|ip| ip.ipv6_address().map(|s| s.to_string()))
                })
                .unwrap_or_else(|| "-".to_string());

            let (elastic_ip, elastic_ip_allocation_id) =
                if let Some((eip, alloc)) = eip_by_instance.get(&instance_id) {
                    (Some(eip.clone()), Some(alloc.clone()))
                } else if public_ip != "-" {
                    if let Some(alloc) = eip_by_public_ip.get(&public_ip) {
                        (Some(public_ip.clone()), Some(alloc.clone()))
                    } else {
                        (None, None)
                    }
                } else {
                    (None, None)
                };

            let vpc_id = inst.vpc_id().unwrap_or("-").to_string();
            let subnet_id = inst.subnet_id().unwrap_or("-").to_string();
            let key_name = inst.key_name().unwrap_or("-").to_string();
            let architecture = inst
                .architecture()
                .map(|a| a.as_str().to_string())
                .unwrap_or_else(|| "-".to_string());
            let platform = inst.platform_details().unwrap_or("Linux/UNIX").to_string();
            let launch_time = inst
                .launch_time()
                .map(|t| t.to_string())
                .unwrap_or_else(|| "-".to_string());
            let security_groups = inst
                .security_groups()
                .iter()
                .map(|g| {
                    let gname = g.group_name().unwrap_or("-");
                    let gid = g.group_id().unwrap_or("-");
                    format!("{} ({})", gname, gid)
                })
                .collect();

            instances.push(Ec2InstanceDto {
                instance_id,
                name,
                state,
                instance_type,
                availability_zone,
                public_ip,
                private_ip,
                ipv6_address,
                elastic_ip,
                elastic_ip_allocation_id,
                vpc_id,
                subnet_id,
                key_name,
                architecture,
                platform,
                launch_time,
                security_groups,
                reboot_lock,
            });
        }
    }

    instances.sort_by(|a, b| {
        let rank = |s: &str| match s {
            "running" => 0,
            "pending" | "rebooting" => 1,
            "stopping" => 2,
            "stopped" => 3,
            _ => 4,
        };
        rank(&a.state)
            .cmp(&rank(&b.state))
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.instance_id.cmp(&b.instance_id))
    });

    Ok(instances)
}

async fn ensure_instance_not_reboot_locked(
    client: &Client,
    instance_id: &str,
    action_label: &str,
) -> Result<(), String> {
    let resp = client
        .describe_instances()
        .instance_ids(instance_id)
        .send()
        .await
        .map_err(|e| format!("Failed to inspect instance {}: {}", instance_id, e))?;

    for res in resp.reservations() {
        for inst in res.instances() {
            if is_reboot_locked_from_tags(inst.tags()) {
                return Err(format!(
                    "Instance {} has Reboot Lock enabled. Unlock it before attempting to {}.",
                    instance_id, action_label
                ));
            }
        }
    }
    Ok(())
}

pub async fn reboot_ec2_instance(profile: &str, instance_id: &str) -> Result<String, String> {
    let config = build_sdk_config(profile, None).await?;
    let client = Client::new(&config);

    ensure_instance_not_reboot_locked(&client, instance_id, "reboot").await?;

    client
        .reboot_instances()
        .instance_ids(instance_id)
        .send()
        .await
        .map_err(|e| format!("Failed to reboot instance {}: {}", instance_id, e))?;

    Ok(format!("Reboot initiated for EC2 instance {}.", instance_id))
}

pub async fn start_ec2_instance(profile: &str, instance_id: &str) -> Result<String, String> {
    let config = build_sdk_config(profile, None).await?;
    let client = Client::new(&config);

    client
        .start_instances()
        .instance_ids(instance_id)
        .send()
        .await
        .map_err(|e| format!("Failed to start instance {}: {}", instance_id, e))?;

    Ok(format!("Start initiated for EC2 instance {}.", instance_id))
}

pub async fn stop_ec2_instance(profile: &str, instance_id: &str) -> Result<String, String> {
    let config = build_sdk_config(profile, None).await?;
    let client = Client::new(&config);

    ensure_instance_not_reboot_locked(&client, instance_id, "stop").await?;

    client
        .stop_instances()
        .instance_ids(instance_id)
        .send()
        .await
        .map_err(|e| format!("Failed to stop instance {}: {}", instance_id, e))?;

    Ok(format!("Stop initiated for EC2 instance {}.", instance_id))
}

pub async fn set_ec2_reboot_lock(
    profile: &str,
    instance_id: &str,
    locked: bool,
) -> Result<String, String> {
    let config = build_sdk_config(profile, None).await?;
    let client = Client::new(&config);

    if locked {
        let tag = Tag::builder().key("RebootLock").value("true").build();
        client
            .create_tags()
            .resources(instance_id)
            .tags(tag)
            .send()
            .await
            .map_err(|e| format!("Failed to enable Reboot Lock on {}: {}", instance_id, e))?;
        Ok(format!(
            "Reboot Lock enabled for instance {} (Tag RebootLock=true).",
            instance_id
        ))
    } else {
        let tag1 = Tag::builder().key("RebootLock").build();
        let tag2 = Tag::builder().key("aws-domain-manager:reboot-lock").build();
        client
            .delete_tags()
            .resources(instance_id)
            .tags(tag1)
            .tags(tag2)
            .send()
            .await
            .map_err(|e| format!("Failed to disable Reboot Lock on {}: {}", instance_id, e))?;
        Ok(format!("Reboot Lock disabled for instance {}.", instance_id))
    }
}

pub async fn list_elastic_ips(profile: &str) -> Result<Vec<ElasticIpDto>, String> {
    let config = build_sdk_config(profile, None).await?;
    let client = Client::new(&config);

    let addr_resp = client
        .describe_addresses()
        .send()
        .await
        .map_err(|e| format!("Failed to load Elastic IPs: {}", e))?;

    let mut instance_names: HashMap<String, String> = HashMap::new();
    if let Ok(inst_resp) = client.describe_instances().send().await {
        for res in inst_resp.reservations() {
            for inst in res.instances() {
                if let Some(id) = inst.instance_id() {
                    if let Some(name) = find_tag_value(inst.tags(), "Name") {
                        instance_names.insert(id.to_string(), name);
                    }
                }
            }
        }
    }

    let mut eips: Vec<ElasticIpDto> = addr_resp
        .addresses()
        .iter()
        .map(|addr| {
            let allocation_id = addr.allocation_id().unwrap_or("-").to_string();
            let public_ip = addr.public_ip().unwrap_or("-").to_string();
            let name = find_tag_value(addr.tags(), "Name").unwrap_or_else(|| "-".to_string());
            let association_id = addr
                .association_id()
                .map(|s| s.to_string())
                .filter(|s| !s.is_empty());
            let instance_id = addr
                .instance_id()
                .map(|s| s.to_string())
                .filter(|s| !s.is_empty());
            let instance_name = instance_id
                .as_ref()
                .and_then(|id| instance_names.get(id).cloned());
            let private_ip = addr.private_ip_address().unwrap_or("-").to_string();
            let network_interface_id = addr.network_interface_id().unwrap_or("-").to_string();
            let domain = addr
                .domain()
                .map(|d| d.as_str().to_string())
                .unwrap_or_else(|| "vpc".to_string());
            let public_ipv4_pool = addr.public_ipv4_pool().unwrap_or("amazon").to_string();
            let network_border_group = addr.network_border_group().unwrap_or("-").to_string();

            ElasticIpDto {
                allocation_id,
                public_ip,
                name,
                association_id,
                instance_id,
                instance_name,
                private_ip,
                network_interface_id,
                domain,
                public_ipv4_pool,
                network_border_group,
            }
        })
        .collect();

    eips.sort_by(|a, b| a.public_ip.cmp(&b.public_ip));

    Ok(eips)
}

pub async fn allocate_elastic_ip(
    profile: &str,
    name: Option<String>,
) -> Result<ElasticIpDto, String> {
    let config = build_sdk_config(profile, None).await?;
    let client = Client::new(&config);

    let resp = client
        .allocate_address()
        .domain(DomainType::Vpc)
        .send()
        .await
        .map_err(|e| format!("Failed to allocate Elastic IP: {}", e))?;

    let allocation_id = resp.allocation_id().unwrap_or_default().to_string();
    let public_ip = resp.public_ip().unwrap_or_default().to_string();
    let clean_name = name
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty());

    if let Some(ref tag_name) = clean_name {
        if !allocation_id.is_empty() {
            let tag = Tag::builder().key("Name").value(tag_name).build();
            let _ = client
                .create_tags()
                .resources(&allocation_id)
                .tags(tag)
                .send()
                .await;
        }
    }

    Ok(ElasticIpDto {
        allocation_id,
        public_ip,
        name: clean_name.unwrap_or_else(|| "-".to_string()),
        association_id: None,
        instance_id: None,
        instance_name: None,
        private_ip: "-".to_string(),
        network_interface_id: "-".to_string(),
        domain: "vpc".to_string(),
        public_ipv4_pool: resp.public_ipv4_pool().unwrap_or("amazon").to_string(),
        network_border_group: resp.network_border_group().unwrap_or("-").to_string(),
    })
}

pub async fn associate_elastic_ip(
    profile: &str,
    allocation_id: &str,
    instance_id: &str,
) -> Result<String, String> {
    let config = build_sdk_config(profile, None).await?;
    let client = Client::new(&config);

    let resp = client
        .associate_address()
        .allocation_id(allocation_id)
        .instance_id(instance_id)
        .allow_reassociation(true)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed to associate Elastic IP {} with {}: {}",
                allocation_id, instance_id, e
            )
        })?;

    let assoc_id = resp.association_id().unwrap_or("-");
    Ok(format!(
        "Associated Elastic IP ({}) with instance {} ({}).",
        allocation_id, instance_id, assoc_id
    ))
}

pub async fn disassociate_elastic_ip(
    profile: &str,
    association_id: &str,
) -> Result<String, String> {
    let config = build_sdk_config(profile, None).await?;
    let client = Client::new(&config);

    client
        .disassociate_address()
        .association_id(association_id)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed to disassociate Elastic IP ({}): {}",
                association_id, e
            )
        })?;

    Ok(format!(
        "Disassociated Elastic IP (association {}).",
        association_id
    ))
}

pub async fn release_elastic_ip(profile: &str, allocation_id: &str) -> Result<String, String> {
    let config = build_sdk_config(profile, None).await?;
    let client = Client::new(&config);

    client
        .release_address()
        .allocation_id(allocation_id)
        .send()
        .await
        .map_err(|e| format!("Failed to release Elastic IP {}: {}", allocation_id, e))?;

    Ok(format!("Released Elastic IP {}.", allocation_id))
}
