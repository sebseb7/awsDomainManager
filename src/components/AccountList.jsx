import React from 'react';
import { Box, Text } from 'ink';
import { maskCredential } from '../utils/profiles.js';

const AccountList = ({ accounts, selectedIndex = 0 }) => {
  if (accounts.length === 0) {
    return (
      <Box>
        <Text dimColor>No AWS accounts configured</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>{'  '}{'Profile'.padEnd(20)}</Text>
        <Text bold>{'Region'.padEnd(18)}</Text>
        <Text bold>{'Access Key ID'.padEnd(20)}</Text>
        <Text bold>Session Token</Text>
      </Box>
      {accounts.map((account, index) => {
        const isSelected = index === selectedIndex;
        const color = isSelected ? 'cyan' : undefined;
        const profileDisplay = account.profile.substring(0, 18);
        const regionDisplay = (account.region || 'us-east-1').substring(0, 16);
        const accessKeyDisplay = maskCredential(account.accessKeyId);
        const tokenDisplay = account.sessionToken ? 'Set' : '-';

        return (
          <Box key={account.profile}>
            <Text color={color}>
              {isSelected ? '▸ ' : '  '}
              {profileDisplay.padEnd(20)}
            </Text>
            <Text color={color}>{regionDisplay.padEnd(18)}</Text>
            <Text color={color}>{accessKeyDisplay.padEnd(20)}</Text>
            <Text color={color}>{tokenDisplay}</Text>
          </Box>
        );
      })}
    </Box>
  );
};

export default AccountList;
