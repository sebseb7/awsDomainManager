import React from 'react';
import { Box, Text } from 'ink';

const ObjectList = ({ objects, loading, selectedIndex = 0 }) => {
  if (loading) {
    return (
      <Box>
        <Text>Loading objects...</Text>
      </Box>
    );
  }

  if (objects.length === 0) {
    return (
      <Box>
        <Text dimColor>No objects found in this location</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>{'  '}{'Name'.padEnd(42)}</Text>
        <Text bold>{'Size'.padEnd(14)}</Text>
        <Text bold>Last Modified (UTC)</Text>
      </Box>
      {objects.map((item, index) => {
        const isSelected = index === selectedIndex;
        const color = isSelected ? 'cyan' : item.isFolder ? 'yellow' : undefined;
        const nameDisplay =
          item.displayName.length > 40
            ? `${item.displayName.slice(0, 37)}...`
            : item.displayName;

        return (
          <Box key={item.key}>
            <Text color={color}>
              {isSelected ? '▸ ' : '  '}
              {nameDisplay.padEnd(42)}
            </Text>
            <Text color={color}>{item.formattedSize.padEnd(14)}</Text>
            <Text color={color}>{item.formattedDate}</Text>
          </Box>
        );
      })}
    </Box>
  );
};

export default ObjectList;
