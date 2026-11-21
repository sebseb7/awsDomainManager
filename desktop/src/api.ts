import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import type {
  AccountInput,
  AddRuleInput,
  AuthStatus,
  AwsProfile,
  BucketIamUser,
  CreatedIamUser,
  CreatedSesSenderKey,
  DnsRecord,
  Ec2Instance,
  ElasticIp,
  HostedZone,
  InboundRule,
  S3Bucket,
  S3Object,
  SecurityGroup,
  SesIdentity,
  SesSenderKeyUser,
  SmtpTestSendInput,
} from './types';

export const api = {
  // PIN-Encrypted Auth Vault & Profiles
  getAuthStatus: () => invoke<AuthStatus>('get_auth_status'),
  unlockWithPin: (pin: string) => invoke<AwsProfile[]>('unlock_with_pin', { pin }),
  lockAuthSession: () => invoke<AuthStatus>('lock_auth_session'),
  listProfiles: () => invoke<AwsProfile[]>('list_profiles'),
  addProfile: (input: AccountInput) => invoke<AwsProfile[]>('add_profile', { input }),
  updateProfile: (originalProfile: string, input: AccountInput) =>
    invoke<AwsProfile[]>('update_profile', { originalProfile, input }),
  removeProfile: (profileName: string) =>
    invoke<AwsProfile[]>('remove_profile', { profileName }),

  // Route53
  listHostedZones: (profile: string) =>
    invoke<HostedZone[]>('list_hosted_zones', { profile }),
  listDnsRecords: (profile: string, zoneId: string, zoneName: string) =>
    invoke<DnsRecord[]>('list_dns_records', { profile, zoneId, zoneName }),
  createDnsRecord: (profile: string, zoneId: string, zoneName: string, record: DnsRecord) =>
    invoke<void>('create_dns_record', { profile, zoneId, zoneName, record }),
  deleteDnsRecord: (profile: string, zoneId: string, zoneName: string, record: DnsRecord) =>
    invoke<void>('delete_dns_record', { profile, zoneId, zoneName, record }),

  // EC2 Security Groups
  listSecurityGroups: (profile: string) =>
    invoke<SecurityGroup[]>('list_security_groups', { profile }),
  listInboundRules: (profile: string, groupId: string) =>
    invoke<InboundRule[]>('list_inbound_rules', { profile, groupId }),
  addInboundRule: (profile: string, groupId: string, rule: AddRuleInput) =>
    invoke<void>('add_inbound_rule', { profile, groupId, rule }),
  deleteInboundRule: (profile: string, groupId: string, ruleId: string) =>
    invoke<void>('delete_inbound_rule', { profile, groupId, ruleId }),

  // EC2 Instances & Elastic IPs
  listEc2Instances: (profile: string) =>
    invoke<Ec2Instance[]>('list_ec2_instances', { profile }),
  rebootEc2Instance: (profile: string, instanceId: string) =>
    invoke<string>('reboot_ec2_instance', { profile, instanceId }),
  startEc2Instance: (profile: string, instanceId: string) =>
    invoke<string>('start_ec2_instance', { profile, instanceId }),
  stopEc2Instance: (profile: string, instanceId: string) =>
    invoke<string>('stop_ec2_instance', { profile, instanceId }),
  setEc2RebootLock: (profile: string, instanceId: string, locked: boolean) =>
    invoke<string>('set_ec2_reboot_lock', { profile, instanceId, locked }),
  listElasticIps: (profile: string) =>
    invoke<ElasticIp[]>('list_elastic_ips', { profile }),
  allocateElasticIp: (profile: string, name?: string) =>
    invoke<ElasticIp>('allocate_elastic_ip', {
      profile,
      name: name?.trim() ? name.trim() : null,
    }),
  associateElasticIp: (profile: string, allocationId: string, instanceId: string) =>
    invoke<string>('associate_elastic_ip', { profile, allocationId, instanceId }),
  disassociateElasticIp: (profile: string, associationId: string) =>
    invoke<string>('disassociate_elastic_ip', { profile, associationId }),
  releaseElasticIp: (profile: string, allocationId: string) =>
    invoke<string>('release_elastic_ip', { profile, allocationId }),
  updateElasticIpReverseDns: (profile: string, allocationId: string, domainName: string) =>
    invoke<string>('update_elastic_ip_reverse_dns', { profile, allocationId, domainName }),
  resetElasticIpReverseDns: (profile: string, allocationId: string) =>
    invoke<string>('reset_elastic_ip_reverse_dns', { profile, allocationId }),

  // S3 & IAM
  listBuckets: (profile: string) => invoke<S3Bucket[]>('list_buckets', { profile }),
  createBucket: (profile: string, bucketName: string, region?: string) =>
    invoke<string>('create_bucket', {
      profile,
      bucketName,
      region: region?.trim() ? region.trim() : null,
    }),
  deleteBucket: (profile: string, bucketName: string) =>
    invoke<void>('delete_bucket', { profile, bucketName }),
  listBucketObjects: (profile: string, bucketName: string, prefix: string) =>
    invoke<S3Object[]>('list_bucket_objects', { profile, bucketName, prefix }),
  uploadObject: (profile: string, bucketName: string, localPath: string, key: string) =>
    invoke<string>('upload_object', { profile, bucketName, localPath, key }),
  downloadObject: (
    profile: string,
    bucketName: string,
    key: string,
    destinationPath: string
  ) => invoke<string>('download_object', { profile, bucketName, key, destinationPath }),
  deleteObject: (profile: string, bucketName: string, key: string) =>
    invoke<void>('delete_object', { profile, bucketName, key }),
  getBucketRegion: (profile: string, bucketName: string) =>
    invoke<string>('get_bucket_region', { profile, bucketName }),
  createBucketIamUsers: (
    profile: string,
    bucketName: string,
    accessMode: string,
    customUserName: string
  ) =>
    invoke<CreatedIamUser[]>('create_bucket_iam_users', {
      profile,
      bucketName,
      accessMode,
      customUserName,
    }),
  listBucketIamUsers: (profile: string, bucketName: string) =>
    invoke<BucketIamUser[]>('list_bucket_iam_users', { profile, bucketName }),
  createBucketIamUser: (
    profile: string,
    bucketName: string,
    role: 'put-only' | 'read-only',
    customUserName: string
  ) =>
    invoke<CreatedIamUser>('create_bucket_iam_user', {
      profile,
      bucketName,
      role,
      customUserName,
    }),
  recreateBucketIamUser: (
    profile: string,
    bucketName: string,
    userName: string,
    role: 'put-only' | 'read-only'
  ) =>
    invoke<CreatedIamUser>('recreate_bucket_iam_user', {
      profile,
      bucketName,
      userName,
      role,
    }),
  revokeBucketIamUser: (profile: string, userName: string) =>
    invoke<void>('revoke_bucket_iam_user', { profile, userName }),

  // Amazon SES
  listSesIdentities: (profile: string) =>
    invoke<SesIdentity[]>('list_ses_identities', { profile }),
  createSesIdentity: (profile: string, identityName: string) =>
    invoke<string>('create_ses_identity', { profile, identityName }),
  resendSesVerificationEmail: (profile: string, identityName: string) =>
    invoke<string>('resend_ses_verification_email', { profile, identityName }),
  publishSesDkimRecords: (profile: string, domain: string, dkimTokens: string[] = []) =>
    invoke<string>('publish_ses_dkim_records', { profile, domain, dkimTokens }),
  publishSesMxRecord: (profile: string, domain: string) =>
    invoke<string>('publish_ses_mx_record', { profile, domain }),
  deleteSesIdentity: (profile: string, identityName: string) =>
    invoke<void>('delete_ses_identity', { profile, identityName }),
  listSesSenderKeys: (profile: string, identityName: string) =>
    invoke<SesSenderKeyUser[]>('list_ses_sender_keys', { profile, identityName }),
  createSesSenderKey: (profile: string, identityName: string, customUserName: string) =>
    invoke<CreatedSesSenderKey>('create_ses_sender_key', {
      profile,
      identityName,
      customUserName,
    }),
  recreateSesSenderKey: (profile: string, identityName: string, userName: string) =>
    invoke<CreatedSesSenderKey>('recreate_ses_sender_key', {
      profile,
      identityName,
      userName,
    }),
  revokeSesSenderKey: (profile: string, userName: string) =>
    invoke<void>('revoke_ses_sender_key', { profile, userName }),
  testSesSmtpSend: (input: SmtpTestSendInput) =>
    invoke<string>('test_ses_smtp_send', { input }),

  // Native file dialogs
  pickUploadFile: async (): Promise<string | null> => {
    const selected = await open({ multiple: false, directory: false });
    return typeof selected === 'string' ? selected : null;
  },
  pickDownloadPath: async (defaultFileName: string): Promise<string | null> => {
    const selected = await save({ defaultPath: defaultFileName });
    return typeof selected === 'string' ? selected : null;
  },
};

export const formatBytes = (bytes: number | null): string => {
  if (bytes === null || Number.isNaN(bytes)) return '-';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, idx);
  return idx === 0 ? `${bytes} B` : `${val.toFixed(1)} ${units[idx]}`;
};

export const formatDate = (iso: string): string => {
  if (!iso || iso === '-') return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace('T', ' ');
  return d.toISOString().slice(0, 16).replace('T', ' ');
};

export const maskSecret = (val: string): string => {
  if (!val) return '(not set)';
  if (val.length <= 8) return '••••••••';
  return `${val.slice(0, 4)}••••${val.slice(-4)}`;
};
