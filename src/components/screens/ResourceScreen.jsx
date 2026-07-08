import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

const RESOURCE_TYPES = [
  { id: 'route53', label: 'Route53 Hosted Zones (DNS Records)' },
  { id: 'ec2', label: 'EC2 Security Groups (Inbound Rules)' },
];

const ResourceScreen = ({ selectedResource, setSelectedResource, setScreen }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    } else if (key.downArrow && selectedIndex < RESOURCE_TYPES.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    } else if (input === ' ' || key.return) {
      setSelectedResource(RESOURCE_TYPES[selectedIndex]);
      setScreen('account');
    }
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={1}>
        <Text bold>Select Resource Type:</Text>
      </Box>
      {RESOURCE_TYPES.map((resource, index) => (
        <Box key={resource.id} paddingLeft={index === selectedIndex ? 1 : 0}>
          <Text color={index === selectedIndex ? 'green' : undefined}>
            {index === selectedIndex ? '\u25b8 ' : '  '}
            {resource.label}
          </Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor>Use up/down arrows and enter to select</Text>
      </Box>
    </Box>
  );
};

export default ResourceScreen;
