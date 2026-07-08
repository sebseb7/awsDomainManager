import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

const AddRuleForm = ({ ruleData, setRuleData, addRule, onCancel, loading }) => {
  const [focusedField, setFocusedField] = useState('protocol');

  const fieldOrder = ['protocol', 'fromPort', 'toPort', 'source', 'description'];
  const fieldLabels = {
    protocol: 'Protocol (tcp/udp/-1)',
    fromPort: 'From Port',
    toPort: 'To Port',
    source: 'Source CIDR',
    description: 'Description',
  };

  const getValue = (fieldName) => {
    if (fieldName === 'protocol') return ruleData.protocol || 'tcp';
    if (fieldName === 'fromPort') return ruleData.fromPort !== undefined ? String(ruleData.fromPort) : '';
    if (fieldName === 'toPort') return ruleData.toPort !== undefined ? String(ruleData.toPort) : '';
    if (fieldName === 'source') return ruleData.source || '';
    if (fieldName === 'description') return ruleData.description || '';
    return '';
  };

  const setValue = (fieldName, value) => {
    if (fieldName === 'protocol') {
      setRuleData(prev => ({ ...prev, protocol: value }));
    } else if (fieldName === 'fromPort') {
      if (/^-?\d*$/.test(value)) {
        setRuleData(prev => ({ ...prev, fromPort: value === '' ? '' : parseInt(value) }));
      }
    } else if (fieldName === 'toPort') {
      if (/^-?\d*$/.test(value)) {
        setRuleData(prev => ({ ...prev, toPort: value === '' ? '' : parseInt(value) }));
      }
    } else if (fieldName === 'source') {
      setRuleData(prev => ({ ...prev, source: value }));
    } else if (fieldName === 'description') {
      setRuleData(prev => ({ ...prev, description: value }));
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

  return (
    <Box flexDirection="column" borderStyle="round" padding={1}>
      <Text bold>Add Inbound Rule</Text>

      {fieldOrder.map((fieldName) => (
        <Box key={fieldName} marginTop={fieldName === 'protocol' ? 1 : 0}>
          <Text>{fieldLabels[fieldName]}: </Text>
          <TextInput
            value={getValue(fieldName)}
            focus={focusedField === fieldName}
            showCursor
            onChange={(val) => setValue(fieldName, val)}
            onSubmit={() => {
              if (fieldName === 'description') {
                addRule();
              } else {
                nextField();
              }
            }}
          />
        </Box>
      ))}

      <Box marginTop={1}>
        <Text dimColor>Type to edit, Enter to advance, \u2191/\u2193 or Tab to cycle, Esc to cancel</Text>
      </Box>
    </Box>
  );
};

export default AddRuleForm;
