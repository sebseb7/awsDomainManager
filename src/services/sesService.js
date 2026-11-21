import {
  SESv2Client,
  ListEmailIdentitiesCommand,
  GetEmailIdentityCommand,
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
} from '@aws-sdk/client-sesv2';
import { fromIni } from '@aws-sdk/credential-provider-ini';
import {
  loadRecords,
  loadAllZonesAcrossAccounts,
  matchDomainInZones,
  checkDkimRecordsInList,
  upsertDkimCnameRecords,
} from './route53Service.js';

const createSesClient = (account) => {
  return new SESv2Client({
    region: account.region || 'us-east-1',
    credentials: fromIni({ profile: account.profile }),
  });
};

const formatTypeLabel = (identityType) => {
  if (identityType === 'DOMAIN') return 'Domain';
  if (identityType === 'EMAIL_ADDRESS') return 'Email';
  if (identityType === 'MANAGED_DOMAIN') return 'Managed Domain';
  return identityType || 'Unknown';
};

/**
 * List all Amazon SES identities (domains and email addresses) in the account's region
 * @param {Object} account
 * @param {Array<Object>} [allAccounts=[]]
 * @returns {Promise<Array>}
 */
export const loadSesIdentities = async (account, allAccounts = []) => {
  try {
    const client = createSesClient(account);
    const rawIdentities = [];
    let nextToken;

    do {
      const resp = await client.send(
        new ListEmailIdentitiesCommand({
          NextToken: nextToken,
          PageSize: 100,
        })
      );
      rawIdentities.push(...(resp.EmailIdentities || []));
      nextToken = resp.NextToken;
    } while (nextToken);

    const hasDomains = rawIdentities.some((i) => i.IdentityType === 'DOMAIN');
    const allZones = hasDomains
      ? await loadAllZonesAcrossAccounts(account, allAccounts)
      : [];

    const zoneRecordsCache = new Map();
    const identities = [];
    for (const item of rawIdentities) {
      const identityName = item.IdentityName || '';
      if (!identityName) continue;
      const identityType = item.IdentityType || 'EMAIL_ADDRESS';
      let verificationStatus = item.VerificationStatus || 'UNKNOWN';
      let dkimStatus = '-';
      let dkimTokens = [];

      try {
        const detail = await client.send(
          new GetEmailIdentityCommand({ EmailIdentity: identityName })
        );
        if (detail.VerificationStatus) {
          verificationStatus = detail.VerificationStatus;
        }
        if (detail.DkimAttributes?.Status) {
          dkimStatus = detail.DkimAttributes.Status;
        }
        if (Array.isArray(detail.DkimAttributes?.Tokens)) {
          dkimTokens = detail.DkimAttributes.Tokens;
        }
      } catch {
        // Ignore if GetEmailIdentity permission is not granted
      }

      const matched =
        identityType === 'DOMAIN' ? matchDomainInZones(identityName, allZones) : null;

      let dkimRecordsPublished = dkimStatus === 'SUCCESS';
      if (!dkimRecordsPublished && matched && dkimTokens.length > 0) {
        const zId = matched.zone.Id;
        let records = zoneRecordsCache.get(zId);
        if (!records) {
          try {
            records = await loadRecords(matched.account, matched.zone);
          } catch {
            records = [];
          }
          zoneRecordsCache.set(zId, records);
        }
        dkimRecordsPublished = checkDkimRecordsInList(
          identityName,
          matched.zone.Name,
          dkimTokens,
          records
        );
      }

      identities.push({
        identityName,
        identityType,
        typeLabel: formatTypeLabel(identityType),
        verificationStatus,
        dkimStatus,
        dkimTokens,
        dkimRecordsPublished,
        sendingEnabled: Boolean(item.SendingEnabled),
        matchedZoneId: matched?.zone?.Id || null,
        matchedZoneName: matched?.zone?.Name || null,
        matchedZoneProfile: matched?.account?.profile || null,
      });
    }

    // Sort domains first, then email addresses alphabetically
    return identities.sort((a, b) => {
      const rankA = a.identityType === 'DOMAIN' ? 0 : 1;
      const rankB = b.identityType === 'DOMAIN' ? 0 : 1;
      if (rankA !== rankB) return rankA - rankB;
      return a.identityName.localeCompare(b.identityName);
    });
  } catch (err) {
    throw new Error(`Failed to load SES identities: ${err.message}`);
  }
};

/**
 * Create (begin verification for) an Amazon SES domain or email identity.
 * If it is a domain and we own a matching Route53 hosted zone, automatically publishes the 3 DKIM CNAME records.
 * @param {Object} account
 * @param {string} identityName
 * @param {Array<Object>} [allAccounts=[]]
 * @returns {Promise<string>} Status message
 */
export const createSesIdentity = async (account, identityName, allAccounts = []) => {
  const trimmed = (identityName || '').trim();
  if (!trimmed) {
    throw new Error('Domain or email address is required.');
  }
  try {
    const client = createSesClient(account);
    const resp = await client.send(
      new CreateEmailIdentityCommand({
        EmailIdentity: trimmed,
      })
    );

    if (!trimmed.includes('@')) {
      let tokens = resp.DkimAttributes?.Tokens || [];
      if (tokens.length === 0) {
        try {
          const detail = await client.send(
            new GetEmailIdentityCommand({ EmailIdentity: trimmed })
          );
          tokens = detail.DkimAttributes?.Tokens || [];
        } catch {
          tokens = [];
        }
      }

      if (tokens.length > 0) {
        const allZones = await loadAllZonesAcrossAccounts(account, allAccounts);
        const matched = matchDomainInZones(trimmed, allZones);
        if (matched) {
          try {
            const count = await upsertDkimCnameRecords(
              matched.account,
              matched.zone.Id,
              trimmed,
              tokens
            );
            return `Created SES domain "${trimmed}" and automatically published ${count} DKIM CNAME records to Route53 zone "${matched.zone.Name}" (${matched.account.profile}).`;
          } catch {
            // Fall through if Route53 write failed
          }
        }
      }
    }

    return `Created SES identity "${trimmed}".`;
  } catch (err) {
    throw new Error(`Failed to create SES identity "${trimmed}": ${err.message}`);
  }
};

/**
 * Publish Easy DKIM CNAME records for an existing SES domain identity to its matching Route53 hosted zone
 * @param {Object} account
 * @param {Array<Object>} allAccounts
 * @param {string} domain
 * @param {Array<string>} [dkimTokens=[]]
 * @returns {Promise<string>}
 */
export const publishSesDkimToRoute53 = async (
  account,
  allAccounts,
  domain,
  dkimTokens = []
) => {
  const trimmed = (domain || '').trim();
  if (!trimmed) {
    throw new Error('Domain name is required.');
  }

  let tokens = dkimTokens;
  if (!tokens || tokens.length === 0) {
    const client = createSesClient(account);
    const detail = await client.send(
      new GetEmailIdentityCommand({ EmailIdentity: trimmed })
    );
    tokens = detail.DkimAttributes?.Tokens || [];
  }

  if (tokens.length === 0) {
    throw new Error(`No Easy DKIM tokens found for domain "${trimmed}".`);
  }

  const allZones = await loadAllZonesAcrossAccounts(account, allAccounts);
  const matched = matchDomainInZones(trimmed, allZones);
  if (!matched) {
    throw new Error(
      `No matching Route53 hosted zone found for "${trimmed}" in any configured AWS account.`
    );
  }

  const count = await upsertDkimCnameRecords(
    matched.account,
    matched.zone.Id,
    trimmed,
    tokens
  );

  return `Published ${count} DKIM CNAME records for "${trimmed}" to Route53 zone "${matched.zone.Name}" (${matched.account.profile}).`;
};

/**
 * Delete an Amazon SES domain or email identity
 * @param {Object} account
 * @param {string} identityName
 * @returns {Promise<void>}
 */
export const deleteSesIdentity = async (account, identityName) => {
  try {
    const client = createSesClient(account);
    await client.send(
      new DeleteEmailIdentityCommand({
        EmailIdentity: identityName,
      })
    );
  } catch (err) {
    throw new Error(`Failed to delete SES identity "${identityName}": ${err.message}`);
  }
};
