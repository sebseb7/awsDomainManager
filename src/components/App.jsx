import React from 'react';
import { Box, Text } from 'ink';
import AccountScreen from './screens/AccountScreen.jsx';
import ZoneScreen from './screens/ZoneScreen.jsx';
import RecordsScreen from './screens/RecordsScreen.jsx';

const App = ({
  screen,
  setScreen,
  accounts,
  selectedAccount,
  setSelectedAccount,
  hostedZones,
  selectedZone,
  setSelectedZone,
  records,
  loading,
  error,
  showAddRecord,
  setShowAddRecord,
  newRecord,
  setNewRecord,
  addRecord,
  selectedRecordIndex,
  showDeleteConfirm,
  setShowDeleteConfirm,
  deleteRecord,
}) => {
  // Render based on current screen
  const renderScreen = () => {
    switch (screen) {
      case 'account':
        return (
          <AccountScreen
            accounts={accounts}
            selectedAccount={selectedAccount}
            setSelectedAccount={setSelectedAccount}
            setScreen={setScreen}
          />
        );
      
      case 'zone':
        return (
          <ZoneScreen
            selectedAccount={selectedAccount}
            hostedZones={hostedZones}
            selectedZone={selectedZone}
            setSelectedZone={setSelectedZone}
            setScreen={setScreen}
            loading={loading}
          />
        );
      
      case 'records':
        return (
          <RecordsScreen
            selectedAccount={selectedAccount}
            selectedZone={selectedZone}
            records={records}
            loading={loading}
            showAddRecord={showAddRecord}
            setShowAddRecord={setShowAddRecord}
            newRecord={newRecord}
            setNewRecord={setNewRecord}
            addRecord={addRecord}
            selectedRecordIndex={selectedRecordIndex}
            showDeleteConfirm={showDeleteConfirm}
            setShowDeleteConfirm={setShowDeleteConfirm}
            deleteRecord={deleteRecord}
          />
        );
      
      default:
        return null;
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>
          AWS Route 53 Record Manager
        </Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {renderScreen()}
    </Box>
  );
};

export default App;
