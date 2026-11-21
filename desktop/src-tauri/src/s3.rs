use crate::aws_client::build_sdk_config;
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::types::{BucketLocationConstraint, CreateBucketConfiguration};
use aws_sdk_s3::Client;
use serde::Serialize;
use std::path::Path;
use tokio::fs;
use tokio::io::AsyncWriteExt;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BucketDto {
    pub name: String,
    pub creation_date: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct S3ObjectDto {
    pub key: String,
    pub display_name: String,
    pub is_folder: bool,
    pub size: Option<i64>,
    pub last_modified: String,
}

pub fn validate_bucket_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Bucket name is required.".to_string());
    }
    if trimmed.len() < 3 || trimmed.len() > 63 {
        return Err("Bucket name must be between 3 and 63 characters.".to_string());
    }
    let bytes = trimmed.as_bytes();
    let first = bytes[0] as char;
    let last = bytes[bytes.len() - 1] as char;
    if !first.is_ascii_lowercase() && !first.is_ascii_digit() {
        return Err("Bucket name must start with a lowercase letter or number.".to_string());
    }
    if !last.is_ascii_lowercase() && !last.is_ascii_digit() {
        return Err("Bucket name must end with a lowercase letter or number.".to_string());
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '-')
    {
        return Err(
            "Bucket name must use lowercase letters, numbers, dots, or hyphens.".to_string(),
        );
    }
    if trimmed.contains("..") {
        return Err("Bucket name cannot contain consecutive periods.".to_string());
    }
    let parts: Vec<&str> = trimmed.split('.').collect();
    if parts.len() == 4 && parts.iter().all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit())) {
        return Err("Bucket name cannot be formatted as an IP address.".to_string());
    }
    Ok(trimmed.to_string())
}

pub async fn get_bucket_region(profile: &str, bucket_name: &str) -> Result<String, String> {
    let base_config = build_sdk_config(profile, None).await?;
    let fallback_region = base_config
        .region()
        .map(|r| r.as_ref().to_string())
        .unwrap_or_else(|| "us-east-1".to_string());
    let base_client = Client::new(&base_config);

    if let Ok(loc) = base_client
        .get_bucket_location()
        .bucket(bucket_name)
        .send()
        .await
    {
        let region_str = match loc.location_constraint() {
            Some(c) if !c.as_str().is_empty() => {
                if c.as_str() == "EU" {
                    "eu-west-1".to_string()
                } else {
                    c.as_str().to_string()
                }
            }
            _ => "us-east-1".to_string(),
        };
        return Ok(region_str);
    }

    Ok(fallback_region)
}

async fn client_for_bucket(profile: &str, bucket_name: &str) -> Result<Client, String> {
    let base_config = build_sdk_config(profile, None).await?;
    let base_client = Client::new(&base_config);

    if let Ok(loc) = base_client.get_bucket_location().bucket(bucket_name).send().await {
        let region_str = match loc.location_constraint() {
            Some(c) if !c.as_str().is_empty() => {
                if c.as_str() == "EU" {
                    "eu-west-1".to_string()
                } else {
                    c.as_str().to_string()
                }
            }
            _ => "us-east-1".to_string(),
        };
        let regional_config = build_sdk_config(profile, Some(&region_str)).await?;
        return Ok(Client::new(&regional_config));
    }

    Ok(base_client)
}

pub async fn list_buckets(profile: &str) -> Result<Vec<BucketDto>, String> {
    let config = build_sdk_config(profile, None).await?;
    let client = Client::new(&config);

    let resp = client
        .list_buckets()
        .send()
        .await
        .map_err(|e| format!("Failed to load S3 buckets: {}", e))?;

    let mut buckets: Vec<BucketDto> = resp
        .buckets()
        .iter()
        .map(|b| BucketDto {
            name: b.name().unwrap_or_default().to_string(),
            creation_date: b
                .creation_date()
                .map(|d| d.to_string())
                .unwrap_or_else(|| "-".to_string()),
        })
        .collect();

    buckets.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(buckets)
}

pub async fn create_bucket(
    profile: &str,
    bucket_name: &str,
    region: Option<&str>,
) -> Result<String, String> {
    let valid_name = validate_bucket_name(bucket_name)?;
    let config = build_sdk_config(profile, region).await?;
    let resolved_region = config
        .region()
        .map(|r| r.as_ref().to_string())
        .unwrap_or_else(|| "us-east-1".to_string());
    let client = Client::new(&config);

    let mut req = client.create_bucket().bucket(&valid_name);
    if resolved_region != "us-east-1" {
        let cfg = CreateBucketConfiguration::builder()
            .location_constraint(BucketLocationConstraint::from(resolved_region.as_str()))
            .build();
        req = req.create_bucket_configuration(cfg);
    }

    req.send()
        .await
        .map_err(|e| format!("Failed to create bucket: {}", e))?;

    Ok(valid_name)
}

pub async fn delete_bucket(profile: &str, bucket_name: &str) -> Result<(), String> {
    let client = client_for_bucket(profile, bucket_name).await?;
    client
        .delete_bucket()
        .bucket(bucket_name)
        .send()
        .await
        .map_err(|e| format!("Failed to delete bucket: {}", e))?;
    Ok(())
}

pub async fn list_bucket_objects(
    profile: &str,
    bucket_name: &str,
    prefix: &str,
) -> Result<Vec<S3ObjectDto>, String> {
    let client = client_for_bucket(profile, bucket_name).await?;

    let resp = client
        .list_objects_v2()
        .bucket(bucket_name)
        .prefix(prefix)
        .delimiter("/")
        .max_keys(500)
        .send()
        .await
        .map_err(|e| format!("Failed to load objects: {}", e))?;

    let mut items = Vec::new();

    for cp in resp.common_prefixes() {
        if let Some(p) = cp.prefix() {
            let display = p.strip_prefix(prefix).unwrap_or(p).to_string();
            items.push(S3ObjectDto {
                key: p.to_string(),
                display_name: display,
                is_folder: true,
                size: None,
                last_modified: "-".to_string(),
            });
        }
    }

    for obj in resp.contents() {
        if let Some(k) = obj.key() {
            if k == prefix {
                continue;
            }
            let display = k.strip_prefix(prefix).unwrap_or(k).to_string();
            items.push(S3ObjectDto {
                key: k.to_string(),
                display_name: display,
                is_folder: false,
                size: obj.size(),
                last_modified: obj
                    .last_modified()
                    .map(|d| d.to_string())
                    .unwrap_or_else(|| "-".to_string()),
            });
        }
    }

    Ok(items)
}

pub async fn upload_object(
    profile: &str,
    bucket_name: &str,
    local_path: &str,
    key: &str,
) -> Result<String, String> {
    let path = Path::new(local_path);
    if !path.exists() || !path.is_file() {
        return Err(format!("File not found: {}", local_path));
    }

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid local file name.".to_string())?;

    let trimmed_key = key.trim();
    let final_key = if trimmed_key.is_empty() {
        file_name.to_string()
    } else if trimmed_key.ends_with('/') {
        format!("{}{}", trimmed_key, file_name)
    } else {
        trimmed_key.to_string()
    };

    let body = ByteStream::from_path(path)
        .await
        .map_err(|e| format!("Failed to read local file: {}", e))?;

    let client = client_for_bucket(profile, bucket_name).await?;
    client
        .put_object()
        .bucket(bucket_name)
        .key(&final_key)
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Failed to upload object: {}", e))?;

    Ok(final_key)
}

pub async fn download_object(
    profile: &str,
    bucket_name: &str,
    key: &str,
    destination_path: &str,
) -> Result<String, String> {
    let dest = Path::new(destination_path);
    if let Some(parent) = dest.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create destination directory: {}", e))?;
        }
    }

    let client = client_for_bucket(profile, bucket_name).await?;
    let mut resp = client
        .get_object()
        .bucket(bucket_name)
        .key(key)
        .send()
        .await
        .map_err(|e| format!("Failed to download object: {}", e))?;

    let mut file = fs::File::create(dest)
        .await
        .map_err(|e| format!("Failed to create destination file: {}", e))?;

    while let Some(bytes) = resp
        .body
        .try_next()
        .await
        .map_err(|e| format!("Failed reading S3 stream: {}", e))?
    {
        file.write_all(&bytes)
            .await
            .map_err(|e| format!("Failed writing local file: {}", e))?;
    }

    file.flush()
        .await
        .map_err(|e| format!("Failed flushing local file: {}", e))?;

    Ok(destination_path.to_string())
}

pub async fn delete_object(profile: &str, bucket_name: &str, key: &str) -> Result<(), String> {
    let client = client_for_bucket(profile, bucket_name).await?;
    client
        .delete_object()
        .bucket(bucket_name)
        .key(key)
        .send()
        .await
        .map_err(|e| format!("Failed to delete object: {}", e))?;
    Ok(())
}
