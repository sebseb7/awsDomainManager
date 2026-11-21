export const DUMMY_PROFILES = [
  {
    id: 'prod-aws',
    name: 'prod-aws',
    profile: 'prod-aws',
    region: 'eu-central-1',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    sessionToken: '',
  },
  {
    id: 'staging-aws',
    name: 'staging-aws',
    profile: 'staging-aws',
    region: 'us-east-1',
    accessKeyId: 'AKIAI44QH8DHBEXAMPLE',
    secretAccessKey: 'je7MtGbClwBF/2Zp9Utk/h3yCo8nvbEXAMPLEKEY',
    sessionToken: '',
  },
];

export const DUMMY_HOSTED_ZONES = [
  {
    id: 'Z0123456789ABCDEF',
    name: 'example.com.',
    recordCount: 6,
    isPrivate: false,
  },
  {
    id: 'Z0987654321FEDCBA',
    name: 'internal.example.local.',
    recordCount: 3,
    isPrivate: true,
  },
];

export const DUMMY_DNS_RECORDS = [
  { name: 'example.com.', type: 'A', value: '203.0.113.10', ttl: 300 },
  { name: 'api.example.com.', type: 'A', value: '203.0.113.25', ttl: 60 },
  { name: 'app.example.com.', type: 'CNAME', value: 'd111111abcdef8.cloudfront.net', ttl: 300 },
  { name: 'example.com.', type: 'MX', value: '10 mail.example.com.', ttl: 3600 },
  { name: 'example.com.', type: 'TXT', value: '"v=spf1 include:_spf.example.com ~all"', ttl: 300 },
  { name: 'ipv6.example.com.', type: 'AAAA', value: '2001:db8::1', ttl: 300 },
];

export const DUMMY_SECURITY_GROUPS = [
  {
    groupId: 'sg-0a1b2c3d4e5f60001',
    groupName: 'prod-web-sg',
    description: 'Public HTTPS and SSH bastion access',
    vpcId: 'vpc-0123456789abcdef0',
  },
  {
    groupId: 'sg-0a1b2c3d4e5f60002',
    groupName: 'prod-db-sg',
    description: 'PostgreSQL internal VPC access',
    vpcId: 'vpc-0123456789abcdef0',
  },
];

export const DUMMY_INBOUND_RULES = [
  {
    id: 'sgr-0001',
    type: 'HTTPS',
    protocol: 'tcp',
    port: '443',
    fromPort: 443,
    toPort: 443,
    source: '0.0.0.0/0',
    description: 'Public HTTPS traffic',
  },
  {
    id: 'sgr-0002',
    type: 'HTTP',
    protocol: 'tcp',
    port: '80',
    fromPort: 80,
    toPort: 80,
    source: '0.0.0.0/0',
    description: 'Redirect HTTP to HTTPS',
  },
  {
    id: 'sgr-0003',
    type: 'SSH',
    protocol: 'tcp',
    port: '22',
    fromPort: 22,
    toPort: 22,
    source: '198.51.100.42/32',
    description: 'Office VPN bastion',
  },
];

export const DUMMY_BUCKETS = [
  {
    name: 'acme-backups-prod',
    creationDate: '2025-08-14T10:22:00Z',
    formattedDate: '2025-08-14 10:22',
  },
  {
    name: 'acme-media-assets',
    creationDate: '2025-11-03T16:45:00Z',
    formattedDate: '2025-11-03 16:45',
  },
  {
    name: 'acme-mobile-uploads',
    creationDate: '2026-02-19T08:15:00Z',
    formattedDate: '2026-02-19 08:15',
  },
];

export const DUMMY_S3_OBJECTS = [
  {
    key: 'daily/',
    displayName: 'daily/',
    isFolder: true,
    size: null,
    formattedSize: '<DIR>',
    lastModified: '-',
    formattedDate: '-',
  },
  {
    key: 'db-dump-2026-11-20.sql.gz',
    displayName: 'db-dump-2026-11-20.sql.gz',
    isFolder: false,
    size: 48234496,
    formattedSize: '46.0 MB',
    lastModified: '2026-11-20T03:00:12Z',
    formattedDate: '2026-11-20 03:00',
  },
  {
    key: 'manifest.json',
    displayName: 'manifest.json',
    isFolder: false,
    size: 2048,
    formattedSize: '2.0 KB',
    lastModified: '2026-11-20T03:00:14Z',
    formattedDate: '2026-11-20 03:00',
  },
];

export const DUMMY_BUCKET_IAM_USERS = [
  {
    bucketName: 'acme-backups-prod',
    userName: 'acme-backups-prod-put',
    role: 'put-only',
    roleLabel: 'Put Only (no read, no delete)',
    createdAt: '2026-06-01T09:12:00Z',
    lastUsedAt: '2026-11-21T03:00:00Z',
    accessKeys: [
      {
        accessKeyId: 'AKIAWRITE0001EXAMPLE',
        status: 'Active',
        createDate: '2026-06-01T09:12:00Z',
        lastUsedDate: '2026-11-21T03:00:00Z',
      },
    ],
  },
  {
    bucketName: 'acme-backups-prod',
    userName: 'acme-backups-prod-read',
    role: 'read-only',
    roleLabel: 'Read Only (no put, no delete)',
    createdAt: '2026-06-01T09:13:00Z',
    lastUsedAt: '2026-11-20T18:45:00Z',
    accessKeys: [
      {
        accessKeyId: 'AKIAREAD00001EXAMPLE',
        status: 'Active',
        createDate: '2026-06-01T09:13:00Z',
        lastUsedDate: '2026-11-20T18:45:00Z',
      },
    ],
  },
  {
    bucketName: 'acme-backups-prod',
    userName: 'acme-backups-prod-read-2',
    role: 'read-only',
    roleLabel: 'Read Only (no put, no delete)',
    createdAt: '2026-09-10T14:30:00Z',
    lastUsedAt: '2026-11-19T12:10:00Z',
    accessKeys: [
      {
        accessKeyId: 'AKIAREAD00002EXAMPLE',
        status: 'Active',
        createDate: '2026-09-10T14:30:00Z',
        lastUsedDate: '2026-11-19T12:10:00Z',
      },
    ],
  },
  {
    bucketName: 'acme-backups-prod',
    userName: 'audit-reader-eu',
    role: 'read-only',
    roleLabel: 'Read Only (no put, no delete)',
    createdAt: '2026-10-22T11:05:00Z',
    lastUsedAt: 'Never',
    accessKeys: [
      {
        accessKeyId: 'AKIAREAD00003EXAMPLE',
        status: 'Active',
        createDate: '2026-10-22T11:05:00Z',
        lastUsedDate: 'Never',
      },
    ],
  },
];

export const DUMMY_RECREATED_CREDENTIAL = {
  bucketName: 'acme-backups-prod',
  userName: 'acme-backups-prod-put',
  role: 'put-only',
  roleLabel: 'Put Only (no read, no delete)',
  accessKeyId: 'AKIAWRITE9999ROTATED',
  secretAccessKey: '9b71d224bd62f3785d96d46ad3ea3d73319bfEXAMPLE',
};

export const DUMMY_SES_IDENTITIES = [
  {
    identityName: 'example.com',
    identityType: 'DOMAIN',
    typeLabel: 'Domain',
    verificationStatus: 'SUCCESS',
    dkimStatus: 'SUCCESS',
    dkimTokens: [
      'p7dqj6kznmefrlouwyhb5k5mp72jtpry',
      't53x6nyyaxlcsaa2oitqa6wjfxgqqfwj',
      'lzpuyt2exa3oni5g4iqpvqtulxmjgqps',
    ],
    sendingEnabled: true,
    matchedZoneId: 'Z0123456789ABCDEF',
    matchedZoneName: 'example.com.',
    matchedZoneProfile: 'prod-aws',
  },
  {
    identityName: 'mail.example.com',
    identityType: 'DOMAIN',
    typeLabel: 'Domain',
    verificationStatus: 'SUCCESS',
    dkimStatus: 'SUCCESS',
    dkimTokens: [
      'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
      'q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2',
      'g3h4i5j6k7l8m9n0o1p2q3r4s5t6u7v8',
    ],
    sendingEnabled: true,
    matchedZoneId: 'Z0123456789ABCDEF',
    matchedZoneName: 'example.com.',
    matchedZoneProfile: 'prod-aws',
  },
  {
    identityName: 'staging.example.com',
    identityType: 'DOMAIN',
    typeLabel: 'Domain',
    verificationStatus: 'PENDING',
    dkimStatus: 'PENDING',
    dkimTokens: [
      'k9l8m7n6o5p4q3r2s1t0u9v8w7x6y5z4',
      'f3e2d1c0b9a8z7y6x5w4v3u2t1s0r9q8',
      'j5i4h3g2f1e0d9c8b7a6z5y4x3w2v1u0',
    ],
    sendingEnabled: false,
    matchedZoneId: 'Z0123456789ABCDEF',
    matchedZoneName: 'example.com.',
    matchedZoneProfile: 'prod-aws',
  },
  {
    identityName: 'alerts@example.com',
    identityType: 'EMAIL_ADDRESS',
    typeLabel: 'Email',
    verificationStatus: 'SUCCESS',
    dkimStatus: 'SUCCESS',
    sendingEnabled: true,
  },
  {
    identityName: 'noreply@example.com',
    identityType: 'EMAIL_ADDRESS',
    typeLabel: 'Email',
    verificationStatus: 'SUCCESS',
    dkimStatus: 'SUCCESS',
    sendingEnabled: true,
  },
  {
    identityName: 'dev-team@staging.example.com',
    identityType: 'EMAIL_ADDRESS',
    typeLabel: 'Email',
    verificationStatus: 'PENDING',
    dkimStatus: '-',
    sendingEnabled: false,
  },
];
