import React from 'react';
import { Box, Text } from 'ink';
import BucketList from '../BucketList.jsx';
import AddBucketForm from '../AddBucketForm.jsx';
import CreatedIamUsersModal from '../CreatedIamUsersModal.jsx';

const BucketScreen = ({
  selectedAccount,
  buckets,
  loading,
  selectedBucketIndex,
  showAddBucket,
  setShowAddBucket,
  bucketFormData,
  setBucketFormData,
  addBucket,
  createdIamResult,
  dismissCreatedIamResult,
  showDeleteConfirm,
  statusMessage,
}) => {
  const highlightedBucket = buckets[selectedBucketIndex];
  const isModalOpen = showAddBucket || showDeleteConfirm || Boolean(createdIamResult);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={1}>
        <Text color="green">
          ✓ Using account: {selectedAccount.name} ({selectedAccount.profile})
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
          onDismiss={dismissCreatedIamResult}
        />
      ) : showAddBucket ? (
        <AddBucketForm
          bucketData={bucketFormData}
          setBucketData={setBucketFormData}
          onSubmit={addBucket}
          onCancel={() => setShowAddBucket(false)}
        />
      ) : showDeleteConfirm && highlightedBucket ? (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color="yellow" bold>Delete S3 Bucket Confirmation</Text>
          </Box>
          <Box marginBottom={1}>
            <Text>Are you sure you want to delete this S3 bucket? (Bucket must be empty)</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="cyan" bold>  Bucket: {highlightedBucket.name}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="cyan" bold>  Created: {highlightedBucket.formattedDate}</Text>
          </Box>
          <Box>
            <Text color="green" bold>Press &apos;y&apos; to confirm deletion</Text>
            <Text> | </Text>
            <Text color="red" bold>Press &apos;n&apos; to cancel</Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column">
          <BucketList
            buckets={buckets}
            loading={loading}
            selectedIndex={selectedBucketIndex}
          />
        </Box>
      )}

      {!isModalOpen && buckets.length > 0 && !loading && (
        <Box marginTop={1}>
          <Text dimColor>
            Use ↑/↓ arrows, Enter to browse objects, a to create bucket, d to delete, or Esc to go back
          </Text>
        </Box>
      )}

      {!isModalOpen && buckets.length === 0 && !loading && (
        <Box marginTop={1}>
          <Text dimColor>Press a to create a new S3 bucket, or Esc to go back</Text>
        </Box>
      )}
    </Box>
  );
};

export default BucketScreen;
