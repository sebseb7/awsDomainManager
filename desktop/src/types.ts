export interface AwsProfile {
  id: string;
  name: string;
  profile: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
}

export interface AccountInput {
  profile: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
}

export interface HostedZone {
  id: string;
  name: string;
  recordCount: number;
  isPrivate: boolean;
}

export interface DnsRecord {
  name: string;
  type: string;
  value: string;
  ttl: number;
}

export interface SecurityGroup {
  groupId: string;
  groupName: string;
  description: string;
  vpcId: string;
}

export interface InboundRule {
  id: string;
  type: string;
  protocol: string;
  port: string;
  fromPort: number | null;
  toPort: number | null;
  source: string;
  description: string;
}

export interface AddRuleInput {
  protocol: string;
  fromPort: number | null;
  toPort: number | null;
  source: string;
  description: string;
}

export interface S3Bucket {
  name: string;
  creationDate: string;
}

export interface S3Object {
  key: string;
  displayName: string;
  isFolder: boolean;
  size: number | null;
  lastModified: string;
}

export interface CreatedIamUser {
  bucketName: string;
  userName: string;
  role: string;
  roleLabel: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface IamAccessKeyMeta {
  accessKeyId: string;
  status: string;
  createDate: string;
  lastUsedDate?: string;
}

export interface BucketIamUser {
  bucketName: string;
  userName: string;
  role: 'put-only' | 'read-only';
  roleLabel: string;
  createdAt: string;
  lastUsedAt?: string;
  accessKeys: IamAccessKeyMeta[];
}

export interface SesIdentity {
  identityName: string;
  identityType: 'DOMAIN' | 'EMAIL_ADDRESS' | 'MANAGED_DOMAIN' | string;
  typeLabel: string;
  verificationStatus: string;
  dkimStatus: string;
  dkimTokens?: string[];
  sendingEnabled: boolean;
  matchedZoneId?: string | null;
  matchedZoneName?: string | null;
  matchedZoneProfile?: string | null;
}

export type NavSection = 'route53' | 'ec2' | 's3' | 'ses' | 'accounts';
