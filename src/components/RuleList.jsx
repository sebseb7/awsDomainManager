import React from 'react';
import { Box, Text } from 'ink';

const RuleList = ({ rules, loading, selectedIndex = 0 }) => {
  if (loading) {
    return (
      <Box>
        <Text>Loading inbound rules...</Text>
      </Box>
    );
  }

  if (rules.length === 0) {
    return (
      <Box>
        <Text dimColor>No inbound rules found</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>{'Rule ID'.padEnd(24)}</Text>
        <Text bold>{'Type'.padEnd(16)}</Text>
        <Text bold>{'Port'.padEnd(12)}</Text>
        <Text bold>{'Source'.padEnd(22)}</Text>
        <Text bold>Description</Text>
      </Box>
      {rules.map((rule, index) => {
        const ruleIdDisplay = rule.id ? rule.id.substring(0, 22) : 'N/A';
        return (
          <Box key={rule.id || index}>
            <Text color={index === selectedIndex ? 'cyan' : undefined}>
              {index === selectedIndex ? '▸ ' : '  '}
              {ruleIdDisplay.padEnd(22)}
            </Text>
            <Text color={index === selectedIndex ? 'cyan' : undefined}>
              {rule.type.padEnd(16)}
            </Text>
            <Text color={index === selectedIndex ? 'cyan' : undefined}>
              {rule.port.padEnd(12)}
            </Text>
            <Text color={index === selectedIndex ? 'cyan' : undefined}>
              {rule.source.padEnd(22)}
            </Text>
            <Text color={index === selectedIndex ? 'cyan' : undefined}>
              {rule.description}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};

export default RuleList;
