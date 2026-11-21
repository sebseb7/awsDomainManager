import React from 'react';
import { Box, Text } from 'ink';
import AccountSelector from '../AccountSelector.jsx';

const AccountScreen = ({
  accounts,
  selectedAccount,
  setSelectedAccount,
  setScreen,
  selectedResource,
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
          // Navigate to the correct screen based on selected resource
          if (selectedResource?.id === 'ec2-instances') {
            setScreen('ec2-instances');
          } else if (selectedResource?.id === 'ec2') {
            setScreen('sg');
          } else if (selectedResource?.id === 's3') {
            setScreen('s3-buckets');
          } else if (selectedResource?.id === 'ses') {
            setScreen('ses-identities');
          } else {
            setScreen('zone');
          }
        }}
      />
      <Box marginTop={1}>
        <Text dimColor>Use up/down arrows and enter to select, or press escape to go back</Text>
      </Box>
    </Box>
  );
};

export default AccountScreen;
