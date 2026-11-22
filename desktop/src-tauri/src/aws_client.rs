use crate::profiles::get_profile_by_name;
use aws_config::BehaviorVersion;
use aws_credential_types::Credentials;
use aws_sdk_s3::error::{DisplayErrorContext, ProvideErrorMetadata};
use aws_types::region::Region;
use aws_types::SdkConfig;

/// Formats an AWS SDK error with its error code, message, or full error context.
pub fn format_aws_err<E: ProvideErrorMetadata + std::error::Error>(err: &E) -> String {
    match (err.code(), err.message()) {
        (Some(code), Some(msg)) => format!("{}: {}", code, msg),
        (Some(code), None) => format!("{}: {}", code, DisplayErrorContext(err)),
        (None, Some(msg)) => msg.to_string(),
        (None, None) => format!("{}", DisplayErrorContext(err)),
    }
}

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

#[cfg(test)]
mod tests {
    use super::format_aws_err;
    use aws_sdk_s3::error::ErrorMetadata;
    use aws_sdk_s3::operation::create_bucket::CreateBucketError;

    #[test]
    fn formats_code_and_message_without_generic_service_error() {
        let err = CreateBucketError::generic(
            ErrorMetadata::builder()
                .code("BucketAlreadyExists")
                .message("The requested bucket name is not available.")
                .build(),
        );
        assert_eq!(
            format_aws_err(&err),
            "BucketAlreadyExists: The requested bucket name is not available."
        );
    }

    #[test]
    fn formats_code_even_when_message_is_missing() {
        let err = CreateBucketError::generic(
            ErrorMetadata::builder()
                .code("AccessDenied")
                .build(),
        );
        let formatted = format_aws_err(&err);
        assert!(formatted.starts_with("AccessDenied: "));
    }

    #[test]
    fn formats_message_when_code_is_missing() {
        let err = CreateBucketError::generic(
            ErrorMetadata::builder()
                .message("Something went wrong")
                .build(),
        );
        assert_eq!(format_aws_err(&err), "Something went wrong");
    }
}
