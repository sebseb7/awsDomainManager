import React from 'react';
import { Box, Text, useInput } from 'ink';

const CreatedIamUsersModal = ({ bucketName, region, users, onDismiss }) => {
  useInput((input, key) => {
    if (key.return || key.escape) {
      onDismiss?.();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" padding={1}>
      <Text bold color="green">
        ✓ Bucket &quot;{bucketName}&quot; ({region}) created with IAM user{users.length > 1 ? 's' : ''}
      </Text>

      <Box marginTop={1}>
        <Text color="yellow" bold>
          Save these credentials now — AWS will not display the Secret Access Key again!
        </Text>
      </Box>

      {users.map((u) => (
        <Box key={u.userName} flexDirection="column" marginTop={1}>
          <Text bold color="cyan">
            IAM User: {u.userName}
          </Text>
          <Text>  Access Level:      {u.roleLabel}</Text>
          <Text>  Access Key ID:     {u.accessKeyId}</Text>
          <Text>  Secret Access Key: {u.secretAccessKey}</Text>
        </Box>
      ))}

      <Box marginTop={1}>
        <Text dimColor>Press Enter or Esc to continue</Text>
      </Box>
    </Box>
  );
};

export default CreatedIamUsersModal;
