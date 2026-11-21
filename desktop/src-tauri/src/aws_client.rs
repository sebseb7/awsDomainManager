use crate::profiles::get_profile_by_name;
use aws_config::BehaviorVersion;
use aws_credential_types::Credentials;
use aws_types::region::Region;
use aws_types::SdkConfig;

pub async fn build_sdk_config(
    profile_name: &str,
    region_override: Option<&str>,
) -> Result<SdkConfig, String> {
    let profile = get_profile_by_name(profile_name)?;
    let region_str = region_override
        .filter(|r| !r.trim().is_empty())
        .map(|r| r.trim().to_string())
        .unwrap_or_else(|| {
            if profile.region.trim().is_empty() {
                "us-east-1".to_string()
            } else {
                profile.region.clone()
            }
        });

    let session_token = if profile.session_token.trim().is_empty() {
        None
    } else {
        Some(profile.session_token.clone())
    };

    let credentials = Credentials::new(
        profile.access_key_id,
        profile.secret_access_key,
        session_token,
        None,
        "aws-domain-manager",
    );

    let config = aws_config::defaults(BehaviorVersion::latest())
        .region(Region::new(region_str))
        .credentials_provider(credentials)
        .load()
        .await;

    Ok(config)
}
