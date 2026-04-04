import React from 'react';
import { Box, Text } from 'ink';
import AccountSelector from '../AccountSelector.jsx';

const AccountScreen = ({
  accounts,
  selectedAccount,
  setSelectedAccount,
  setScreen,
}) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={1}>
        <Text>Select AWS Account: </Text>
      </Box>
      <AccountSelector
        accounts={accounts}
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
        onSelect={(account) => {
          setSelectedAccount(account);
          setScreen('zone');
        }}
      />
      <Box marginTop={1}>
        <Text dimColor>Use up/down arrows and enter to select, or press escape to quit</Text>
      </Box>
    </Box>
  );
};

export default AccountScreen;
