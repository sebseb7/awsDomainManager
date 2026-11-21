import {
  IAMClient,
  CreateUserCommand,
  PutUserPolicyCommand,
  CreateAccessKeyCommand,
} from '@aws-sdk/client-iam';
import { fromIni } from '@aws-sdk/credential-provider-ini';

export const IAM_ACCESS_OPTIONS = [
  { id: 'none', label: 'None (no IAM user)' },
  { id: 'put-only', label: 'Put Only (upload only, no read/delete)' },
  { id: 'read-only', label: 'Read Only (list & read only, no put/delete)' },
  { id: 'both', label: 'Both (separate Put-Only & Read-Only users)' },
];

const ROLE_LABELS = {
  'put-only': 'Put Only (no read, no delete)',
  'read-only': 'Read Only (no put, no delete)',
};

const createIAMClient = (account) => {
  return new IAMClient({
    region: 'us-east-1',
    credentials: fromIni({ profile: account.profile }),
  });
};

/**
 * Build a least-privilege S3 bucket policy for put-only or read-only access.
 * Explicitly denies all S3 delete actions.
 * @param {string} bucketName
 * @param {'put-only'|'read-only'} role
 * @returns {Object} IAM policy document
 */
export const buildBucketPolicy = (bucketName, role) => {
  const bucketArn = `arn:aws:s3:::${bucketName}`;
  const objectsArn = `arn:aws:s3:::${bucketName}/*`;

  const denyDeleteStatement = {
    Sid: 'DenyAllDelete',
    Effect: 'Deny',
    Action: [
      's3:DeleteObject',
      's3:DeleteObjectVersion',
      's3:DeleteBucket',
    ],
    Resource: [bucketArn, objectsArn],
  };

  if (role === 'put-only') {
    return {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'AllowPutObjectOnly',
          Effect: 'Allow',
          Action: ['s3:PutObject'],
          Resource: [objectsArn],
        },
        denyDeleteStatement,
      ],
    };
  }

  if (role === 'read-only') {
    return {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'AllowListBucket',
          Effect: 'Allow',
          Action: ['s3:ListBucket'],
          Resource: [bucketArn],
        },
        {
          Sid: 'AllowGetObjectOnly',
          Effect: 'Allow',
          Action: ['s3:GetObject'],
          Resource: [objectsArn],
        },
        denyDeleteStatement,
      ],
    };
  }

  throw new Error(`Unsupported IAM bucket role: "${role}". Only "put-only" and "read-only" are allowed.`);
};

/**
 * Validate an AWS IAM username (1-64 chars, allowed IAM character set)
 * @param {string} userName
 * @returns {string}
 */
export const validateIamUserName = (userName) => {
  const trimmed = (userName || '').trim();
  if (!trimmed) {
    throw new Error('IAM username cannot be empty.');
  }
  if (trimmed.length > 64) {
    throw new Error('IAM username must be 64 characters or fewer.');
  }
  if (!/^[a-zA-Z0-9+=,.@_-]+$/.test(trimmed)) {
    throw new Error('IAM username may only contain letters, digits, and +=,.@_- characters.');
  }
  return trimmed;
};

/**
 * Resolve the list of IAM users to create for a bucket given the selected access mode
 * @param {string} bucketName
 * @param {'none'|'put-only'|'read-only'|'both'} accessMode
 * @param {string} [customUserName]
 * @returns {Array<{ userName: string, role: 'put-only'|'read-only' }>}
 */
export const resolveBucketIamUsers = (bucketName, accessMode, customUserName = '') => {
  if (!accessMode || accessMode === 'none') {
    return [];
  }

  const trimmedCustom = (customUserName || '').trim();

  if (accessMode === 'put-only') {
    const userName = trimmedCustom
      ? validateIamUserName(trimmedCustom)
      : validateIamUserName(`${bucketName.slice(0, 60)}-put`);
    return [{ userName, role: 'put-only' }];
  }

  if (accessMode === 'read-only') {
    const userName = trimmedCustom
      ? validateIamUserName(trimmedCustom)
      : validateIamUserName(`${bucketName.slice(0, 59)}-read`);
    return [{ userName, role: 'read-only' }];
  }

  if (accessMode === 'both') {
    const base = trimmedCustom || bucketName;
    const putUser = validateIamUserName(`${base.slice(0, 60)}-put`);
    const readUser = validateIamUserName(`${base.slice(0, 59)}-read`);
    return [
      { userName: putUser, role: 'put-only' },
      { userName: readUser, role: 'read-only' },
    ];
  }

  throw new Error(`Invalid IAM access mode: "${accessMode}".`);
};

/**
 * Create scoped IAM user(s) with inline least-privilege S3 policy and access keys
 * @param {Object} account
 * @param {string} bucketName
 * @param {'none'|'put-only'|'read-only'|'both'} accessMode
 * @param {string} [customUserName]
 * @returns {Promise<Array>} Created user credentials list
 */
export const createBucketIamUsers = async (account, bucketName, accessMode, customUserName = '') => {
  const usersToCreate = resolveBucketIamUsers(bucketName, accessMode, customUserName);
  if (usersToCreate.length === 0) {
    return [];
  }

  const client = createIAMClient(account);
  const created = [];

  for (const { userName, role } of usersToCreate) {
    try {
      await client.send(
        new CreateUserCommand({
          UserName: userName,
          Tags: [
            { Key: 'ManagedBy', Value: 'aws-domain-manager' },
            { Key: 'S3Bucket', Value: bucketName },
            { Key: 'S3Access', Value: role },
          ],
        })
      );

      const policyDoc = buildBucketPolicy(bucketName, role);
      const policyName = `s3-${role}-${bucketName}`.slice(0, 128);
      await client.send(
        new PutUserPolicyCommand({
          UserName: userName,
          PolicyName: policyName,
          PolicyDocument: JSON.stringify(policyDoc),
        })
      );

      const keyResponse = await client.send(
        new CreateAccessKeyCommand({
          UserName: userName,
        })
      );

      created.push({
        bucketName,
        userName,
        role,
        roleLabel: ROLE_LABELS[role],
        accessKeyId: keyResponse.AccessKey?.AccessKeyId || '',
        secretAccessKey: keyResponse.AccessKey?.SecretAccessKey || '',
      });
    } catch (err) {
      throw new Error(`Bucket "${bucketName}" was created, but failed creating IAM user "${userName}": ${err.message}`);
    }
  }

  return created;
};
