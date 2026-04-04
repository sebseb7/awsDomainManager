import React from 'react';
import { Box, Text, useInput } from 'ink';

const AddRecordForm = ({ newRecord, setNewRecord, addRecord, onCancel, loading }) => {
  const [focusedField, setFocusedField] = React.useState('name');

  useInput((input, key) => {
    if (key.escape) {
      if (onCancel) onCancel();
      return;
    }

    if (key.return) {
      if (focusedField === 'ttl') {
        addRecord();
      } else {
        // Move to next field
        if (focusedField === 'name') setFocusedField('value');
        else if (focusedField === 'value') setFocusedField('ttl');
      }
      return;
    }

    if (key.tab) {
      if (focusedField === 'name') setFocusedField('value');
      else if (focusedField === 'value') setFocusedField('ttl');
      else if (focusedField === 'ttl') setFocusedField('name');
      return;
    }

    // Update field value
    if (focusedField === 'name') {
      setNewRecord({ ...newRecord, name: newRecord.name + input });
    } else if (focusedField === 'value') {
      setNewRecord({ ...newRecord, value: newRecord.value + input });
    } else if (focusedField === 'ttl') {
      if (/\d/.test(input)) {
        setNewRecord({ ...newRecord, ttl: newRecord.ttl + input });
      }
    }
  });

  const handleBackspace = (key) => {
    if (key.backspace) {
      if (focusedField === 'name' && newRecord.name.length > 0) {
        setNewRecord({ ...newRecord, name: newRecord.name.slice(0, -1) });
      } else if (focusedField === 'value' && newRecord.value.length > 0) {
        setNewRecord({ ...newRecord, value: newRecord.value.slice(0, -1) });
      } else if (focusedField === 'ttl' && newRecord.ttl.length > 1) {
        setNewRecord({ ...newRecord, ttl: newRecord.ttl.slice(0, -1) });
      }
    }
  };

  return (
    <Box flexDirection="column" borderStyle="round" padding={1}>
      <Text bold>Add A Record</Text>
      
      <Box marginTop={1}>
        <Text>
          Name{focusedField === 'name' ? '>' : ' '}: {newRecord.name}
          {focusedField === 'name' && <Text>_</Text>}
        </Text>
      </Box>

      <Box>
        <Text>
          Value{focusedField === 'value' ? '>' : ' '}: {newRecord.value}
          {focusedField === 'value' && <Text>_</Text>}
        </Text>
      </Box>

      <Box>
        <Text>
          TTL{focusedField === 'ttl' ? '>' : ' '}: {newRecord.ttl}
          {focusedField === 'ttl' && <Text>_</Text>}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Press Enter to advance, Tab to cycle, Escape to cancel
        </Text>
      </Box>
    </Box>
  );
};

export default AddRecordForm;
