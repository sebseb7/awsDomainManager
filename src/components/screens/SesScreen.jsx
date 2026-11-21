import React from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

const AddSesIdentityForm = ({ identityInput, setIdentityInput, onSubmit, onCancel }) => {
  useInput((input, key) => {
    if (key.escape) {
      onCancel?.();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Text bold color="cyan">Add Amazon SES Identity (Domain or Email Address)</Text>
      <Box marginTop={1}>
        <Box flexShrink={0}>
          <Text color="cyan">Domain or Email: </Text>
        </Box>
        <TextInput
          value={identityInput}
          placeholder="example.com or noreply@example.com"
          focus={true}
          showCursor
          onChange={setIdentityInput}
          onSubmit={onSubmit}
        />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press Enter to create identity, or Esc to cancel</Text>
      </Box>
    </Box>
  );
};

const SesScreen = ({
  selectedAccount,
  sesIdentities,
  loading,
  selectedSesIndex,
  showAddSesIdentity,
  setShowAddSesIdentity,
  sesIdentityInput,
  setSesIdentityInput,
  addSesIdentity,
  showDeleteConfirm,
  statusMessage,
}) => {
  const domainCount = sesIdentities.filter((i) => i.identityType === 'DOMAIN').length;
  const emailCount = sesIdentities.filter((i) => i.identityType === 'EMAIL_ADDRESS').length;
  const highlighted = sesIdentities[selectedSesIndex];
  const isModalOpen = showAddSesIdentity || showDeleteConfirm;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={1}>
        <Text color="green">
          ✓ Using account: {selectedAccount.name} ({selectedAccount.profile}) — Region: {selectedAccount.region || 'us-east-1'}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>
          <Text bold color="yellow">Domains: {domainCount}</Text>
          <Text dimColor>   |   </Text>
          <Text bold color="cyan">Email Addresses: {emailCount}</Text>
          <Text dimColor>   |   </Text>
          <Text bold>Total: {sesIdentities.length}</Text>
        </Text>
      </Box>

      {statusMessage && !isModalOpen && (
        <Box marginBottom={1}>
          <Text color="green">✓ {statusMessage}</Text>
        </Box>
      )}

      {showAddSesIdentity ? (
        <AddSesIdentityForm
          identityInput={sesIdentityInput}
          setIdentityInput={setSesIdentityInput}
          onSubmit={addSesIdentity}
          onCancel={() => setShowAddSesIdentity(false)}
        />
      ) : showDeleteConfirm && highlighted ? (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color="yellow" bold>Delete Amazon SES Identity Confirmation</Text>
          </Box>
          <Box marginBottom={1}>
            <Text>Are you sure you want to delete this SES identity?</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="cyan" bold>  Identity: {highlighted.identityName}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="cyan" bold>  Type:     {highlighted.typeLabel}</Text>
          </Box>
          <Box>
            <Text color="green" bold>Press &apos;y&apos; to confirm deletion</Text>
            <Text> | </Text>
            <Text color="red" bold>Press &apos;n&apos; to cancel</Text>
          </Box>
        </Box>
      ) : loading ? (
        <Box>
          <Text>Loading Amazon SES identities...</Text>
        </Box>
      ) : sesIdentities.length === 0 ? (
        <Box>
          <Text dimColor>No Amazon SES identities found in {selectedAccount.region || 'us-east-1'}.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box>
            <Text bold>{'  '}{'Type'.padEnd(11)}</Text>
            <Text bold>{'Identity (Domain / Email)'.padEnd(36)}</Text>
            <Text bold>{'Verification'.padEnd(16)}</Text>
            <Text bold>{'DKIM'.padEnd(14)}</Text>
            <Text bold>Sending</Text>
          </Box>
          {sesIdentities.map((item, idx) => {
            const isSelected = idx === selectedSesIndex;
            const isDomain = item.identityType === 'DOMAIN';
            const typeTag = isDomain ? '[DOMAIN]' : '[EMAIL]';
            const typeColor = isSelected ? 'cyan' : isDomain ? 'yellow' : 'blue';
            const rowColor = isSelected ? 'cyan' : undefined;
            const nameDisplay =
              item.identityName.length > 34
                ? `${item.identityName.slice(0, 31)}...`
                : item.identityName;
            const verColor = isSelected
              ? 'cyan'
              : item.verificationStatus === 'SUCCESS'
                ? 'green'
                : item.verificationStatus === 'PENDING'
                  ? 'yellow'
                  : 'red';
            const dkimColor = isSelected
              ? 'cyan'
              : item.dkimStatus === 'SUCCESS'
                ? 'green'
                : item.dkimStatus === 'PENDING'
                  ? 'yellow'
                  : undefined;

            return (
              <Box key={item.identityName}>
                <Text color={typeColor} bold={isSelected}>
                  {isSelected ? '▸ ' : '  '}
                  {typeTag.padEnd(11)}
                </Text>
                <Text color={rowColor}>{nameDisplay.padEnd(36)}</Text>
                <Text color={verColor}>{(item.verificationStatus || '-').padEnd(16)}</Text>
                <Text color={dkimColor} dimColor={!isSelected && item.dkimStatus === '-'}>
                  {(item.dkimStatus || '-').padEnd(14)}
                </Text>
                <Text
                  color={isSelected ? 'cyan' : item.sendingEnabled ? 'green' : undefined}
                  dimColor={!isSelected && !item.sendingEnabled}
                >
                  {item.sendingEnabled ? 'Enabled' : 'Disabled'}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {!isModalOpen && !loading && (
        <Box marginTop={1}>
          <Text dimColor>
            {sesIdentities.length > 0
              ? 'Use ↑/↓ arrows, a to add domain/email identity, d to delete, or Esc to go back'
              : 'Press a to add a domain or email identity, or Esc to go back'}
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default SesScreen;
