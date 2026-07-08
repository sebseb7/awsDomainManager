import React from 'react';
import { Box, Text } from 'ink';
import SecurityGroupList from '../SecurityGroupList.jsx';

const SecurityGroupScreen = ({
  selectedAccount,
  securityGroups,
  selectedGroup,
  setSelectedGroup,
  setScreen,
  loading,
}) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={1}>
        <Text color="green">
          {'\u2713'} Using account: {selectedAccount.name} ({selectedAccount.profile})
        </Text>
      </Box>
      {securityGroups.length > 0 ? (
        <Box>
          <Text>Select Security Group: </Text>
          <SecurityGroupList
            groups={securityGroups}
            selectedGroup={selectedGroup}
            setSelectedGroup={setSelectedGroup}
            onSelect={(group) => {
              setSelectedGroup(group);
              setScreen('rules');
            }}
          />
        </Box>
      ) : (
        <Box>
          {loading ? (
            <Text>Loading security groups...</Text>
          ) : (
            <Text>No security groups found in this account.</Text>
          )}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>Use up/down arrows and enter to select, or press escape to go back</Text>
      </Box>
    </Box>
  );
};

export default SecurityGroupScreen;
