import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

const AddRecordForm = ({ newRecord, setNewRecord, addRecord, onCancel, loading }) => {
  const [focusedField, setFocusedField] = useState('name');

  const fieldOrder = ['name', 'value', 'ttl'];
  const fieldLabels = { name: 'Name', value: 'Value', ttl: 'TTL' };

  const getValue = (fieldName) => {
    if (fieldName === 'name') return newRecord.name || '';
    if (fieldName === 'value') return newRecord.value || '';
    if (fieldName === 'ttl') return String(newRecord.ttl || 300);
    return '';
  };

  const setValue = (fieldName, value) => {
    if (fieldName === 'name') {
      setNewRecord(prev => ({ ...prev, name: value }));
    } else if (fieldName === 'value') {
      setNewRecord(prev => ({ ...prev, value }));
    } else if (fieldName === 'ttl') {
      if (/^\d*$/.test(value)) {
        setNewRecord(prev => ({ ...prev, ttl: value === '' ? 300 : parseInt(value) }));
      }
    }
  };

  const nextField = () => {
    const idx = fieldOrder.indexOf(focusedField);
    const next = fieldOrder[(idx + 1) % fieldOrder.length];
    setFocusedField(next);
  };

  const prevField = () => {
    const idx = fieldOrder.indexOf(focusedField);
    const prev = fieldOrder[(idx - 1 + fieldOrder.length) % fieldOrder.length];
    setFocusedField(prev);
  };

  // Only handle Escape, Tab, and arrows at the global level; TextInput handles Enter/onSubmit
  useInput((input, key) => {
    if (key.escape) {
      onCancel?.();
      return;
    }

    if (key.tab) {
      // Shift+Tab goes backwards
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

  const recordTypeLabel = newRecord.type || 'A';

  return (
    <Box flexDirection="column" borderStyle="round" padding={1}>
      <Text bold>Add {recordTypeLabel} Record</Text>

      {fieldOrder.map((fieldName) => (
        <Box key={fieldName} marginTop={fieldName === 'name' ? 1 : 0}>
          <Text>{fieldLabels[fieldName]}: </Text>
          <TextInput
            value={getValue(fieldName)}
            focus={focusedField === fieldName}
            showCursor
            onChange={(val) => setValue(fieldName, val)}
            onSubmit={() => {
              if (fieldName === 'ttl') {
                addRecord();
              } else {
                nextField();
              }
            }}
          />
        </Box>
      ))}

      <Box marginTop={1}>
        <Text dimColor>
          Type to edit, Enter to advance, ↑/↓ or Tab to cycle, Esc to cancel
        </Text>
      </Box>
    </Box>
  );
};

export default AddRecordForm;
