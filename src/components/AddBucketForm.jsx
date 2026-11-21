import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { IAM_ACCESS_OPTIONS } from '../services/iamService.js';

const AddBucketForm = ({ bucketData, setBucketData, onSubmit, onCancel }) => {
  const [focusedField, setFocusedField] = useState('name');

  const iamAccess = bucketData.iamAccess || 'none';
  const showUserNameField = iamAccess !== 'none';
  const fieldOrder = showUserNameField
    ? ['name', 'region', 'iamAccess', 'iamUserName']
    : ['name', 'region', 'iamAccess'];

  const getValue = (fieldName) => bucketData[fieldName] || '';

  const setValue = (fieldName, value) => {
    setBucketData((prev) => ({ ...prev, [fieldName]: value }));
  };

  const nextField = () => {
    const idx = fieldOrder.indexOf(focusedField);
    setFocusedField(fieldOrder[(idx + 1) % fieldOrder.length]);
  };

  const prevField = () => {
    const idx = fieldOrder.indexOf(focusedField);
    setFocusedField(fieldOrder[(idx - 1 + fieldOrder.length) % fieldOrder.length]);
  };

  const cycleIamAccess = (delta) => {
    const currentIdx = IAM_ACCESS_OPTIONS.findIndex((o) => o.id === iamAccess);
    const nextIdx = (currentIdx + delta + IAM_ACCESS_OPTIONS.length) % IAM_ACCESS_OPTIONS.length;
    setValue('iamAccess', IAM_ACCESS_OPTIONS[nextIdx].id);
  };

  useInput((input, key) => {
    if (key.escape) {
      onCancel?.();
      return;
    }
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

    if (focusedField === 'iamAccess') {
      if (key.leftArrow) {
        cycleIamAccess(-1);
        return;
      }
      if (key.rightArrow || input === ' ') {
        cycleIamAccess(1);
        return;
      }
      if (key.return) {
        if (showUserNameField) {
          setFocusedField('iamUserName');
        } else {
          onSubmit();
        }
        return;
      }
    }
  });

  const selectedAccessOption =
    IAM_ACCESS_OPTIONS.find((o) => o.id === iamAccess) || IAM_ACCESS_OPTIONS[0];

  const getDefaultUserPlaceholder = () => {
    const base = (bucketData.name || '').trim() || 'bucket';
    if (iamAccess === 'put-only') return `default: ${base}-put`;
    if (iamAccess === 'read-only') return `default: ${base}-read`;
    if (iamAccess === 'both') return `default: ${base}-put & ${base}-read`;
    return '';
  };

  return (
    <Box flexDirection="column" borderStyle="round" padding={1}>
      <Text bold>Create S3 Bucket</Text>

      <Box marginTop={1}>
        <Box flexShrink={0}>
          <Text color={focusedField === 'name' ? 'cyan' : undefined}>
            Bucket Name:{' '}
          </Text>
        </Box>
        <TextInput
          value={getValue('name')}
          placeholder="my-unique-bucket-name"
          focus={focusedField === 'name'}
          showCursor
          onChange={(val) => setValue('name', val)}
          onSubmit={nextField}
        />
      </Box>

      <Box>
        <Box flexShrink={0}>
          <Text color={focusedField === 'region' ? 'cyan' : undefined}>
            Region:{' '}
          </Text>
        </Box>
        <TextInput
          value={getValue('region')}
          placeholder="us-east-1"
          focus={focusedField === 'region'}
          showCursor
          onChange={(val) => setValue('region', val)}
          onSubmit={nextField}
        />
      </Box>

      <Box>
        <Box flexShrink={0}>
          <Text color={focusedField === 'iamAccess' ? 'cyan' : undefined}>
            IAM User:{' '}
          </Text>
        </Box>
        <Text color={focusedField === 'iamAccess' ? 'green' : undefined} bold={focusedField === 'iamAccess'}>
          {focusedField === 'iamAccess' ? '◀ ' : '  '}
          {selectedAccessOption.label}
          {focusedField === 'iamAccess' ? ' ▶' : ''}
        </Text>
      </Box>

      {showUserNameField && (
        <Box>
          <Box flexShrink={0}>
            <Text color={focusedField === 'iamUserName' ? 'cyan' : undefined}>
              {iamAccess === 'both' ? 'IAM Username Prefix' : 'IAM Username'} (optional):{' '}
            </Text>
          </Box>
          <TextInput
            value={getValue('iamUserName')}
            placeholder={getDefaultUserPlaceholder()}
            focus={focusedField === 'iamUserName'}
            showCursor
            onChange={(val) => setValue('iamUserName', val)}
            onSubmit={onSubmit}
          />
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          Type to edit, ←/→ or Space on IAM User to choose role, Enter to advance/create, ↑/↓ or Tab to cycle, Esc to cancel
        </Text>
      </Box>
    </Box>
  );
};

export default AddBucketForm;
