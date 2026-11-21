import React from 'react';
import { Box, Text } from 'ink';
import ObjectList from '../ObjectList.jsx';
import S3ObjectForm from '../S3ObjectForm.jsx';

const BucketObjectsScreen = ({
  selectedAccount,
  selectedBucket,
  bucketPrefix,
  objects,
  loading,
  selectedObjectIndex,
  objectFormMode,
  objectFormData,
  setObjectFormData,
  submitObjectForm,
  cancelObjectForm,
  showDeleteConfirm,
  statusMessage,
}) => {
  const highlightedObject = objects[selectedObjectIndex];
  const locationPath = `s3://${selectedBucket?.name}/${bucketPrefix || ''}`;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={1}>
        <Text color="green">
          ✓ Account: {selectedAccount.name} | {locationPath}
        </Text>
      </Box>

      {statusMessage && !objectFormMode && !showDeleteConfirm && (
        <Box marginBottom={1}>
          <Text color="green">✓ {statusMessage}</Text>
        </Box>
      )}

      {objectFormMode ? (
        <S3ObjectForm
          mode={objectFormMode}
          targetKey={highlightedObject?.key}
          formData={objectFormData}
          setFormData={setObjectFormData}
          onSubmit={submitObjectForm}
          onCancel={cancelObjectForm}
        />
      ) : showDeleteConfirm && highlightedObject && !highlightedObject.isFolder ? (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color="yellow" bold>Delete S3 Object Confirmation</Text>
          </Box>
          <Box marginBottom={1}>
            <Text>Are you sure you want to delete this object?</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="cyan" bold>  Key: {highlightedObject.key}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="cyan" bold>  Size: {highlightedObject.formattedSize}</Text>
          </Box>
          <Box>
            <Text color="green" bold>Press &apos;y&apos; to confirm deletion</Text>
            <Text> | </Text>
            <Text color="red" bold>Press &apos;n&apos; to cancel</Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column">
          <ObjectList
            objects={objects}
            loading={loading}
            selectedIndex={selectedObjectIndex}
          />
        </Box>
      )}

      {!objectFormMode && !showDeleteConfirm && objects.length > 0 && !loading && (
        <Box marginTop={1}>
          <Text dimColor>
            Use ↑/↓ arrows, Enter to open folder, k for IAM keys, u to upload, g to download, d to delete, or Esc to go back
          </Text>
        </Box>
      )}

      {!objectFormMode && !showDeleteConfirm && objects.length === 0 && !loading && (
        <Box marginTop={1}>
          <Text dimColor>Press u to upload a file, k for IAM keys, or Esc to go back</Text>
        </Box>
      )}
    </Box>
  );
};

export default BucketObjectsScreen;
