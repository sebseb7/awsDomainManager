import React from 'react';
import { Box, Text } from 'ink';

const BucketList = ({ buckets, loading, selectedIndex = 0 }) => {
  if (loading) {
    return (
      <Box>
        <Text>Loading S3 buckets...</Text>
      </Box>
    );
  }

  if (buckets.length === 0) {
    return (
      <Box>
        <Text dimColor>No S3 buckets found in this account</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>{'  '}{'Bucket Name'.padEnd(42)}</Text>
        <Text bold>Created (UTC)</Text>
      </Box>
      {buckets.map((bucket, index) => {
        const isSelected = index === selectedIndex;
        const color = isSelected ? 'cyan' : undefined;
        const nameDisplay = bucket.name.length > 40 ? `${bucket.name.slice(0, 37)}...` : bucket.name;

        return (
          <Box key={bucket.name}>
            <Text color={color}>
              {isSelected ? '▸ ' : '  '}
              {nameDisplay.padEnd(42)}
            </Text>
            <Text color={color}>{bucket.formattedDate}</Text>
          </Box>
        );
      })}
    </Box>
  );
};

export default BucketList;
