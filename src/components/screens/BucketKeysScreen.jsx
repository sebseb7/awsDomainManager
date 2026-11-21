import React from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import CreatedIamUsersModal from '../CreatedIamUsersModal.jsx';

const AddBucketKeyForm = ({ role, bucketName, existingReadCount, userName, setUserName, onSubmit, onCancel }) => {
  useInput((input, key) => {
    if (key.escape) {
      onCancel?.();
    }
  });

  const isWrite = role === 'put-only';
  const defaultPlaceholder = isWrite
    ? `default: ${bucketName}-put`
    : `default: ${bucketName}-read${existingReadCount > 0 ? `-${existingReadCount + 1}` : ''}`;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Text bold color="cyan">
        {isWrite
          ? `Create Write (Put-Only) IAM Key for "${bucketName}"`
          : `Add Read (Read-Only) IAM Key for "${bucketName}"`}
      </Text>
      <Box marginTop={1}>
        <Box flexShrink={0}>
          <Text color="cyan">IAM Username (optional): </Text>
        </Box>
        <TextInput
          value={userName}
          placeholder={defaultPlaceholder}
          focus={true}
          showCursor
          onChange={setUserName}
          onSubmit={onSubmit}
        />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press Enter to create key, or Esc to cancel</Text>
      </Box>
    </Box>
  );
};

const BucketKeysScreen = ({
  selectedAccount,
  selectedBucket,
  bucketRegion,
  bucketKeys,
  loading,
  selectedKeyIndex,
  addKeyRole,
  addKeyUserName,
  setAddKeyUserName,
  submitAddBucketKey,
  cancelAddBucketKey,
  keyConfirmAction,
  createdIamResult,
  dismissCreatedIamResult,
  statusMessage,
}) => {
  const writeUsers = bucketKeys.filter((u) => u.role === 'put-only');
  const readUsers = bucketKeys.filter((u) => u.role === 'read-only');
  const highlightedKey = bucketKeys[selectedKeyIndex];
  const isModalOpen = Boolean(addKeyRole) || Boolean(keyConfirmAction) || Boolean(createdIamResult);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={1}>
        <Text color="green">
          ✓ Account: {selectedAccount.name} | IAM Keys for s3://{selectedBucket?.name} ({bucketRegion || selectedAccount.region || 'us-east-1'})
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>
          <Text bold color="yellow">Write (Put-Only): {writeUsers.length}/1</Text>
          <Text dimColor> (max 1)   </Text>
          <Text bold color="cyan">Read (Read-Only): {readUsers.length}</Text>
          <Text dimColor> (multiple allowed)</Text>
        </Text>
      </Box>

      {statusMessage && !isModalOpen && (
        <Box marginBottom={1}>
          <Text color="green">✓ {statusMessage}</Text>
        </Box>
      )}

      {createdIamResult ? (
        <CreatedIamUsersModal
          bucketName={createdIamResult.bucketName}
          region={createdIamResult.region}
          users={createdIamResult.users}
          isScopedIamUsers={createdIamResult.isScopedIamUsers}
          title={createdIamResult.title}
          onDismiss={dismissCreatedIamResult}
        />
      ) : addKeyRole ? (
        <AddBucketKeyForm
          role={addKeyRole}
          bucketName={selectedBucket?.name || ''}
          existingReadCount={readUsers.length}
          userName={addKeyUserName}
          setUserName={setAddKeyUserName}
          onSubmit={submitAddBucketKey}
          onCancel={cancelAddBucketKey}
        />
      ) : keyConfirmAction && highlightedKey ? (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color="yellow" bold>
              {keyConfirmAction === 'revoke'
                ? 'Revoke & Delete IAM User Confirmation'
                : 'Recreate IAM Access Key Confirmation'}
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text>
              {keyConfirmAction === 'revoke'
                ? 'Permanently revoke all access keys and delete this IAM user?'
                : 'Revoke existing access key(s) and issue a brand-new access key?'}
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="cyan" bold>  IAM User: {highlightedKey.userName}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="cyan" bold>  Role:     {highlightedKey.roleLabel}</Text>
          </Box>
          <Box>
            <Text color="green" bold>
              Press &apos;y&apos; to confirm {keyConfirmAction === 'revoke' ? 'revocation' : 'recreation'}
            </Text>
            <Text> | </Text>
            <Text color="red" bold>Press &apos;n&apos; to cancel</Text>
          </Box>
        </Box>
      ) : loading ? (
        <Box>
          <Text>Loading IAM keys for {selectedBucket?.name}...</Text>
        </Box>
      ) : bucketKeys.length === 0 ? (
        <Box>
          <Text dimColor>No managed IAM keys/users found for this bucket.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box>
            <Text bold>{'  '}{'Role'.padEnd(10)}</Text>
            <Text bold>{'IAM User'.padEnd(32)}</Text>
            <Text bold>{'Access Key ID'.padEnd(26)}</Text>
            <Text bold>Created (UTC)</Text>
          </Box>
          {bucketKeys.map((u, idx) => {
            const isSelected = idx === selectedKeyIndex;
            const roleTag = u.role === 'put-only' ? '[WRITE]' : '[READ]';
            const roleColor = isSelected ? 'cyan' : u.role === 'put-only' ? 'yellow' : 'blue';
            const rowColor = isSelected ? 'cyan' : undefined;
            const userNameDisplay =
              u.userName.length > 30 ? `${u.userName.slice(0, 27)}...` : u.userName;
            const keySummary =
              u.accessKeys.length === 0
                ? '(no active key)'
                : u.accessKeys.map((k) => k.accessKeyId).join(', ');
            const keyDisplay =
              keySummary.length > 24 ? `${keySummary.slice(0, 21)}...` : keySummary;

            return (
              <Box key={u.userName}>
                <Text color={roleColor} bold={isSelected}>
                  {isSelected ? '▸ ' : '  '}
                  {roleTag.padEnd(10)}
                </Text>
                <Text color={rowColor}>{userNameDisplay.padEnd(32)}</Text>
                <Text color={rowColor}>{keyDisplay.padEnd(26)}</Text>
                <Text color={rowColor}>{u.createdAt}</Text>
              </Box>
            );
          })}
        </Box>
      )}

      {!isModalOpen && !loading && (
        <Box marginTop={1}>
          <Text dimColor>
            {bucketKeys.length > 0
              ? 'Use ↑/↓ arrows, w to create write key (max 1), n to add read key, r to recreate, d to revoke, or Esc to go back'
              : 'Press w to create write key (max 1), n to add read key, or Esc to go back'}
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default BucketKeysScreen;
