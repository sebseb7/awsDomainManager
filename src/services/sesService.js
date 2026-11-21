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
  extractDomainFromIdentity,
  checkDkimRecordsInList,
  checkDmarcRecordInList,
  findMxRecordInList,
  checkSesMxRecordInList,
  getSesInboundMxValue,
  upsertSesDnsRecords,
  upsertSesMxRecord,
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
    const sesRegion = account.region || 'us-east-1';
    const mxRecordValue = getSesInboundMxValue(sesRegion);
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

    const allZones =
      rawIdentities.length > 0
        ? await loadAllZonesAcrossAccounts(account, allAccounts)
        : [];

    const zoneRecordsCache = new Map();
    const identities = [];
    for (const item of rawIdentities) {
      const identityName = item.IdentityName || '';
      if (!identityName) continue;
      const identityType = item.IdentityType || 'EMAIL_ADDRESS';
      const domain = extractDomainFromIdentity(identityName);
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

      const matched = matchDomainInZones(domain, allZones);

      let dkimRecordsPublished = identityType !== 'DOMAIN' || dkimStatus === 'SUCCESS';
      let dmarcRecordPublished = false;
      let mxRecordPublished = false;
      let mxExistingValue = null;

      if (matched) {
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
        if (!dkimRecordsPublished && dkimTokens.length > 0) {
          dkimRecordsPublished = checkDkimRecordsInList(
            domain,
            matched.zone.Name,
            dkimTokens,
            records
          );
        }
        dmarcRecordPublished = checkDmarcRecordInList(domain, matched.zone.Name, records);
        if (identityType === 'DOMAIN') {
          mxExistingValue = findMxRecordInList(domain, matched.zone.Name, records);
          mxRecordPublished = checkSesMxRecordInList(domain, matched.zone.Name, sesRegion, records);
        }
      }

      const dnsRecordsPublished =
        identityType === 'DOMAIN'
          ? dkimRecordsPublished && dmarcRecordPublished
          : dmarcRecordPublished && (dkimTokens.length === 0 || dkimRecordsPublished);

      identities.push({
        identityName,
        identityType,
        typeLabel: formatTypeLabel(identityType),
        domain,
        verificationStatus,
        dkimStatus,
        dkimTokens,
        dkimRecordsPublished,
        dmarcRecordPublished,
        dnsRecordsPublished,
        mxRecordPublished,
        mxRecordValue,
        mxExistingValue,
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
 * If we own a matching Route53 hosted zone, automatically publishes its DKIM CNAME and/or DMARC TXT records.
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

    const domain = extractDomainFromIdentity(trimmed);
    let tokens = resp.DkimAttributes?.Tokens || [];
    if (tokens.length === 0 && !trimmed.includes('@')) {
      try {
        const detail = await client.send(
          new GetEmailIdentityCommand({ EmailIdentity: trimmed })
        );
        tokens = detail.DkimAttributes?.Tokens || [];
      } catch {
        tokens = [];
      }
    }

    const emailHint = trimmed.includes('@')
      ? ' Check the inbox for the verification email and click the provided link.'
      : '';

    const allZones = await loadAllZonesAcrossAccounts(account, allAccounts);
    const matched = matchDomainInZones(domain, allZones);
    if (matched) {
      try {
        let existingRecords = [];
        try {
          existingRecords = await loadRecords(matched.account, matched.zone);
        } catch {
          existingRecords = [];
        }
        const needDmarc = !checkDmarcRecordInList(domain, matched.zone.Name, existingRecords);
        if (tokens.length > 0 || needDmarc) {
          const count = await upsertSesDnsRecords(
            matched.account,
            matched.zone.Id,
            domain,
            tokens,
            needDmarc
          );
          return `Created SES identity "${trimmed}" and automatically published ${count} DNS record${count === 1 ? '' : 's'} (DKIM/DMARC) to Route53 zone "${matched.zone.Name}" (${matched.account.profile}).${emailHint}`;
        }
      } catch {
        // Fall through if Route53 write failed
      }
    }

    return `Created SES identity "${trimmed}".${emailHint}`;
  } catch (err) {
    throw new Error(`Failed to create SES identity "${trimmed}": ${err.message}`);
  }
};

/**
 * Resend the Amazon SES verification email for an unverified email address identity
 * by deleting and recreating it in SESv2 (preserving configuration set and tags).
 * @param {Object} account
 * @param {string} identityName
 * @returns {Promise<string>}
 */
export const resendSesVerificationEmail = async (account, identityName) => {
  const trimmed = (identityName || '').trim();
  if (!trimmed || !trimmed.includes('@')) {
    throw new Error('Verification emails can only be resent for email address identities.');
  }

  const client = createSesClient(account);
  let configSetName;
  let tags = [];

  try {
    const detail = await client.send(
      new GetEmailIdentityCommand({ EmailIdentity: trimmed })
    );
    if (detail.IdentityType === 'DOMAIN') {
      throw new Error('Verification emails can only be resent for email address identities.');
    }
    if (detail.VerificationStatus === 'SUCCESS') {
      return `SES identity "${trimmed}" is already verified.`;
    }
    configSetName = detail.ConfigurationSetName;
    if (Array.isArray(detail.Tags)) {
      tags = detail.Tags;
    }
  } catch (err) {
    if (err.message?.includes('email address identities')) {
      throw err;
    }
    // Ignore if GetEmailIdentity permission is not granted
  }

  try {
    await client.send(
      new DeleteEmailIdentityCommand({
        EmailIdentity: trimmed,
      })
    );
  } catch (err) {
    if (err.name !== 'NotFoundException') {
      throw new Error(`Failed to reset pending SES identity "${trimmed}": ${err.message}`);
    }
  }

  const createInput = {
    EmailIdentity: trimmed,
    ...(configSetName ? { ConfigurationSetName: configSetName } : {}),
    ...(tags.length > 0 ? { Tags: tags } : {}),
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await client.send(new CreateEmailIdentityCommand(createInput));
      return `Verification email resent to "${trimmed}". Check the inbox and click the provided link.`;
    } catch (err) {
      if (attempt === 0 && err.name === 'AlreadyExistsException') {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      throw new Error(`Failed to resend verification email to "${trimmed}": ${err.message}`);
    }
  }
};

/**
 * Publish Easy DKIM CNAME records and/or DMARC TXT record for an SES identity to its matching Route53 hosted zone
 * @param {Object} account
 * @param {Array<Object>} allAccounts
 * @param {string} identityOrDomain
 * @param {Array<string>} [dkimTokens=[]]
 * @returns {Promise<string>}
 */
export const publishSesDkimToRoute53 = async (
  account,
  allAccounts,
  identityOrDomain,
  dkimTokens = []
) => {
  const trimmed = (identityOrDomain || '').trim();
  if (!trimmed) {
    throw new Error('Identity or domain name is required.');
  }
  const cleanDomain = extractDomainFromIdentity(trimmed);

  let tokens = dkimTokens || [];
  if (tokens.length === 0 && !trimmed.includes('@')) {
    try {
      const client = createSesClient(account);
      const detail = await client.send(
        new GetEmailIdentityCommand({ EmailIdentity: trimmed })
      );
      tokens = detail.DkimAttributes?.Tokens || [];
    } catch {
      tokens = [];
    }
  }

  const allZones = await loadAllZonesAcrossAccounts(account, allAccounts);
  const matched = matchDomainInZones(cleanDomain, allZones);
  if (!matched) {
    throw new Error(
      `No matching Route53 hosted zone found for "${cleanDomain}" in any configured AWS account.`
    );
  }

  let existingRecords = [];
  try {
    existingRecords = await loadRecords(matched.account, matched.zone);
  } catch {
    existingRecords = [];
  }
  const needDmarc = !checkDmarcRecordInList(cleanDomain, matched.zone.Name, existingRecords);
  const includeDmarc = needDmarc || tokens.length === 0;

  const count = await upsertSesDnsRecords(
    matched.account,
    matched.zone.Id,
    cleanDomain,
    tokens,
    includeDmarc
  );

  return `Published ${count} SES DNS record${count === 1 ? '' : 's'} (DKIM/DMARC) for "${cleanDomain}" to Route53 zone "${matched.zone.Name}" (${matched.account.profile}).`;
};

/**
 * Publish an Amazon SES inbound MX record (10 inbound-smtp.<region>.amazonaws.com) for a domain identity to Route53
 * @param {Object} account
 * @param {Array<Object>} allAccounts
 * @param {string} domain
 * @returns {Promise<string>}
 */
export const publishSesMxToRoute53 = async (account, allAccounts, domain) => {
  const trimmed = (domain || '').trim();
  if (!trimmed || trimmed.includes('@')) {
    throw new Error('Inbound MX records can only be published for SES domain identities.');
  }
  const cleanDomain = extractDomainFromIdentity(trimmed);
  const sesRegion = account.region || 'us-east-1';

  const allZones = await loadAllZonesAcrossAccounts(account, allAccounts);
  const matched = matchDomainInZones(cleanDomain, allZones);
  if (!matched) {
    throw new Error(
      `No matching Route53 hosted zone found for "${cleanDomain}" in any configured AWS account.`
    );
  }

  const mxValue = await upsertSesMxRecord(matched.account, matched.zone.Id, cleanDomain, sesRegion);
  return `Published SES inbound MX record (${mxValue}) for "${cleanDomain}" to Route53 zone "${matched.zone.Name}" (${matched.account.profile}).`;
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
