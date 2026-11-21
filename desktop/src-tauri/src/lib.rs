mod aws_client;
mod ec2;
mod iam;
mod profiles;
mod route53;
mod s3;
mod ses;
mod ses_smtp;

use ec2::{AddRuleInput, Ec2InstanceDto, ElasticIpDto, InboundRuleDto, SecurityGroupDto};
use iam::{BucketIamUserDto, CreatedIamUserDto};
use profiles::{AccountInput, AwsProfile};
use route53::{DnsRecordDto, HostedZoneDto, RecordInput};
use s3::{BucketDto, S3ObjectDto};
use ses::SesIdentityDto;
use ses_smtp::{CreatedSesSenderKeyDto, SesSenderKeyUserDto, SmtpTestSendInput};

#[tauri::command]
fn list_profiles() -> Result<Vec<AwsProfile>, String> {
    profiles::get_aws_profiles()
}

#[tauri::command]
fn add_profile(input: AccountInput) -> Result<Vec<AwsProfile>, String> {
    profiles::add_aws_profile(input)
}

#[tauri::command]
fn update_profile(original_profile: String, input: AccountInput) -> Result<Vec<AwsProfile>, String> {
    profiles::update_aws_profile(&original_profile, input)
}

#[tauri::command]
fn remove_profile(profile_name: String) -> Result<Vec<AwsProfile>, String> {
    profiles::remove_aws_profile(&profile_name)
}

#[tauri::command]
async fn list_hosted_zones(profile: String) -> Result<Vec<HostedZoneDto>, String> {
    route53::list_hosted_zones(&profile).await
}

#[tauri::command]
async fn list_dns_records(
    profile: String,
    zone_id: String,
    zone_name: String,
) -> Result<Vec<DnsRecordDto>, String> {
    route53::list_dns_records(&profile, &zone_id, &zone_name).await
}

#[tauri::command]
async fn create_dns_record(
    profile: String,
    zone_id: String,
    zone_name: String,
    record: RecordInput,
) -> Result<(), String> {
    route53::create_dns_record(&profile, &zone_id, &zone_name, record).await
}

#[tauri::command]
async fn delete_dns_record(
    profile: String,
    zone_id: String,
    zone_name: String,
    record: RecordInput,
) -> Result<(), String> {
    route53::delete_dns_record(&profile, &zone_id, &zone_name, record).await
}

#[tauri::command]
async fn list_security_groups(profile: String) -> Result<Vec<SecurityGroupDto>, String> {
    ec2::list_security_groups(&profile).await
}

#[tauri::command]
async fn list_inbound_rules(
    profile: String,
    group_id: String,
) -> Result<Vec<InboundRuleDto>, String> {
    ec2::list_inbound_rules(&profile, &group_id).await
}

#[tauri::command]
async fn add_inbound_rule(
    profile: String,
    group_id: String,
    rule: AddRuleInput,
) -> Result<(), String> {
    ec2::add_inbound_rule(&profile, &group_id, rule).await
}

#[tauri::command]
async fn delete_inbound_rule(
    profile: String,
    group_id: String,
    rule_id: String,
) -> Result<(), String> {
    ec2::delete_inbound_rule(&profile, &group_id, &rule_id).await
}

#[tauri::command]
async fn list_ec2_instances(profile: String) -> Result<Vec<Ec2InstanceDto>, String> {
    ec2::list_ec2_instances(&profile).await
}

#[tauri::command]
async fn reboot_ec2_instance(profile: String, instance_id: String) -> Result<String, String> {
    ec2::reboot_ec2_instance(&profile, &instance_id).await
}

#[tauri::command]
async fn start_ec2_instance(profile: String, instance_id: String) -> Result<String, String> {
    ec2::start_ec2_instance(&profile, &instance_id).await
}

#[tauri::command]
async fn stop_ec2_instance(profile: String, instance_id: String) -> Result<String, String> {
    ec2::stop_ec2_instance(&profile, &instance_id).await
}

#[tauri::command]
async fn set_ec2_reboot_lock(
    profile: String,
    instance_id: String,
    locked: bool,
) -> Result<String, String> {
    ec2::set_ec2_reboot_lock(&profile, &instance_id, locked).await
}

#[tauri::command]
async fn list_elastic_ips(profile: String) -> Result<Vec<ElasticIpDto>, String> {
    ec2::list_elastic_ips(&profile).await
}

#[tauri::command]
async fn allocate_elastic_ip(
    profile: String,
    name: Option<String>,
) -> Result<ElasticIpDto, String> {
    ec2::allocate_elastic_ip(&profile, name).await
}

#[tauri::command]
async fn associate_elastic_ip(
    profile: String,
    allocation_id: String,
    instance_id: String,
) -> Result<String, String> {
    ec2::associate_elastic_ip(&profile, &allocation_id, &instance_id).await
}

#[tauri::command]
async fn disassociate_elastic_ip(
    profile: String,
    association_id: String,
) -> Result<String, String> {
    ec2::disassociate_elastic_ip(&profile, &association_id).await
}

#[tauri::command]
async fn release_elastic_ip(profile: String, allocation_id: String) -> Result<String, String> {
    ec2::release_elastic_ip(&profile, &allocation_id).await
}

#[tauri::command]
async fn list_buckets(profile: String) -> Result<Vec<BucketDto>, String> {
    s3::list_buckets(&profile).await
}

#[tauri::command]
async fn create_bucket(
    profile: String,
    bucket_name: String,
    region: Option<String>,
) -> Result<String, String> {
    s3::create_bucket(&profile, &bucket_name, region.as_deref()).await
}

#[tauri::command]
async fn delete_bucket(profile: String, bucket_name: String) -> Result<(), String> {
    s3::delete_bucket(&profile, &bucket_name).await
}

#[tauri::command]
async fn list_bucket_objects(
    profile: String,
    bucket_name: String,
    prefix: String,
) -> Result<Vec<S3ObjectDto>, String> {
    s3::list_bucket_objects(&profile, &bucket_name, &prefix).await
}

#[tauri::command]
async fn upload_object(
    profile: String,
    bucket_name: String,
    local_path: String,
    key: String,
) -> Result<String, String> {
    s3::upload_object(&profile, &bucket_name, &local_path, &key).await
}

#[tauri::command]
async fn download_object(
    profile: String,
    bucket_name: String,
    key: String,
    destination_path: String,
) -> Result<String, String> {
    s3::download_object(&profile, &bucket_name, &key, &destination_path).await
}

#[tauri::command]
async fn delete_object(
    profile: String,
    bucket_name: String,
    key: String,
) -> Result<(), String> {
    s3::delete_object(&profile, &bucket_name, &key).await
}

#[tauri::command]
async fn get_bucket_region(profile: String, bucket_name: String) -> Result<String, String> {
    s3::get_bucket_region(&profile, &bucket_name).await
}

#[tauri::command]
async fn create_bucket_iam_users(
    profile: String,
    bucket_name: String,
    access_mode: String,
    custom_user_name: String,
) -> Result<Vec<CreatedIamUserDto>, String> {
    iam::create_bucket_iam_users(&profile, &bucket_name, &access_mode, &custom_user_name).await
}

#[tauri::command]
async fn list_bucket_iam_users(
    profile: String,
    bucket_name: String,
) -> Result<Vec<BucketIamUserDto>, String> {
    iam::list_bucket_iam_users(&profile, &bucket_name).await
}

#[tauri::command]
async fn create_bucket_iam_user(
    profile: String,
    bucket_name: String,
    role: String,
    custom_user_name: String,
) -> Result<CreatedIamUserDto, String> {
    iam::create_bucket_iam_user(&profile, &bucket_name, &role, &custom_user_name).await
}

#[tauri::command]
async fn recreate_bucket_iam_user(
    profile: String,
    bucket_name: String,
    user_name: String,
    role: String,
) -> Result<CreatedIamUserDto, String> {
    iam::recreate_bucket_iam_user(&profile, &bucket_name, &user_name, &role).await
}

#[tauri::command]
async fn revoke_bucket_iam_user(profile: String, user_name: String) -> Result<(), String> {
    iam::revoke_bucket_iam_user(&profile, &user_name).await
}

#[tauri::command]
async fn list_ses_identities(profile: String) -> Result<Vec<SesIdentityDto>, String> {
    ses::list_ses_identities(&profile).await
}

#[tauri::command]
async fn create_ses_identity(profile: String, identity_name: String) -> Result<String, String> {
    ses::create_ses_identity(&profile, &identity_name).await
}

#[tauri::command]
async fn resend_ses_verification_email(
    profile: String,
    identity_name: String,
) -> Result<String, String> {
    ses::resend_ses_verification_email(&profile, &identity_name).await
}

#[tauri::command]
async fn publish_ses_dkim_records(
    profile: String,
    domain: String,
    dkim_tokens: Vec<String>,
) -> Result<String, String> {
    ses::publish_ses_dkim_records(&profile, &domain, dkim_tokens).await
}

#[tauri::command]
async fn publish_ses_mx_record(profile: String, domain: String) -> Result<String, String> {
    ses::publish_ses_mx_record(&profile, &domain).await
}

#[tauri::command]
async fn delete_ses_identity(profile: String, identity_name: String) -> Result<(), String> {
    ses::delete_ses_identity(&profile, &identity_name).await
}

#[tauri::command]
async fn list_ses_sender_keys(
    profile: String,
    identity_name: String,
) -> Result<Vec<SesSenderKeyUserDto>, String> {
    ses_smtp::list_ses_sender_keys(&profile, &identity_name).await
}

#[tauri::command]
async fn create_ses_sender_key(
    profile: String,
    identity_name: String,
    custom_user_name: String,
) -> Result<CreatedSesSenderKeyDto, String> {
    ses_smtp::create_ses_sender_key(&profile, &identity_name, &custom_user_name).await
}

#[tauri::command]
async fn recreate_ses_sender_key(
    profile: String,
    identity_name: String,
    user_name: String,
) -> Result<CreatedSesSenderKeyDto, String> {
    ses_smtp::recreate_ses_sender_key(&profile, &identity_name, &user_name).await
}

#[tauri::command]
async fn revoke_ses_sender_key(profile: String, user_name: String) -> Result<(), String> {
    ses_smtp::revoke_ses_sender_key(&profile, &user_name).await
}

#[tauri::command]
async fn test_ses_smtp_send(input: SmtpTestSendInput) -> Result<String, String> {
    ses_smtp::test_ses_smtp_send(input).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_profiles,
            add_profile,
            update_profile,
            remove_profile,
            list_hosted_zones,
            list_dns_records,
            create_dns_record,
            delete_dns_record,
            list_security_groups,
            list_inbound_rules,
            add_inbound_rule,
            delete_inbound_rule,
            list_ec2_instances,
            reboot_ec2_instance,
            start_ec2_instance,
            stop_ec2_instance,
            set_ec2_reboot_lock,
            list_elastic_ips,
            allocate_elastic_ip,
            associate_elastic_ip,
            disassociate_elastic_ip,
            release_elastic_ip,
            list_buckets,
            create_bucket,
            delete_bucket,
            list_bucket_objects,
            upload_object,
            download_object,
            delete_object,
            get_bucket_region,
            create_bucket_iam_users,
            list_bucket_iam_users,
            create_bucket_iam_user,
            recreate_bucket_iam_user,
            revoke_bucket_iam_user,
            list_ses_identities,
            create_ses_identity,
            resend_ses_verification_email,
            publish_ses_dkim_records,
            publish_ses_mx_record,
            delete_ses_identity,
            list_ses_sender_keys,
            create_ses_sender_key,
            recreate_ses_sender_key,
            revoke_ses_sender_key,
            test_ses_smtp_send
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
