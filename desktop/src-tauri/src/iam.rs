use crate::aws_client::build_sdk_config;
use aws_sdk_iam::types::Tag;
use aws_sdk_iam::Client;
use serde::Serialize;
use serde_json::json;

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
                    bucket_name, user_name, e
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
                    bucket_name, user_name, e
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
                    bucket_name, user_name, e
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
