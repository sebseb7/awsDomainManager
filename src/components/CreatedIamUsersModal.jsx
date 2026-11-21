import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { buildBucketQrPayload, renderQrLines } from '../utils/qrCode.js';

const CreatedIamUsersModal = ({
  bucketName,
  region,
  users,
  isScopedIamUsers = true,
  title,
  onDismiss,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeUser = users[activeIndex] || users[0];

  useInput((input, key) => {
    if (key.return || key.escape) {
      onDismiss?.();
      return;
    }
    if (users.length > 1) {
      if (key.leftArrow || (key.tab && key.shift)) {
        setActiveIndex((prev) => (prev - 1 + users.length) % users.length);
      } else if (key.rightArrow || key.tab) {
        setActiveIndex((prev) => (prev + 1) % users.length);
      }
    }
  });

  const qrLines = useMemo(() => {
    if (!activeUser) return [];
    const payload = buildBucketQrPayload({
      bucket: bucketName,
      region,
      role: activeUser.role,
      accessKeyId: activeUser.accessKeyId,
      secretAccessKey: activeUser.secretAccessKey,
    });
    return renderQrLines(payload, { margin: 2, errorCorrectionLevel: 'L' });
  }, [bucketName, region, activeUser]);

  if (!activeUser) {
    return null;
  }

  const hasRole = Boolean(activeUser.role);
  const schemaExample = hasRole
    ? '{"bucket":"<bucket>","region":"<region>","role":"put-only|read-only","accessKeyId":"<key>","secretAccessKey":"<secret>"}'
    : '{"bucket":"<bucket>","region":"<region>","accessKeyId":"<key>","secretAccessKey":"<secret>"}';

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" padding={1}>
      <Text bold color="green">
        ✓{' '}
        {title ||
          `Bucket "${bucketName}" (${region}) created${
            isScopedIamUsers ? ` with IAM user${users.length > 1 ? 's' : ''}` : ''
          }`}
      </Text>

      {isScopedIamUsers ? (
        <Box marginTop={1}>
          <Text color="yellow" bold>
            Save these credentials now — AWS will not display the Secret Access Key again!
          </Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text dimColor>
            Using profile &quot;{activeUser.userName}&quot; credentials (no separate bucket IAM user created).
          </Text>
        </Box>
      )}

      {users.length > 1 && (
        <Box marginTop={1}>
          <Text color="cyan" bold>
            ◀ User {activeIndex + 1}/{users.length}: {activeUser.userName} ({activeUser.role}) ▶
          </Text>
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Text>
          <Text bold>Bucket:            </Text>
          {bucketName} ({region})
        </Text>
        {isScopedIamUsers && (
          <>
            <Text>
              <Text bold>IAM User:          </Text>
              <Text color="cyan">{activeUser.userName}</Text>
            </Text>
            <Text>
              <Text bold>Access Level:      </Text>
              {activeUser.roleLabel}
            </Text>
          </>
        )}
        <Text>
          <Text bold>Access Key ID:     </Text>
          {activeUser.accessKeyId}
        </Text>
        <Text>
          <Text bold>Secret Access Key: </Text>
          {activeUser.secretAccessKey}
        </Text>
      </Box>

      {qrLines.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {qrLines.map((line, idx) => (
            <Text key={idx} color="black" backgroundColor="white">
              {line}
            </Text>
          ))}
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Text bold>QR Code Format (Compact JSON):</Text>
        <Text color="cyan">{schemaExample}</Text>
        <Text dimColor>
          Fields: bucket = S3 bucket name, region = AWS region
          {hasRole ? ', role = IAM scope (put-only or read-only)' : ''}, accessKeyId &amp; secretAccessKey = AWS credentials
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          {users.length > 1
            ? 'Use ←/→ or Tab to switch IAM users, Enter or Esc to continue'
            : 'Press Enter or Esc to continue'}
        </Text>
      </Box>
    </Box>
  );
};

export default CreatedIamUsersModal;
