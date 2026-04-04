import React from 'react';
import { Box, Text } from 'ink';
import ZoneSelector from '../ZoneSelector.jsx';

const ZoneScreen = ({
  selectedAccount,
  hostedZones,
  selectedZone,
  setSelectedZone,
  setScreen,
  loading,
}) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={1}>
        <Text color="green">
          ✓ Using account: {selectedAccount.name} ({selectedAccount.profile})
        </Text>
      </Box>
      {hostedZones.length > 0 ? (
        <Box>
          <Text>Select Hosted Zone: </Text>
          <ZoneSelector
            zones={hostedZones}
            selectedZone={selectedZone}
            setSelectedZone={setSelectedZone}
            onSelect={(zone) => {
              setSelectedZone(zone);
              setScreen('records');
            }}
          />
        </Box>
      ) : (
        <Box>
          {loading ? (
            <Text>Loading zones...</Text>
          ) : (
            <Text>No hosted zones found in this account.</Text>
          )}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>Use up/down arrows and enter to select, or press escape to go back</Text>
      </Box>
    </Box>
  );
};

export default ZoneScreen;
