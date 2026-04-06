import { Route53Client, ListHostedZonesCommand, ListResourceRecordSetsCommand, ChangeResourceRecordSetsCommand } from '@aws-sdk/client-route-53';
import { fromIni } from '@aws-sdk/credential-provider-ini';

/**
 * Create a Route53 client for the specified account
 * @param {Object} account - The AWS account object
 * @returns {Route53Client} Route53 client instance
 */
const createRoute53Client = (account) => {
  return new Route53Client({
    region: account.region,
    credentials: fromIni({ profile: account.profile }),
  });
};

/**
 * Load all hosted zones for an account
 * @param {Object} account - The AWS account object
 * @returns {Promise<Array>} Array of hosted zones
 */
export const loadHostedZones = async (account) => {
  try {
    const client = createRoute53Client(account);
    const command = new ListHostedZonesCommand({});
    const response = await client.send(command);
    return response.HostedZones || [];
  } catch (err) {
    throw new Error(`Failed to load hosted zones: ${err.message}`);
  }
};

/**
 * Format DNS record name by removing zone suffix and trailing dots
 * @param {string} recordName - The full DNS record name
 * @param {string} zoneName - The hosted zone name
 * @returns {string} Formatted record name
 */
const formatRecordName = (recordName, zoneName) => {
  let name = recordName;
  
  // Remove trailing dot
  if (name.endsWith('.')) {
    name = name.slice(0, -1);
  }
  
  // Remove zone suffix if present
  const normalizedZoneName = zoneName.endsWith('.') ? zoneName.slice(0, -1) : zoneName;
  if (name.endsWith(normalizedZoneName)) {
    name = name.substring(0, name.length - normalizedZoneName.length);
    if (name.endsWith('.')) {
      name = name.slice(0, -1);
    }
  }
  
  // If name is empty, it's the zone apex
  if (!name) {
    name = '@';
  }
  
  return name;
};

/**
 * Load all DNS records for a hosted zone (A, AAAA, CNAME, MX, TXT, NS)
 * @param {Object} account - The AWS account object
 * @param {Object} zone - The hosted zone object
 * @returns {Promise<Array>} Array of formatted records
 */
export const loadRecords = async (account, zone) => {
  try {
    const client = createRoute53Client(account);
    const command = new ListResourceRecordSetsCommand({
      HostedZoneId: zone.Id,
      MaxItems: '300', // Get up to 300 records at once
    });

    const response = await client.send(command);
    
    // Filter for supported record types only
    const supportedTypes = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'];
    const records = (response.ResourceRecordSets || []).filter(
      record => supportedTypes.includes(record.Type)
    );
    
    // Transform to the format expected by RecordList
    const formattedRecords = records.map(record => ({
      name: formatRecordName(record.Name, zone.Name),
      type: record.Type,
      value: record.ResourceRecords?.map(r => r.Value).join(', ') || '',
      ttl: record.TTL || '-',
    }));
    
    return formattedRecords;
  } catch (err) {
    throw new Error(`Failed to load records: ${err.message}`);
  }
};

/**
 * Create a new DNS record
 * @param {Object} account - The AWS account object
 * @param {Object} zone - The hosted zone object
 * @param {Object} recordData - The record data (name, value, ttl, type)
 * @returns {Promise<void>}
 */
export const createRecord = async (account, zone, recordData) => {
  try {
    const client = createRoute53Client(account);
    
    // Handle zone apex (@ or empty name)
    const recordName = (!recordData.name || recordData.name === '@')
      ? zone.Name
      : `${recordData.name}.${zone.Name}`;

    const changeBatch = {
      Changes: [
        {
          Action: 'CREATE',
          ResourceRecordSet: {
            Name: recordName,
            Type: recordData.type || 'A',
            TTL: parseInt(recordData.ttl),
            ResourceRecords: [{ Value: recordData.value }],
          },
        },
      ],
    };

    const command = new ChangeResourceRecordSetsCommand({
      HostedZoneId: zone.Id,
      ChangeBatch: changeBatch,
    });

    await client.send(command);
  } catch (err) {
    throw new Error(`Failed to add record: ${err.message}`);
  }
};

/**
 * Delete a DNS record
 * @param {Object} account - The AWS account object
 * @param {Object} zone - The hosted zone object
 * @param {Object} record - The record to delete
 * @returns {Promise<void>}
 */
export const deleteRecord = async (account, zone, record) => {
  try {
    const client = createRoute53Client(account);
    
    // Construct the full DNS name for the record
    const recordName = (!record.name || record.name === '@')
      ? zone.Name
      : `${record.name}.${zone.Name}`;

    const changeBatch = {
      Changes: [
        {
          Action: 'DELETE',
          ResourceRecordSet: {
            Name: recordName,
            Type: record.type || 'A',
            TTL: parseInt(record.ttl),
            ResourceRecords: [{ Value: record.value }],
          },
        },
      ],
    };

    const command = new ChangeResourceRecordSetsCommand({
      HostedZoneId: zone.Id,
      ChangeBatch: changeBatch,
    });

    await client.send(command);
  } catch (err) {
    throw new Error(`Failed to delete record: ${err.message}`);
  }
};
