import {
  EC2Client,
  DescribeSecurityGroupsCommand,
  DescribeSecurityGroupRulesCommand,
  AuthorizeSecurityGroupIngressCommand,
  RevokeSecurityGroupIngressCommand,
  DescribeInstancesCommand,
  DescribeAddressesCommand,
  DescribeAddressesAttributeCommand,
  ModifyAddressAttributeCommand,
  ResetAddressAttributeCommand,
  RebootInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  CreateTagsCommand,
  DeleteTagsCommand,
  AllocateAddressCommand,
  AssociateAddressCommand,
  DisassociateAddressCommand,
  ReleaseAddressCommand,
} from '@aws-sdk/client-ec2';
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

const findTagValue = (tags = [], key) => {
  const match = (tags || []).find(
    (t) => t.Key && t.Key.toLowerCase() === key.toLowerCase()
  );
  const val = match?.Value?.trim();
  return val ? val : null;
};

export const isRebootLockedFromTags = (tags = []) => {
  for (const key of ['RebootLock', 'aws-domain-manager:reboot-lock']) {
    const val = findTagValue(tags, key);
    if (val) {
      const lower = val.toLowerCase();
      if (lower === 'true' || lower === '1' || lower === 'yes' || lower === 'locked') {
        return true;
      }
    }
  }
  return false;
};

/**
 * Load all EC2 instances and cross-reference Elastic IPs for an account
 * @param {Object} account - The AWS account object
 * @returns {Promise<Array>} Array of formatted EC2 instances
 */
export const loadEc2Instances = async (account) => {
  try {
    const client = createEC2Client(account);
    const instResp = await client.send(new DescribeInstancesCommand({}));

    const eipByInstance = new Map();
    const eipByPublicIp = new Map();
    try {
      const addrResp = await client.send(new DescribeAddressesCommand({}));
      for (const addr of addrResp.Addresses || []) {
        if (addr.PublicIp && addr.AllocationId) {
          eipByPublicIp.set(addr.PublicIp, addr.AllocationId);
        }
        if (addr.InstanceId && addr.PublicIp) {
          eipByInstance.set(addr.InstanceId, {
            publicIp: addr.PublicIp,
            allocationId: addr.AllocationId || null,
          });
        }
      }
    } catch {
      // Ignore if DescribeAddresses is not permitted
    }

    const instances = [];
    for (const reservation of instResp.Reservations || []) {
      for (const inst of reservation.Instances || []) {
        if (!inst.InstanceId) continue;
        const tags = inst.Tags || [];
        const name = findTagValue(tags, 'Name') || '-';
        const rebootLock = isRebootLockedFromTags(tags);
        const state = inst.State?.Name || 'unknown';
        const instanceType = inst.InstanceType || '-';
        const availabilityZone = inst.Placement?.AvailabilityZone || '-';
        const publicIp = inst.PublicIpAddress || '-';
        const privateIp = inst.PrivateIpAddress || '-';
        const ipv6FromNi = (inst.NetworkInterfaces || [])
          .flatMap((ni) => ni.Ipv6Addresses || [])
          .map((ip) => ip.Ipv6Address)
          .find(Boolean);
        const ipv6Address = inst.Ipv6Address || ipv6FromNi || '-';

        let elasticIp = null;
        let elasticIpAllocationId = null;
        if (eipByInstance.has(inst.InstanceId)) {
          const eipInfo = eipByInstance.get(inst.InstanceId);
          elasticIp = eipInfo.publicIp;
          elasticIpAllocationId = eipInfo.allocationId;
        } else if (publicIp !== '-' && eipByPublicIp.has(publicIp)) {
          elasticIp = publicIp;
          elasticIpAllocationId = eipByPublicIp.get(publicIp);
        }

        const securityGroups = (inst.SecurityGroups || []).map(
          (g) => `${g.GroupName || '-'} (${g.GroupId || '-'})`
        );

        instances.push({
          instanceId: inst.InstanceId,
          name,
          state,
          instanceType,
          availabilityZone,
          publicIp,
          privateIp,
          ipv6Address,
          elasticIp,
          elasticIpAllocationId,
          vpcId: inst.VpcId || '-',
          subnetId: inst.SubnetId || '-',
          keyName: inst.KeyName || '-',
          architecture: inst.Architecture || '-',
          platform: inst.PlatformDetails || 'Linux/UNIX',
          launchTime: inst.LaunchTime ? new Date(inst.LaunchTime).toISOString() : '-',
          securityGroups,
          rebootLock,
        });
      }
    }

    const rank = (s) => {
      if (s === 'running') return 0;
      if (s === 'pending' || s === 'rebooting') return 1;
      if (s === 'stopping') return 2;
      if (s === 'stopped') return 3;
      return 4;
    };

    instances.sort(
      (a, b) =>
        rank(a.state) - rank(b.state) ||
        a.name.localeCompare(b.name) ||
        a.instanceId.localeCompare(b.instanceId)
    );

    return instances;
  } catch (err) {
    throw new Error('Failed to load EC2 instances: ' + err.message);
  }
};

const fetchPtrRecordsMap = async (client, allocationIds) => {
  const map = new Map();
  if (!allocationIds || allocationIds.length === 0) return map;
  let nextToken;
  try {
    do {
      const resp = await client.send(
        new DescribeAddressesAttributeCommand({
          AllocationIds: allocationIds,
          Attribute: 'domain-name',
          NextToken: nextToken,
        })
      );
      for (const attr of resp.Addresses || []) {
        if (attr.AllocationId) {
          map.set(attr.AllocationId, {
            ptrRecord: attr.PtrRecord?.trim() || null,
            ptrUpdateStatus: attr.PtrRecordUpdate?.Status || null,
          });
        }
      }
      nextToken = resp.NextToken;
    } while (nextToken);
  } catch {
    // Gracefully degrade if DescribeAddressesAttribute is not permitted
  }
  return map;
};

/**
 * Load all Elastic IPs for an account (including Reverse DNS / PTR records)
 * @param {Object} account - The AWS account object
 * @returns {Promise<Array>} Array of formatted Elastic IPs
 */
export const loadElasticIps = async (account) => {
  try {
    const client = createEC2Client(account);
    const addrResp = await client.send(new DescribeAddressesCommand({}));

    const instanceNames = new Map();
    try {
      const instResp = await client.send(new DescribeInstancesCommand({}));
      for (const res of instResp.Reservations || []) {
        for (const inst of res.Instances || []) {
          if (inst.InstanceId) {
            const name = findTagValue(inst.Tags || [], 'Name');
            if (name) {
              instanceNames.set(inst.InstanceId, name);
            }
          }
        }
      }
    } catch {
      // Ignore if DescribeInstances fails
    }

    const allocIds = (addrResp.Addresses || []).map((a) => a.AllocationId).filter(Boolean);
    const ptrMap = await fetchPtrRecordsMap(client, allocIds);

    const eips = (addrResp.Addresses || []).map((addr) => {
      const allocationId = addr.AllocationId || '-';
      const instanceId = addr.InstanceId || null;
      const ptrInfo = ptrMap.get(allocationId) || { ptrRecord: null, ptrUpdateStatus: null };
      return {
        allocationId,
        publicIp: addr.PublicIp || '-',
        name: findTagValue(addr.Tags || [], 'Name') || '-',
        associationId: addr.AssociationId || null,
        instanceId,
        instanceName: instanceId ? instanceNames.get(instanceId) || null : null,
        privateIp: addr.PrivateIpAddress || '-',
        networkInterfaceId: addr.NetworkInterfaceId || '-',
        domain: addr.Domain || 'vpc',
        publicIpv4Pool: addr.PublicIpv4Pool || 'amazon',
        networkBorderGroup: addr.NetworkBorderGroup || account.region || '-',
        ptrRecord: ptrInfo.ptrRecord,
        ptrUpdateStatus: ptrInfo.ptrUpdateStatus,
      };
    });

    eips.sort((a, b) => a.publicIp.localeCompare(b.publicIp));
    return eips;
  } catch (err) {
    throw new Error('Failed to load Elastic IPs: ' + err.message);
  }
};

const ensureNotRebootLocked = async (client, instanceId, actionLabel) => {
  const resp = await client.send(
    new DescribeInstancesCommand({ InstanceIds: [instanceId] })
  );
  for (const res of resp.Reservations || []) {
    for (const inst of res.Instances || []) {
      if (isRebootLockedFromTags(inst.Tags || [])) {
        throw new Error(
          `Instance ${instanceId} has Reboot Lock enabled. Unlock it before attempting to ${actionLabel}.`
        );
      }
    }
  }
};

/**
 * Reboot an EC2 instance (blocked if Reboot Lock is enabled)
 */
export const rebootEc2Instance = async (account, instanceId) => {
  try {
    const client = createEC2Client(account);
    await ensureNotRebootLocked(client, instanceId, 'reboot');
    await client.send(new RebootInstancesCommand({ InstanceIds: [instanceId] }));
    return `Reboot initiated for EC2 instance ${instanceId}.`;
  } catch (err) {
    throw new Error('Failed to reboot instance: ' + err.message);
  }
};

/**
 * Start a stopped EC2 instance
 */
export const startEc2Instance = async (account, instanceId) => {
  try {
    const client = createEC2Client(account);
    await client.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
    return `Start initiated for EC2 instance ${instanceId}.`;
  } catch (err) {
    throw new Error('Failed to start instance: ' + err.message);
  }
};

/**
 * Stop a running EC2 instance (blocked if Reboot Lock is enabled)
 */
export const stopEc2Instance = async (account, instanceId) => {
  try {
    const client = createEC2Client(account);
    await ensureNotRebootLocked(client, instanceId, 'stop');
    await client.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
    return `Stop initiated for EC2 instance ${instanceId}.`;
  } catch (err) {
    throw new Error('Failed to stop instance: ' + err.message);
  }
};

/**
 * Toggle Reboot Lock on an EC2 instance using the RebootLock tag
 */
export const setEc2RebootLock = async (account, instanceId, locked) => {
  try {
    const client = createEC2Client(account);
    if (locked) {
      await client.send(
        new CreateTagsCommand({
          Resources: [instanceId],
          Tags: [{ Key: 'RebootLock', Value: 'true' }],
        })
      );
      return `Reboot Lock enabled for instance ${instanceId} (Tag RebootLock=true).`;
    } else {
      await client.send(
        new DeleteTagsCommand({
          Resources: [instanceId],
          Tags: [{ Key: 'RebootLock' }, { Key: 'aws-domain-manager:reboot-lock' }],
        })
      );
      return `Reboot Lock disabled for instance ${instanceId}.`;
    }
  } catch (err) {
    throw new Error('Failed to update Reboot Lock: ' + err.message);
  }
};

/**
 * Allocate a new VPC Elastic IP with optional Name tag
 */
export const allocateElasticIp = async (account, name = '') => {
  try {
    const client = createEC2Client(account);
    const resp = await client.send(new AllocateAddressCommand({ Domain: 'vpc' }));
    const allocationId = resp.AllocationId || '';
    const publicIp = resp.PublicIp || '';
    const cleanName = (name || '').trim();
    if (cleanName && allocationId) {
      await client.send(
        new CreateTagsCommand({
          Resources: [allocationId],
          Tags: [{ Key: 'Name', Value: cleanName }],
        })
      );
    }
    return {
      allocationId,
      publicIp,
      name: cleanName || '-',
    };
  } catch (err) {
    throw new Error('Failed to allocate Elastic IP: ' + err.message);
  }
};

/**
 * Associate an Elastic IP with an EC2 instance
 */
export const associateElasticIp = async (account, allocationId, instanceId) => {
  try {
    const client = createEC2Client(account);
    const resp = await client.send(
      new AssociateAddressCommand({
        AllocationId: allocationId,
        InstanceId: instanceId,
        AllowReassociation: true,
      })
    );
    return `Associated Elastic IP (${allocationId}) with instance ${instanceId} (${resp.AssociationId || '-'}).`;
  } catch (err) {
    throw new Error('Failed to associate Elastic IP: ' + err.message);
  }
};

/**
 * Disassociate an Elastic IP from its instance/network interface
 */
export const disassociateElasticIp = async (account, associationId) => {
  try {
    const client = createEC2Client(account);
    await client.send(
      new DisassociateAddressCommand({ AssociationId: associationId })
    );
    return `Disassociated Elastic IP (association ${associationId}).`;
  } catch (err) {
    throw new Error('Failed to disassociate Elastic IP: ' + err.message);
  }
};

export const resetElasticIpReverseDns = async (account, allocationId) => {
  const trimmed = (allocationId || '').trim();
  if (!trimmed) throw new Error('Elastic IP allocation ID is required.');
  try {
    const client = createEC2Client(account);
    await client.send(
      new ResetAddressAttributeCommand({
        AllocationId: trimmed,
        Attribute: 'domain-name',
      })
    );
    return `Cleared Reverse DNS (PTR) record for ${trimmed}.`;
  } catch (err) {
    throw new Error(`Failed to clear Reverse DNS for ${trimmed}: ${err.message}`);
  }
};

export const updateElasticIpReverseDns = async (account, allocationId, domainName) => {
  const trimmedAlloc = (allocationId || '').trim();
  if (!trimmedAlloc) throw new Error('Elastic IP allocation ID is required.');
  const trimmedDomain = (domainName || '').trim();
  if (!trimmedDomain) {
    return resetElasticIpReverseDns(account, trimmedAlloc);
  }
  try {
    const client = createEC2Client(account);
    await client.send(
      new ModifyAddressAttributeCommand({
        AllocationId: trimmedAlloc,
        DomainName: trimmedDomain,
      })
    );
    return `Updated Reverse DNS (PTR) for ${trimmedAlloc} to "${trimmedDomain}".`;
  } catch (err) {
    throw new Error(`Failed to update Reverse DNS for ${trimmedAlloc}: ${err.message}`);
  }
};

const looksLikeReverseDnsBlock = (msg) => {
  const lower = String(msg || '').toLowerCase();
  return (
    lower.includes('reverse dns') ||
    lower.includes('ptr') ||
    lower.includes('domain-name') ||
    lower.includes('domain name')
  );
};

/**
 * Release an unassociated Elastic IP, automatically clearing any Reverse DNS (PTR) record first.
 */
export const releaseElasticIp = async (account, allocationId) => {
  const trimmed = (allocationId || '').trim();
  if (!trimmed) throw new Error('Elastic IP allocation ID is required.');

  const client = createEC2Client(account);
  let clearedPtr = false;
  const ptrMap = await fetchPtrRecordsMap(client, [trimmed]);
  const detectedPtr = ptrMap.get(trimmed)?.ptrRecord || null;

  if (detectedPtr) {
    try {
      await client.send(
        new ResetAddressAttributeCommand({
          AllocationId: trimmed,
          Attribute: 'domain-name',
        })
      );
      clearedPtr = true;
    } catch (err) {
      throw new Error(
        `Failed to clear Reverse DNS record (${detectedPtr}) before releasing ${trimmed}: ${err.message}`
      );
    }
  }

  try {
    await client.send(new ReleaseAddressCommand({ AllocationId: trimmed }));
    return detectedPtr
      ? `Cleared Reverse DNS (${detectedPtr}) and released Elastic IP ${trimmed}.`
      : `Released Elastic IP ${trimmed}.`;
  } catch (firstErr) {
    if (clearedPtr || looksLikeReverseDnsBlock(firstErr.message)) {
      if (!clearedPtr) {
        try {
          await client.send(
            new ResetAddressAttributeCommand({
              AllocationId: trimmed,
              Attribute: 'domain-name',
            })
          );
        } catch (resetErr) {
          throw new Error(
            `Elastic IP ${trimmed} has a Reverse DNS record and clearing it failed: ${resetErr.message}`
          );
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        await client.send(new ReleaseAddressCommand({ AllocationId: trimmed }));
        return `Cleared Reverse DNS and released Elastic IP ${trimmed}.`;
      } catch (retryErr) {
        throw new Error(
          `Cleared Reverse DNS for ${trimmed}, but releasing Elastic IP still failed: ${retryErr.message}`
        );
      }
    }
    throw new Error(`Failed to release Elastic IP ${trimmed}: ${firstErr.message}`);
  }
};
