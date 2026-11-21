import crypto from 'crypto';
import nodemailer from 'nodemailer';
import {
  IAMClient,
  CreateUserCommand,
  ListUsersCommand,
  ListUserTagsCommand,
  PutUserPolicyCommand,
  CreateAccessKeyCommand,
  ListAccessKeysCommand,
  DeleteAccessKeyCommand,
  GetAccessKeyLastUsedCommand,
} from '@aws-sdk/client-iam';
import { fromIni } from '@aws-sdk/credential-provider-ini';
import { validateIamUserName, revokeBucketIamUser } from './iamService.js';

export const SES_SMTP_USER_PATH = '/ses-smtp-users/';
export const SES_SENDING_POLICY_NAME = 'AmazonSesSendingAccess';

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

export const getSesSmtpHost = (region) => {
  const clean = (region || '').trim() || 'us-east-1';
  return `email-smtp.${clean}.amazonaws.com`;
};

const hmacSha256 = (key, data) => {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
};

/**
 * Derive an Amazon SES SMTP password from an IAM Secret Access Key using AWS SigV4.
 * @param {string} secretAccessKey
 * @param {string} [region='us-east-1']
 * @returns {string}
 */
export const deriveSesSmtpPassword = (secretAccessKey, region = 'us-east-1') => {
  const cleanRegion = (region || '').trim() || 'us-east-1';
  let sig = hmacSha256(`AWS4${secretAccessKey}`, '11111111');
  sig = hmacSha256(sig, cleanRegion);
  sig = hmacSha256(sig, 'ses');
  sig = hmacSha256(sig, 'aws4_request');
  sig = hmacSha256(sig, 'SendRawEmail');
  return Buffer.concat([Buffer.from([0x04]), sig]).toString('base64');
};

const sanitizeIdentityPrefix = (identityName) => {
  const cleaned = (identityName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = cleaned ? `ses-${cleaned}` : 'ses-smtp';
  return base.slice(0, 58).replace(/-+$/, '');
};

export const buildSesSendingPolicy = (identityName) => {
  const trimmed = (identityName || '').trim();
  const condition = trimmed.includes('@')
    ? { StringEqualsIgnoreCase: { 'ses:FromAddress': trimmed } }
    : { StringLike: { 'ses:FromAddress': `*@${trimmed.replace(/\.$/, '')}` } };

  return {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: SES_SENDING_POLICY_NAME,
        Effect: 'Allow',
        Action: ['ses:SendRawEmail'],
        Resource: '*',
        Condition: condition,
      },
    ],
  };
};

const listAllManagedSesUsers = async (client) => {
  const users = [];
  let marker;
  do {
    const resp = await client.send(
      new ListUsersCommand({
        PathPrefix: SES_SMTP_USER_PATH,
        Marker: marker,
      })
    );
    users.push(...(resp.Users || []));
    marker = resp.IsTruncated ? resp.Marker : undefined;
  } while (marker);
  return users;
};

const getCandidateUserNamesForIdentity = (identityName) => {
  const prefix = sanitizeIdentityPrefix(identityName);
  const names = [validateIamUserName(prefix)];
  for (let i = 2; i <= 6; i++) {
    const suffix = `-${i}`;
    names.push(validateIamUserName(`${prefix.slice(0, 64 - suffix.length)}${suffix}`));
  }
  return names;
};

const inspectSesCandidateUser = async (
  client,
  identityName,
  defaultRegion,
  userName,
  createdAtHint = null
) => {
  let tagsResp;
  try {
    tagsResp = await client.send(new ListUserTagsCommand({ UserName: userName }));
  } catch (err) {
    if (err.name === 'NoSuchEntityException' || String(err.message).includes('cannot be found')) {
      return null;
    }
    throw err;
  }

  const tagMap = Object.fromEntries((tagsResp.Tags || []).map((t) => [t.Key, t.Value]));
  if (
    !tagMap.SesIdentity ||
    tagMap.SesIdentity.trim().toLowerCase() !== identityName.trim().toLowerCase()
  ) {
    return null;
  }

  const region = (tagMap.SesRegion || '').trim() || defaultRegion || 'us-east-1';
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
    identityName: identityName.trim(),
    userName,
    region,
    smtpHost: getSesSmtpHost(region),
    smtpPort: 587,
    policyName: SES_SENDING_POLICY_NAME,
    createdAt: accessKeys[0]?.createDate || createdAtHint || '-',
    lastUsedAt: accessKeys[0]?.lastUsedDate || 'Never',
    accessKeys,
  };
};

export const listSesSenderKeys = async (account, identityName) => {
  const trimmed = (identityName || '').trim();
  if (!trimmed) {
    throw new Error('SES identity name is required.');
  }
  const sesRegion = account.region || 'us-east-1';
  const client = createIAMClient(account);
  try {
    const matching = [];
    let allUsers = null;
    try {
      allUsers = await listAllManagedSesUsers(client);
    } catch {
      allUsers = null;
    }

    if (allUsers) {
      for (const user of allUsers) {
        if (!user.UserName) continue;
        const createdHint = user.CreateDate
          ? new Date(user.CreateDate).toISOString().slice(0, 16).replace('T', ' ')
          : null;
        const info = await inspectSesCandidateUser(
          client,
          trimmed,
          sesRegion,
          user.UserName,
          createdHint
        );
        if (info) matching.push(info);
      }
    } else {
      for (const candidate of getCandidateUserNamesForIdentity(trimmed)) {
        const info = await inspectSesCandidateUser(client, trimmed, sesRegion, candidate, null);
        if (info) matching.push(info);
      }
    }

    return matching.sort((a, b) => a.userName.localeCompare(b.userName));
  } catch (err) {
    throw new Error(`Failed to list SMTP sender keys for "${trimmed}": ${err.message}`);
  }
};

const pickDefaultSesUserName = (identityName, existingNames) => {
  const prefix = sanitizeIdentityPrefix(identityName);
  const first = validateIamUserName(prefix);
  if (!existingNames.has(first)) {
    return first;
  }
  for (let i = 2; i <= 999; i++) {
    const suffix = `-${i}`;
    const candidate = validateIamUserName(`${prefix.slice(0, 64 - suffix.length)}${suffix}`);
    if (!existingNames.has(candidate)) {
      return candidate;
    }
  }
  throw new Error('Could not generate a unique IAM username. Please specify a custom username.');
};

export const createSesSenderKey = async (account, identityName, customUserName = '') => {
  const trimmedIdentity = (identityName || '').trim();
  if (!trimmedIdentity) {
    throw new Error('SES email identity is required.');
  }
  const sesRegion = account.region || 'us-east-1';
  const client = createIAMClient(account);

  let existingNames = new Set();
  try {
    const allManaged = await listAllManagedSesUsers(client);
    existingNames = new Set(allManaged.map((u) => u.UserName).filter(Boolean));
  } catch {
    existingNames = new Set();
  }

  const trimmedCustom = (customUserName || '').trim();
  const userName = trimmedCustom
    ? validateIamUserName(trimmedCustom)
    : pickDefaultSesUserName(trimmedIdentity, existingNames);

  try {
    await client.send(
      new CreateUserCommand({
        UserName: userName,
        Path: SES_SMTP_USER_PATH,
        Tags: [
          { Key: 'ManagedBy', Value: 'aws-domain-manager' },
          { Key: 'SesIdentity', Value: trimmedIdentity.toLowerCase() },
          { Key: 'SesRegion', Value: sesRegion },
        ],
      })
    );

    const policyDoc = buildSesSendingPolicy(trimmedIdentity);
    await client.send(
      new PutUserPolicyCommand({
        UserName: userName,
        PolicyName: SES_SENDING_POLICY_NAME,
        PolicyDocument: JSON.stringify(policyDoc),
      })
    );

    const keyResponse = await client.send(
      new CreateAccessKeyCommand({
        UserName: userName,
      })
    );

    const accessKeyId = keyResponse.AccessKey?.AccessKeyId || '';
    const secretAccessKey = keyResponse.AccessKey?.SecretAccessKey || '';
    const smtpPassword = deriveSesSmtpPassword(secretAccessKey, sesRegion);

    return {
      identityName: trimmedIdentity,
      userName,
      region: sesRegion,
      smtpHost: getSesSmtpHost(sesRegion),
      smtpPort: 587,
      smtpUsername: accessKeyId,
      smtpPassword,
      accessKeyId,
      secretAccessKey,
    };
  } catch (err) {
    throw new Error(`Failed creating SES SMTP sender key "${userName}": ${err.message}`);
  }
};

export const recreateSesSenderKey = async (account, identityName, userName) => {
  const trimmedIdentity = (identityName || '').trim();
  if (!trimmedIdentity) {
    throw new Error('SES email identity is required.');
  }
  const sesRegion = account.region || 'us-east-1';
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

    const policyDoc = buildSesSendingPolicy(trimmedIdentity);
    await client.send(
      new PutUserPolicyCommand({
        UserName: userName,
        PolicyName: SES_SENDING_POLICY_NAME,
        PolicyDocument: JSON.stringify(policyDoc),
      })
    );

    const keyResponse = await client.send(new CreateAccessKeyCommand({ UserName: userName }));
    const accessKeyId = keyResponse.AccessKey?.AccessKeyId || '';
    const secretAccessKey = keyResponse.AccessKey?.SecretAccessKey || '';
    const smtpPassword = deriveSesSmtpPassword(secretAccessKey, sesRegion);

    return {
      identityName: trimmedIdentity,
      userName,
      region: sesRegion,
      smtpHost: getSesSmtpHost(sesRegion),
      smtpPort: 587,
      smtpUsername: accessKeyId,
      smtpPassword,
      accessKeyId,
      secretAccessKey,
    };
  } catch (err) {
    throw new Error(`Failed recreating SES SMTP sender key "${userName}": ${err.message}`);
  }
};

export const revokeSesSenderKey = async (account, userName) => {
  return revokeBucketIamUser(account, userName);
};

/**
 * Send a real test email over SMTP using nodemailer.
 * @param {Object} params
 * @returns {Promise<string>}
 */
export const sendSesSmtpTestEmail = async ({
  smtpHost,
  smtpPort = 587,
  smtpUsername,
  smtpPassword,
  fromEmail,
  toEmail,
  subject,
  body,
}) => {
  const host = (smtpHost || '').trim();
  const user = (smtpUsername || '').trim();
  const pass = (smtpPassword || '').trim();
  const from = (fromEmail || '').trim();
  const to = (toEmail || '').trim();
  const port = Number(smtpPort) || 587;

  if (!host) throw new Error('SMTP host is required.');
  if (!user) throw new Error('SMTP username (Access Key ID) is required.');
  if (!pass) throw new Error('SMTP password is required.');
  if (!from) throw new Error('From email address is required.');
  if (!to) throw new Error('Recipient (To) email address is required.');

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 20000,
  });

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: (subject || '').trim() || `AWS SES SMTP Test — ${from}`,
      text:
        (body || '').trim() ||
        `This is an SMTP test email sent from ${from} via ${host}:${port}.`,
    });
    return `SMTP test email sent from "${from}" to "${to}" via ${host}:${port} (${info.response || info.messageId || '250 OK'}).`;
  } catch (err) {
    throw new Error(`SMTP send failed (${host}:${port}): ${err.message}`);
  }
};
