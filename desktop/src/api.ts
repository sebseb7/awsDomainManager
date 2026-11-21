import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import type {
  AccountInput,
  AddRuleInput,
  AwsProfile,
  BucketIamUser,
  CreatedIamUser,
  DnsRecord,
  HostedZone,
  InboundRule,
  S3Bucket,
  S3Object,
  SecurityGroup,
  SesIdentity,
} from './types';

export const api = {
  // Profiles
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
  deleteSesIdentity: (profile: string, identityName: string) =>
    invoke<void>('delete_ses_identity', { profile, identityName }),

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
