import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

const SecurityGroupList = ({ groups, selectedGroup, setSelectedGroup, onSelect }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
      setSelectedGroup(groups[selectedIndex - 1]);
    } else if (key.downArrow && selectedIndex < groups.length - 1) {
      setSelectedIndex(selectedIndex + 1);
      setSelectedGroup(groups[selectedIndex + 1]);
    } else if (input === ' ' || key.return) {
      const group = groups[selectedIndex];
      setSelectedGroup(group);
      if (onSelect) {
        onSelect(group);
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>{'Name'.padEnd(30)}</Text>
        <Text bold>{'Description'.padEnd(40)}</Text>
        <Text bold>{'VPC ID'.padEnd(22)}</Text>
      </Box>
      {groups.map((group, index) => (
        <Box key={group.GroupId} paddingLeft={index === selectedIndex ? 1 : 0}>
          <Text color={index === selectedIndex ? 'green' : undefined}>
            {index === selectedIndex ? '▸ ' : '  '}
            {(group.GroupName || 'Unknown').padEnd(30)}
          </Text>
          <Text color={index === selectedIndex ? 'green' : undefined}>
            {(group.Description || '').substring(0, 38).padEnd(40)}
          </Text>
          <Text color={index === selectedIndex ? 'green' : undefined}>
            {(group.VpcId || 'N/A').padEnd(22)}
          </Text>
        </Box>
      ))}
    </Box>
  );
};

export default SecurityGroupList;
