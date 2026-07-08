import { EC2Client, DescribeSecurityGroupsCommand, DescribeSecurityGroupRulesCommand, AuthorizeSecurityGroupIngressCommand, RevokeSecurityGroupIngressCommand } from '@aws-sdk/client-ec2';
import { fromIni } from '@aws-sdk/credential-provider-ini';

/**
 * Create an EC2 client for the specified account
 * @param {Object} account - The AWS account object
 * @returns {EC2Client} EC2 client instance
 */
const createEC2Client = (account) => {
  return new EC2Client({
    region: account.region,
    credentials: fromIni({ profile: account.profile }),
  });
};

/**
 * Load all security groups for an account
 * @param {Object} account - The AWS account object
 * @returns {Promise<Array>} Array of security groups
 */
export const loadSecurityGroups = async (account) => {
  try {
    const client = createEC2Client(account);
    const command = new DescribeSecurityGroupsCommand({});
    const response = await client.send(command);
    return response.SecurityGroups || [];
  } catch (err) {
    throw new Error('Failed to load security groups: ' + err.message);
  }
};

/**
 * Format a port range for display
 * @param {number} fromPort - Start of port range
 * @param {number} toPort - End of port range
 * @returns {string} Formatted port string
 */
const formatPortRange = (fromPort, toPort) => {
  if (fromPort === -1 || (fromPort === undefined && toPort === undefined)) {
    return 'All';
  }
  if (fromPort === toPort || toPort === undefined) {
    return String(fromPort);
  }
  return fromPort + ' - ' + toPort;
};

/**
 * Get a user-friendly protocol name
 * @param {string} protocol - The IP protocol
 * @returns {string} Human-readable protocol name
 */
const getProtocolName = (protocol) => {
  const protocolMap = {
    'tcp': 'TCP',
    'udp': 'UDP',
    'icmp': 'ICMP',
    '-1': 'All',
    '50': 'ESP',
    '51': 'AH',
    '6': 'TCP',
    '17': 'UDP',
    '1': 'ICMP',
  };
  return protocolMap[protocol] || (protocol ? protocol.toUpperCase() : 'All');
};

/**
 * Load all inbound rules for a security group
 * @param {Object} account - The AWS account object
 * @param {Object} securityGroup - The security group object
 * @returns {Promise<Array>} Array of formatted inbound rules
 */
export const loadInboundRules = async (account, securityGroup) => {
  try {
    const client = createEC2Client(account);
    const command = new DescribeSecurityGroupRulesCommand({
      Filters: [
        { Name: 'group-id', Values: [securityGroup.GroupId] },
      ],
      MaxResults: 1000,
    });

    const response = await client.send(command);

    // Filter for inbound rules only (isEgress = false)
    const inboundRules = (response.SecurityGroupRules || []).filter(
      rule => !rule.IsEgress
    );

    // Transform to the format expected by the UI
    const formattedRules = inboundRules.map(rule => ({
      id: rule.SecurityGroupRuleId,
      type: getProtocolName(rule.IpProtocol),
      protocol: rule.IpProtocol,
      port: formatPortRange(rule.FromPort, rule.ToPort),
      fromPort: rule.FromPort,
      toPort: rule.ToPort,
      source: rule.CidrIpv4 || rule.CidrIpv6 || (rule.ReferencedGroupInfo ? rule.ReferencedGroupInfo.GroupId : 'N/A'),
      description: rule.Description || '-',
    }));

    return formattedRules;
  } catch (err) {
    throw new Error('Failed to load inbound rules: ' + err.message);
  }
};

/**
 * Add a new inbound rule to a security group
 * @param {Object} account - The AWS account object
 * @param {Object} securityGroup - The security group object
 * @param {Object} ruleData - The rule data
 * @returns {Promise<void>}
 */
export const addInboundRule = async (account, securityGroup, ruleData) => {
  try {
    const client = createEC2Client(account);

    const ipPermissions = [{
      IpProtocol: ruleData.protocol || 'tcp',
      FromPort: ruleData.fromPort === '' ? undefined : parseInt(ruleData.fromPort),
      ToPort: ruleData.toPort === '' ? undefined : parseInt(ruleData.toPort),
      IpRanges: [{
        CidrIp: ruleData.source || '0.0.0.0/0',
        Description: ruleData.description || '',
      }],
    }];

    const command = new AuthorizeSecurityGroupIngressCommand({
      GroupId: securityGroup.GroupId,
      IpPermissions: ipPermissions,
    });

    await client.send(command);
  } catch (err) {
    throw new Error('Failed to add inbound rule: ' + err.message);
  }
};

/**
 * Delete an inbound rule from a security group using its rule ID
 * @param {Object} account - The AWS account object
 * @param {Object} securityGroup - The security group object
 * @param {Object} rule - The rule to delete (must have id property)
 * @returns {Promise<void>}
 */
export const deleteInboundRule = async (account, securityGroup, rule) => {
  try {
    const client = createEC2Client(account);

    const command = new RevokeSecurityGroupIngressCommand({
      GroupId: securityGroup.GroupId,
      SecurityGroupRuleIds: [rule.id],
    });

    await client.send(command);
  } catch (err) {
    throw new Error('Failed to delete inbound rule: ' + err.message);
  }
};
