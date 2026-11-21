import {
  IAMClient,
  CreateUserCommand,
  DeleteUserCommand,
  ListUsersCommand,
  ListUserTagsCommand,
  PutUserPolicyCommand,
  ListUserPoliciesCommand,
  DeleteUserPolicyCommand,
  CreateAccessKeyCommand,
  ListAccessKeysCommand,
  DeleteAccessKeyCommand,
  GetAccessKeyLastUsedCommand,
} from '@aws-sdk/client-iam';
import { fromIni } from '@aws-sdk/credential-provider-ini';

export const BUCKET_USER_PATH = '/s3-bucket-users/';

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

const buildAccountCredentials = (account) => {
  if (account?.accessKeyId && account?.secretAccessKey) {
    return {
      accessKeyId: account.accessKeyId,
      secretAccessKey: account.secretAccessKey,
      ...(account.sessionToken ? { sessionToken: account.sessionToken } : {}),
    };
  }
  return fromIni({ profile: account?.profile });
};

const createIAMClient = (account) => {
  return new IAMClient({
    region: 'us-east-1',
    credentials: buildAccountCredentials(account),
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
          Path: BUCKET_USER_PATH,
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

/**
 * List all managed IAM users under /s3-bucket-users/
 * @param {IAMClient} client
 * @returns {Promise<Array>}
 */
const listAllManagedUsers = async (client) => {
  const users = [];
  let marker;
  do {
    const resp = await client.send(
      new ListUsersCommand({
        PathPrefix: BUCKET_USER_PATH,
        Marker: marker,
      })
    );
    users.push(...(resp.Users || []));
    marker = resp.IsTruncated ? resp.Marker : undefined;
  } while (marker);
  return users;
};

/**
 * List all managed IAM users/keys associated with an S3 bucket
 * @param {Object} account
 * @param {string} bucketName
 * @returns {Promise<Array<{
 *   bucketName: string,
 *   userName: string,
 *   role: 'put-only'|'read-only',
 *   roleLabel: string,
 *   createdAt: string,
 *   accessKeys: Array<{ accessKeyId: string, status: string, createDate: string }>
 * }>>}
 */
const getCandidateUserNamesForBucket = (bucketName) => {
  const names = [
    validateIamUserName(`${bucketName.slice(0, 60)}-put`),
    validateIamUserName(`${bucketName.slice(0, 59)}-read`),
  ];
  for (let i = 2; i <= 6; i++) {
    const suffix = `-read-${i}`;
    names.push(validateIamUserName(`${bucketName.slice(0, 64 - suffix.length)}${suffix}`));
  }
  return names;
};

const inspectCandidateUser = async (client, bucketName, userName, createdAtHint = null) => {
  let tagsResp;
  try {
    tagsResp = await client.send(new ListUserTagsCommand({ UserName: userName }));
  } catch (err) {
    if (err.name === 'NoSuchEntityException' || String(err.message).includes('cannot be found')) {
      return null;
    }
    throw err;
  }

  const tags = tagsResp.Tags || [];
  const tagMap = Object.fromEntries(tags.map((t) => [t.Key, t.Value]));
  let role = null;
  if (tagMap.S3Bucket === bucketName && (tagMap.S3Access === 'put-only' || tagMap.S3Access === 'read-only')) {
    role = tagMap.S3Access;
  } else if (!tagMap.S3Bucket && userName.endsWith('-put')) {
    role = 'put-only';
  } else if (!tagMap.S3Bucket && userName.includes('-read')) {
    role = 'read-only';
  }
  if (!role) return null;

  const keysResp = await client.send(new ListAccessKeysCommand({ UserName: userName }));
  const accessKeys = [];
  for (const k of keysResp.AccessKeyMetadata || []) {
    const accessKeyId = k.AccessKeyId || '';
    let lastUsedDate = 'Never';
    if (accessKeyId) {
      try {
        const usedResp = await client.send(
          new GetAccessKeyLastUsedCommand({ AccessKeyId: accessKeyId })
        );
        const rawLastUsed = usedResp.AccessKeyLastUsed?.LastUsedDate;
        lastUsedDate = rawLastUsed
          ? new Date(rawLastUsed).toISOString().slice(0, 16).replace('T', ' ')
          : 'Never';
      } catch {
        lastUsedDate = '-';
      }
    }
    accessKeys.push({
      accessKeyId,
      status: k.Status || 'Unknown',
      createDate: k.CreateDate
        ? new Date(k.CreateDate).toISOString().slice(0, 16).replace('T', ' ')
        : '-',
      lastUsedDate,
    });
  }

  return {
    bucketName,
    userName,
    role,
    roleLabel: ROLE_LABELS[role] || role,
    createdAt:
      accessKeys[0]?.createDate ||
      createdAtHint ||
      '-',
    lastUsedAt: accessKeys[0]?.lastUsedDate || 'Never',
    accessKeys,
  };
};

export const listBucketIamUsers = async (account, bucketName) => {
  const client = createIAMClient(account);
  try {
    const matching = [];
    let allUsers = null;
    try {
      allUsers = await listAllManagedUsers(client);
    } catch {
      allUsers = null;
    }

    if (allUsers) {
      for (const user of allUsers) {
        if (!user.UserName) continue;
        const createdHint = user.CreateDate
          ? new Date(user.CreateDate).toISOString().slice(0, 16).replace('T', ' ')
          : null;
        const info = await inspectCandidateUser(client, bucketName, user.UserName, createdHint);
        if (info) matching.push(info);
      }
    } else {
      for (const candidate of getCandidateUserNamesForBucket(bucketName)) {
        const info = await inspectCandidateUser(client, bucketName, candidate, null);
        if (info) matching.push(info);
      }
    }

    // Sort write (put-only) first, then read-only alphabetically
    return matching.sort((a, b) => {
      if (a.role !== b.role) return a.role === 'put-only' ? -1 : 1;
      return a.userName.localeCompare(b.userName);
    });
  } catch (err) {
    throw new Error(`Failed to list IAM keys for bucket "${bucketName}": ${err.message}`);
  }
};

/**
 * Pick an unused default IAM username for a bucket and role
 * @param {string} bucketName
 * @param {'put-only'|'read-only'} role
 * @param {Set<string>} existingNames
 * @returns {string}
 */
const pickDefaultUserName = (bucketName, role, existingNames) => {
  const baseSuffix = role === 'put-only' ? '-put' : '-read';
  const candidate1 = validateIamUserName(
    `${bucketName.slice(0, 64 - baseSuffix.length)}${baseSuffix}`
  );
  if (!existingNames.has(candidate1)) {
    return candidate1;
  }
  for (let i = 2; i <= 999; i++) {
    const suffix = `${baseSuffix}-${i}`;
    const candidate = validateIamUserName(
      `${bucketName.slice(0, 64 - suffix.length)}${suffix}`
    );
    if (!existingNames.has(candidate)) {
      return candidate;
    }
  }
  throw new Error('Could not generate a unique IAM username. Please specify a custom username.');
};

/**
 * Create a single scoped IAM user & access key for an existing bucket.
 * Enforces max 1 write (put-only) key per bucket; allows multiple read (read-only) keys.
 * @param {Object} account
 * @param {string} bucketName
 * @param {'put-only'|'read-only'} role
 * @param {string} [customUserName]
 * @returns {Promise<Object>} Created user credentials
 */
export const createBucketIamUser = async (account, bucketName, role, customUserName = '') => {
  if (role !== 'put-only' && role !== 'read-only') {
    throw new Error(`Invalid IAM role: "${role}". Must be "put-only" or "read-only".`);
  }

  const client = createIAMClient(account);
  const existingForBucket = await listBucketIamUsers(account, bucketName);

  if (role === 'put-only') {
    const existingWrite = existingForBucket.find((u) => u.role === 'put-only');
    if (existingWrite) {
      throw new Error(
        `Only one write (put-only) key/user is allowed per bucket. Revoke or recreate "${existingWrite.userName}" instead.`
      );
    }
  }

  let existingNames;
  try {
    const allManaged = await listAllManagedUsers(client);
    existingNames = new Set(allManaged.map((u) => u.UserName).filter(Boolean));
  } catch {
    existingNames = new Set(existingForBucket.map((u) => u.userName));
  }
  const trimmedCustom = (customUserName || '').trim();
  const userName = trimmedCustom
    ? validateIamUserName(trimmedCustom)
    : pickDefaultUserName(bucketName, role, existingNames);

  try {
    await client.send(
      new CreateUserCommand({
        UserName: userName,
        Path: BUCKET_USER_PATH,
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

    return {
      bucketName,
      userName,
      role,
      roleLabel: ROLE_LABELS[role],
      accessKeyId: keyResponse.AccessKey?.AccessKeyId || '',
      secretAccessKey: keyResponse.AccessKey?.SecretAccessKey || '',
    };
  } catch (err) {
    throw new Error(`Failed creating IAM user "${userName}": ${err.message}`);
  }
};

/**
 * Recreate (rotate) access keys for an existing bucket IAM user.
 * Deletes all existing access keys on that user, re-applies the scoped inline policy,
 * and issues a fresh access key pair.
 * @param {Object} account
 * @param {string} bucketName
 * @param {string} userName
 * @param {'put-only'|'read-only'} role
 * @returns {Promise<Object>} New credentials
 */
export const recreateBucketIamUser = async (account, bucketName, userName, role) => {
  if (role !== 'put-only' && role !== 'read-only') {
    throw new Error(`Invalid IAM role: "${role}".`);
  }
  const client = createIAMClient(account);
  try {
    const keysResp = await client.send(new ListAccessKeysCommand({ UserName: userName }));
    for (const k of keysResp.AccessKeyMetadata || []) {
      if (k.AccessKeyId) {
        await client.send(
          new DeleteAccessKeyCommand({
            UserName: userName,
            AccessKeyId: k.AccessKeyId,
          })
        );
      }
    }

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
      new CreateAccessKeyCommand({ UserName: userName })
    );

    return {
      bucketName,
      userName,
      role,
      roleLabel: ROLE_LABELS[role],
      accessKeyId: keyResponse.AccessKey?.AccessKeyId || '',
      secretAccessKey: keyResponse.AccessKey?.SecretAccessKey || '',
    };
  } catch (err) {
    throw new Error(`Failed recreating IAM key for "${userName}": ${err.message}`);
  }
};

/**
 * Revoke and delete a managed bucket IAM user along with all its access keys and inline policies.
 * @param {Object} account
 * @param {string} userName
 * @returns {Promise<void>}
 */
export const revokeBucketIamUser = async (account, userName) => {
  const client = createIAMClient(account);
  try {
    const keysResp = await client.send(new ListAccessKeysCommand({ UserName: userName }));
    for (const k of keysResp.AccessKeyMetadata || []) {
      if (k.AccessKeyId) {
        await client.send(
          new DeleteAccessKeyCommand({
            UserName: userName,
            AccessKeyId: k.AccessKeyId,
          })
        );
      }
    }

    const policiesResp = await client.send(new ListUserPoliciesCommand({ UserName: userName }));
    for (const policyName of policiesResp.PolicyNames || []) {
      await client.send(
        new DeleteUserPolicyCommand({
          UserName: userName,
          PolicyName: policyName,
        })
      );
    }

    await client.send(new DeleteUserCommand({ UserName: userName }));
  } catch (err) {
    throw new Error(`Failed revoking IAM user "${userName}": ${err.message}`);
  }
};
