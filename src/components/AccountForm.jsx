import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

const FIELD_ORDER = ['profile', 'region', 'accessKeyId', 'secretAccessKey', 'sessionToken'];

const FIELD_LABELS = {
  profile: 'Profile Name',
  region: 'Region',
  accessKeyId: 'Access Key ID',
  secretAccessKey: 'Secret Access Key',
  sessionToken: 'Session Token (optional)',
};

const AccountForm = ({
  mode,
  editingProfile,
  accountData,
  setAccountData,
  onSubmit,
  onCancel,
}) => {
  const [focusedField, setFocusedField] = useState('profile');

  const isEdit = mode === 'edit';

  const getValue = (fieldName) => accountData[fieldName] || '';

  const setValue = (fieldName, value) => {
    setAccountData((prev) => ({ ...prev, [fieldName]: value }));
  };

  const getPlaceholder = (fieldName) => {
    if (fieldName === 'profile') return 'e.g. default, prod, dev';
    if (fieldName === 'region') return 'us-east-1';
    if (fieldName === 'accessKeyId') return 'AKIA...';
    if (fieldName === 'secretAccessKey') {
      return isEdit ? '(leave blank to keep current)' : 'Required';
    }
    if (fieldName === 'sessionToken') return '(optional)';
    return '';
  };

  const nextField = () => {
    const idx = FIELD_ORDER.indexOf(focusedField);
    setFocusedField(FIELD_ORDER[(idx + 1) % FIELD_ORDER.length]);
  };

  const prevField = () => {
    const idx = FIELD_ORDER.indexOf(focusedField);
    setFocusedField(FIELD_ORDER[(idx - 1 + FIELD_ORDER.length) % FIELD_ORDER.length]);
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
  });

  const title = isEdit
    ? `Edit AWS Account (${editingProfile})`
    : 'Add AWS Account';

  return (
    <Box flexDirection="column" borderStyle="round" padding={1}>
      <Text bold>{title}</Text>

      {FIELD_ORDER.map((fieldName) => {
        const isSecret = fieldName === 'secretAccessKey' || fieldName === 'sessionToken';
        return (
          <Box key={fieldName} marginTop={fieldName === 'profile' ? 1 : 0}>
            <Box flexShrink={0}>
              <Text color={focusedField === fieldName ? 'cyan' : undefined}>
                {FIELD_LABELS[fieldName]}:{' '}
              </Text>
            </Box>
            <TextInput
              value={getValue(fieldName)}
              placeholder={getPlaceholder(fieldName)}
              mask={isSecret ? '*' : undefined}
              focus={focusedField === fieldName}
              showCursor
              onChange={(val) => setValue(fieldName, val)}
              onSubmit={() => {
                if (fieldName === FIELD_ORDER[FIELD_ORDER.length - 1]) {
                  onSubmit();
                } else {
                  nextField();
                }
              }}
            />
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text dimColor>
          Type to edit, Enter to advance (saves on last field), ↑/↓ or Tab to cycle, Esc to cancel
        </Text>
      </Box>
    </Box>
  );
};

export default AccountForm;
