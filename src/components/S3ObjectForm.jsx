import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

const UPLOAD_FIELDS = ['localPath', 'key'];
const DOWNLOAD_FIELDS = ['destinationPath'];

const FIELD_LABELS = {
  localPath: 'Local File Path',
  key: 'S3 Object Key',
  destinationPath: 'Save To Path',
};

const S3ObjectForm = ({ mode, targetKey, formData, setFormData, onSubmit, onCancel }) => {
  const isUpload = mode === 'upload';
  const fieldOrder = isUpload ? UPLOAD_FIELDS : DOWNLOAD_FIELDS;
  const [focusedField, setFocusedField] = useState(fieldOrder[0]);

  const getValue = (fieldName) => formData[fieldName] || '';

  const setValue = (fieldName, value) => {
    setFormData((prev) => ({ ...prev, [fieldName]: value }));
  };

  const nextField = () => {
    const idx = fieldOrder.indexOf(focusedField);
    setFocusedField(fieldOrder[(idx + 1) % fieldOrder.length]);
  };

  const prevField = () => {
    const idx = fieldOrder.indexOf(focusedField);
    setFocusedField(fieldOrder[(idx - 1 + fieldOrder.length) % fieldOrder.length]);
  };

  useInput((input, key) => {
    if (key.escape) {
      onCancel?.();
      return;
    }
    if (fieldOrder.length > 1) {
      if (key.tab) {
        if (key.shift) {
          prevField();
        } else {
          nextField();
        }
        return;
      }
      if (key.upArrow) {
        prevField();
        return;
      }
      if (key.downArrow) {
        nextField();
        return;
      }
    }
  });

  const getPlaceholder = (fieldName) => {
    if (fieldName === 'localPath') return '/path/to/file.txt or ~/file.txt';
    if (fieldName === 'key') return 'Leave blank to use local filename';
    if (fieldName === 'destinationPath') return './downloaded-file';
    return '';
  };

  return (
    <Box flexDirection="column" borderStyle="round" padding={1}>
      <Text bold>{isUpload ? 'Upload File to S3' : 'Download S3 Object'}</Text>

      {!isUpload && targetKey && (
        <Box marginTop={1}>
          <Text dimColor>Source Key: {targetKey}</Text>
        </Box>
      )}

      {fieldOrder.map((fieldName, idx) => (
        <Box key={fieldName} marginTop={idx === 0 ? 1 : 0}>
          <Box flexShrink={0}>
            <Text color={focusedField === fieldName ? 'cyan' : undefined}>
              {FIELD_LABELS[fieldName]}:{' '}
            </Text>
          </Box>
          <TextInput
            value={getValue(fieldName)}
            placeholder={getPlaceholder(fieldName)}
            focus={focusedField === fieldName}
            showCursor
            onChange={(val) => setValue(fieldName, val)}
            onSubmit={() => {
              if (fieldName === fieldOrder[fieldOrder.length - 1]) {
                onSubmit();
              } else {
                nextField();
              }
            }}
          />
        </Box>
      ))}

      <Box marginTop={1}>
        <Text dimColor>
          {isUpload
            ? 'Type to edit, Enter to advance (uploads on last field), ↑/↓ or Tab to cycle, Esc to cancel'
            : 'Type destination path, Enter to download, Esc to cancel'}
        </Text>
      </Box>
    </Box>
  );
};

export default S3ObjectForm;
