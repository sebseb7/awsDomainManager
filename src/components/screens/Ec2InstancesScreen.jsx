import React from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

const AllocateEipForm = ({ eipName, setEipName, onSubmit, onCancel }) => {
  useInput((input, key) => {
    if (key.escape) {
      onCancel?.();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Text bold color="cyan">Allocate New VPC Elastic IP</Text>
      <Box marginTop={1}>
        <Box flexShrink={0}>
          <Text color="cyan">Name Tag (optional): </Text>
        </Box>
        <TextInput
          value={eipName}
          placeholder="prod-web-eip"
          focus={true}
          showCursor
          onChange={setEipName}
          onSubmit={onSubmit}
        />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press Enter to allocate Elastic IP, or Esc to cancel</Text>
      </Box>
    </Box>
  );
};

const AssociateEipModal = ({ eip, instances, selectedIdx, setSelectedIdx, onConfirm, onCancel }) => {
  useInput((input, key) => {
    if (key.escape) {
      onCancel?.();
      return;
    }
    if (key.upArrow && selectedIdx > 0) {
      setSelectedIdx(selectedIdx - 1);
    } else if (key.downArrow && selectedIdx < instances.length - 1) {
      setSelectedIdx(selectedIdx + 1);
    } else if (key.return && instances[selectedIdx]) {
      onConfirm?.(instances[selectedIdx].instanceId);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Text bold color="cyan">
        Associate Elastic IP {eip.publicIp} ({eip.allocationId}) with EC2 Instance
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {instances.map((inst, idx) => {
          const isSelected = idx === selectedIdx;
          return (
            <Box key={inst.instanceId}>
              <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                {isSelected ? '▸ ' : '  '}
                {(inst.name !== '-' ? inst.name : '(unnamed)').padEnd(22)}
                {inst.instanceId.padEnd(21)}
                {inst.state.toUpperCase().padEnd(10)}
                {inst.privateIp}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Use ↑/↓ and Enter to associate, or Esc to cancel</Text>
      </Box>
    </Box>
  );
};

const InstanceDetailsModal = ({ instance, onClose }) => {
  useInput((input, key) => {
    if (key.escape || key.return || input === 'v') {
      onClose?.();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Text bold color="cyan">
        EC2 Instance Details — {instance.name !== '-' ? instance.name : instance.instanceId}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        <Text><Text bold>{'Instance ID:      '}</Text>{instance.instanceId}</Text>
        <Text><Text bold>{'Name Tag:         '}</Text>{instance.name}</Text>
        <Text>
          <Text bold>{'State:            '}</Text>
          <Text color={instance.state === 'running' ? 'green' : instance.state === 'stopped' ? 'red' : 'yellow'}>
            {instance.state.toUpperCase()}
          </Text>
        </Text>
        <Text>
          <Text bold>{'Reboot Lock:      '}</Text>
          <Text color={instance.rebootLock ? 'yellow' : 'green'}>
            {instance.rebootLock ? 'LOCKED (Tag RebootLock=true — reboot & stop blocked)' : 'Unlocked'}
          </Text>
        </Text>
        <Text><Text bold>{'Type & Arch:      '}</Text>{instance.instanceType} ({instance.architecture} · {instance.platform})</Text>
        <Text><Text bold>{'Availability Zone:'}</Text> {instance.availabilityZone}</Text>
        <Text>
          <Text bold>{'Public IPv4:      '}</Text>
          {instance.publicIp}
          {instance.elasticIp ? ` [Elastic IP: ${instance.elasticIpAllocationId || 'attached'}]` : ''}
        </Text>
        <Text><Text bold>{'Private IPv4:     '}</Text>{instance.privateIp}</Text>
        <Text><Text bold>{'IPv6 Address:     '}</Text>{instance.ipv6Address || '-'}</Text>
        <Text><Text bold>{'VPC / Subnet:     '}</Text>{instance.vpcId} / {instance.subnetId}</Text>
        <Text><Text bold>{'SSH Key Pair:     '}</Text>{instance.keyName}</Text>
        <Text><Text bold>{'Security Groups:  '}</Text>{(instance.securityGroups || []).join(', ') || '-'}</Text>
        <Text><Text bold>{'Launch Time:      '}</Text>{(instance.launchTime || '-').slice(0, 16).replace('T', ' ')}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press Enter or Esc to close</Text>
      </Box>
    </Box>
  );
};

const Ec2InstancesScreen = ({
  selectedAccount,
  ec2Instances = [],
  elasticIps = [],
  loading,
  selectedEc2Index = 0,
  showEc2DetailsModal,
  setShowEc2DetailsModal,
  showAllocateEipModal,
  setShowAllocateEipModal,
  newEipName,
  setNewEipName,
  submitAllocateEip,
  showAssociateEipModal,
  setShowAssociateEipModal,
  associateInstanceIdx,
  setAssociateInstanceIdx,
  submitAssociateEip,
  ec2ConfirmAction,
  statusMessage,
}) => {
  const runningCount = ec2Instances.filter((i) => i.state === 'running').length;
  const stoppedCount = ec2Instances.filter((i) => i.state === 'stopped').length;
  const lockedCount = ec2Instances.filter((i) => i.rebootLock).length;
  const associatedEips = elasticIps.filter((e) => Boolean(e.associationId)).length;
  const unassociatedEips = elasticIps.length - associatedEips;

  const isInstanceSelected = selectedEc2Index < ec2Instances.length;
  const highlightedInstance = isInstanceSelected ? ec2Instances[selectedEc2Index] : null;
  const highlightedEip = !isInstanceSelected
    ? elasticIps[selectedEc2Index - ec2Instances.length]
    : null;

  const isModalOpen =
    showEc2DetailsModal ||
    showAllocateEipModal ||
    showAssociateEipModal ||
    Boolean(ec2ConfirmAction);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={1}>
        <Text color="green">
          ✓ Using account: {selectedAccount.name} ({selectedAccount.profile}) — Region:{' '}
          {selectedAccount.region || 'us-east-1'}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>
          <Text bold color="green">Running: {runningCount}</Text>
          <Text dimColor>  |  </Text>
          <Text bold color="red">Stopped: {stoppedCount}</Text>
          <Text dimColor>  |  </Text>
          <Text bold color="yellow">Reboot Locked: {lockedCount}</Text>
          <Text dimColor>  |  </Text>
          <Text bold color="cyan">
            Elastic IPs: {elasticIps.length} ({associatedEips} associated, {unassociatedEips} idle)
          </Text>
        </Text>
      </Box>

      {statusMessage && !isModalOpen && (
        <Box marginBottom={1}>
          <Text color="green">✓ {statusMessage}</Text>
        </Box>
      )}

      {showEc2DetailsModal && highlightedInstance ? (
        <InstanceDetailsModal
          instance={highlightedInstance}
          onClose={() => setShowEc2DetailsModal(false)}
        />
      ) : showAllocateEipModal ? (
        <AllocateEipForm
          eipName={newEipName}
          setEipName={setNewEipName}
          onSubmit={submitAllocateEip}
          onCancel={() => setShowAllocateEipModal(false)}
        />
      ) : showAssociateEipModal && highlightedEip ? (
        <AssociateEipModal
          eip={highlightedEip}
          instances={ec2Instances}
          selectedIdx={associateInstanceIdx}
          setSelectedIdx={setAssociateInstanceIdx}
          onConfirm={submitAssociateEip}
          onCancel={() => setShowAssociateEipModal(false)}
        />
      ) : ec2ConfirmAction ? (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1}>
          <Text color="yellow" bold>
            Confirm {ec2ConfirmAction.label}
          </Text>
          <Box marginTop={1} marginBottom={1}>
            <Text>{ec2ConfirmAction.message}</Text>
          </Box>
          <Box>
            <Text color="green" bold>Press &apos;y&apos; to confirm</Text>
            <Text> | </Text>
            <Text color="red" bold>Press &apos;n&apos; to cancel</Text>
          </Box>
        </Box>
      ) : loading ? (
        <Box>
          <Text>Loading EC2 instances and Elastic IPs...</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {/* EC2 Instances Table */}
          <Box marginBottom={0}>
            <Text bold color="yellow">
              EC2 Instances ({ec2Instances.length})
            </Text>
          </Box>
          {ec2Instances.length === 0 ? (
            <Box marginBottom={1}>
              <Text dimColor>  No EC2 instances found in {selectedAccount.region || 'us-east-1'}.</Text>
            </Box>
          ) : (
            <Box flexDirection="column" marginBottom={1}>
              <Box>
                <Text bold>{'  '}{'Name'.padEnd(19)}</Text>
                <Text bold>{'Instance ID'.padEnd(21)}</Text>
                <Text bold>{'State'.padEnd(10)}</Text>
                <Text bold>{'Type / AZ'.padEnd(27)}</Text>
                <Text bold>{'Public IP'.padEnd(21)}</Text>
                <Text bold>{'Private IP'.padEnd(14)}</Text>
                <Text bold>Reboot Lock</Text>
              </Box>
              {ec2Instances.map((inst, idx) => {
                const isSelected = idx === selectedEc2Index;
                const rowColor = isSelected ? 'cyan' : undefined;
                const stateColor = isSelected
                  ? 'cyan'
                  : inst.state === 'running'
                    ? 'green'
                    : inst.state === 'stopped'
                      ? 'red'
                      : 'yellow';
                const pubDisplay = inst.elasticIp
                  ? `${inst.publicIp} [EIP]`
                  : inst.publicIp;
                const typeAz = `${inst.instanceType} (${inst.availabilityZone})`;
                const lockText = inst.rebootLock ? '[LOCKED]' : 'Unlocked';
                const lockColor = isSelected
                  ? 'cyan'
                  : inst.rebootLock
                    ? 'yellow'
                    : undefined;

                return (
                  <Box key={inst.instanceId}>
                    <Text color={rowColor} bold={isSelected}>
                      {isSelected ? '▸ ' : '  '}
                      {(inst.name !== '-' ? inst.name : '(unnamed)').slice(0, 17).padEnd(19)}
                    </Text>
                    <Text color={rowColor}>{inst.instanceId.padEnd(21)}</Text>
                    <Text color={stateColor} bold={isSelected}>
                      {inst.state.toUpperCase().padEnd(10)}
                    </Text>
                    <Text color={rowColor}>{typeAz.slice(0, 25).padEnd(27)}</Text>
                    <Text color={isSelected ? 'cyan' : inst.elasticIp ? 'blue' : undefined}>
                      {pubDisplay.padEnd(21)}
                    </Text>
                    <Text color={rowColor}>{inst.privateIp.padEnd(14)}</Text>
                    <Text
                      color={lockColor}
                      bold={inst.rebootLock || isSelected}
                      dimColor={!isSelected && !inst.rebootLock}
                    >
                      {lockText}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          )}

          {/* Elastic IPs Table */}
          <Box marginBottom={0}>
            <Text bold color="cyan">
              Elastic IPs ({elasticIps.length})
            </Text>
          </Box>
          {elasticIps.length === 0 ? (
            <Box>
              <Text dimColor>  No Elastic IPs allocated in {selectedAccount.region || 'us-east-1'}.</Text>
            </Box>
          ) : (
            <Box flexDirection="column">
              <Box>
                <Text bold>{'  '}{'Public IP'.padEnd(16)}</Text>
                <Text bold>{'Name'.padEnd(20)}</Text>
                <Text bold>{'Allocation ID'.padEnd(28)}</Text>
                <Text bold>{'Status'.padEnd(14)}</Text>
                <Text bold>{'Attached Instance / ENI'.padEnd(34)}</Text>
                <Text bold>Private IP</Text>
              </Box>
              {elasticIps.map((eip, idx) => {
                const globalIdx = ec2Instances.length + idx;
                const isSelected = globalIdx === selectedEc2Index;
                const rowColor = isSelected ? 'cyan' : undefined;
                const isAssociated = Boolean(eip.associationId);
                const statusText = isAssociated ? 'ASSOCIATED' : 'UNASSOCIATED';
                const statusColor = isSelected
                  ? 'cyan'
                  : isAssociated
                    ? 'green'
                    : 'yellow';
                const attachedDisplay = eip.instanceId
                  ? eip.instanceName
                    ? `${eip.instanceName} (${eip.instanceId})`
                    : eip.instanceId
                  : eip.networkInterfaceId !== '-'
                    ? eip.networkInterfaceId
                    : '— (Idle)';

                return (
                  <Box key={eip.allocationId}>
                    <Text color={rowColor} bold={isSelected}>
                      {isSelected ? '▸ ' : '  '}
                      {eip.publicIp.padEnd(16)}
                    </Text>
                    <Text color={rowColor}>
                      {(eip.name !== '-' ? eip.name : '(unnamed)').slice(0, 18).padEnd(20)}
                    </Text>
                    <Text color={rowColor}>{eip.allocationId.padEnd(28)}</Text>
                    <Text color={statusColor} bold={isSelected}>
                      {statusText.padEnd(14)}
                    </Text>
                    <Text color={rowColor}>
                      {attachedDisplay.slice(0, 32).padEnd(34)}
                    </Text>
                    <Text color={rowColor}>{eip.privateIp}</Text>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      )}

      {!isModalOpen && !loading && (
        <Box marginTop={1}>
          <Text dimColor>
            ↑/↓/Tab select | l lock/unlock | r reboot | s start/stop | v/Enter details | n allocate EIP | a associate EIP | u disassociate EIP | d release EIP | Esc
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default Ec2InstancesScreen;
