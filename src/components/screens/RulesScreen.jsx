import React from 'react';
import { Box, Text } from 'ink';
import RuleList from '../RuleList.jsx';
import AddRuleForm from '../AddRuleForm.jsx';

const RulesScreen = ({
  selectedAccount,
  selectedGroup,
  rules,
  loading,
  showAddRule,
  setShowAddRule,
  ruleData,
  setRuleData,
  addRule,
  selectedRuleIndex,
  showDeleteConfirm,
  setShowDeleteConfirm,
  deleteRule,
}) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={1}>
        <Text color="green">
          {'\u2713'} Account: {selectedAccount.name} | SG: {selectedGroup?.GroupName} ({selectedGroup?.GroupId})
        </Text>
      </Box>
      {showAddRule ? (
        <AddRuleForm
          ruleData={ruleData}
          setRuleData={setRuleData}
          addRule={addRule}
          loading={loading}
          onCancel={() => setShowAddRule(false)}
        />
      ) : showDeleteConfirm && rules.length > 0 ? (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color="yellow" bold>Delete Rule Confirmation</Text>
          </Box>
          <Box marginBottom={1}>
            <Text>Are you sure you want to delete the inbound rule:</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="cyan" bold>  Rule ID: {rules[selectedRuleIndex]?.id}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="cyan" bold>  Type: {rules[selectedRuleIndex]?.type}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="cyan" bold>  Port: {rules[selectedRuleIndex]?.port}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="cyan" bold>  Source: {rules[selectedRuleIndex]?.source}</Text>
          </Box>
          <Box>
            <Text color="green" bold>Press 'y' to confirm deletion</Text>
            <Text> | </Text>
            <Text color="red" bold>Press 'n' to cancel</Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column">
          <RuleList rules={rules} loading={loading} selectedIndex={selectedRuleIndex} />
        </Box>
      )}
      {!showAddRule && !showDeleteConfirm && rules.length > 0 && (
        <Box marginTop={1}>
          <Text dimColor>Use up/down arrows, d to delete, a to add rule, or press escape to go back</Text>
        </Box>
      )}
      {!showAddRule && !showDeleteConfirm && rules.length === 0 && !loading && (
        <Box marginTop={1}>
          <Text dimColor>Press a to add a new inbound rule, or escape to go back</Text>
        </Box>
      )}
    </Box>
  );
};

export default RulesScreen;
