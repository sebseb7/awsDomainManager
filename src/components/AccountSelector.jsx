import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

const AccountSelector = ({ accounts, selectedAccount, setSelectedAccount, onSelect }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
      setSelectedAccount(accounts[selectedIndex - 1]);
    } else if (key.downArrow && selectedIndex < accounts.length - 1) {
      setSelectedIndex(selectedIndex + 1);
      setSelectedAccount(accounts[selectedIndex + 1]);
    } else if (input === ' ' || key.return) {
      setSelectedAccount(accounts[selectedIndex]);
      if (onSelect) {
        onSelect(accounts[selectedIndex]);
      }
    }
  });

  return (
    <Box flexDirection="column">
      {accounts.map((account, index) => (
        <Box key={account.id} paddingLeft={index === selectedIndex ? 1 : 0}>
          <Text color={index === selectedIndex ? 'green' : undefined}>
            {index === selectedIndex ? '▸ ' : '  '}
            {account.name} ({account.profile})
          </Text>
        </Box>
      ))}
    </Box>
  );
};

export default AccountSelector;
