import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

const ZoneSelector = ({ zones, selectedZone, setSelectedZone, onSelect }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
      setSelectedZone(zones[selectedIndex - 1]);
    } else if (key.downArrow && selectedIndex < zones.length - 1) {
      setSelectedIndex(selectedIndex + 1);
      setSelectedZone(zones[selectedIndex + 1]);
    } else if (input === ' ' || key.return) {
      const zone = zones[selectedIndex];
      setSelectedZone(zone);
      if (onSelect) {
        onSelect(zone);
      }
    }
  });

  return (
    <Box flexDirection="column">
      {zones.map((zone, index) => {
        const zoneName = zone.Name?.replace(/\.$/, '') || 'Unknown';
        return (
          <Box key={zone.Id} paddingLeft={index === selectedIndex ? 1 : 0}>
            <Text color={index === selectedIndex ? 'green' : undefined}>
              {index === selectedIndex ? '▸ ' : '  '}
              {zoneName}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};

export default ZoneSelector;
