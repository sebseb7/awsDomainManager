import React from 'react';
import { Box, Text } from 'ink';

const RecordList = ({ records, loading, selectedIndex = 0 }) => {
  if (loading) {
    return (
      <Box>
        <Text>Loading records...</Text>
      </Box>
    );
  }

  if (records.length === 0) {
    return (
      <Box>
        <Text dimColor>No A records found</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>{'Name'.padEnd(20)}</Text>
        <Text bold>{'Value'.padEnd(40)}</Text>
        <Text bold>TTL</Text>
      </Box>
      {records.map((record, index) => (
        <Box key={index}>
          <Text color={index === selectedIndex ? 'cyan' : undefined}>
            {index === selectedIndex ? '▸ ' : '  '}
            {record.name.padEnd(20)}
          </Text>
          <Text color={index === selectedIndex ? 'cyan' : undefined}>{record.value.padEnd(40)}</Text>
          <Text color={index === selectedIndex ? 'cyan' : undefined}>{record.ttl}</Text>
        </Box>
      ))}
    </Box>
  );
};

export default RecordList;
