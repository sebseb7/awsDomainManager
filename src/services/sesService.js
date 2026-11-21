import {
  SESv2Client,
  ListEmailIdentitiesCommand,
  GetEmailIdentityCommand,
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
} from '@aws-sdk/client-sesv2';
import { fromIni } from '@aws-sdk/credential-provider-ini';

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
 * @returns {Promise<Array<{
 *   identityName: string,
 *   identityType: string,
 *   typeLabel: string,
 *   verificationStatus: string,
 *   dkimStatus: string,
 *   sendingEnabled: boolean
 * }>>}
 */
export const loadSesIdentities = async (account) => {
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

    const identities = [];
    for (const item of rawIdentities) {
      const identityName = item.IdentityName || '';
      if (!identityName) continue;
      const identityType = item.IdentityType || 'EMAIL_ADDRESS';
      let verificationStatus = item.VerificationStatus || 'UNKNOWN';
      let dkimStatus = '-';

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
      } catch {
        // Ignore if GetEmailIdentity permission is not granted
      }

      identities.push({
        identityName,
        identityType,
        typeLabel: formatTypeLabel(identityType),
        verificationStatus,
        dkimStatus,
        sendingEnabled: Boolean(item.SendingEnabled),
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
 * Create (begin verification for) an Amazon SES domain or email identity
 * @param {Object} account
 * @param {string} identityName
 * @returns {Promise<string>}
 */
export const createSesIdentity = async (account, identityName) => {
  const trimmed = (identityName || '').trim();
  if (!trimmed) {
    throw new Error('Domain or email address is required.');
  }
  try {
    const client = createSesClient(account);
    await client.send(
      new CreateEmailIdentityCommand({
        EmailIdentity: trimmed,
      })
    );
    return trimmed;
  } catch (err) {
    throw new Error(`Failed to create SES identity "${trimmed}": ${err.message}`);
  }
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
