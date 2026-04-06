import React from 'react';
import { Box, Text } from 'ink';
import RecordList from '../RecordList.jsx';
import AddRecordForm from '../AddRecordForm.jsx';

const RecordsScreen = ({
  selectedAccount,
  selectedZone,
  records,
  loading,
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
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={1}>
        <Text color="green">
          ✓ Account: {selectedAccount.name} | Zone: {selectedZone?.Name}
        </Text>
      </Box>
      {showAddRecord ? (
        <AddRecordForm
          newRecord={newRecord}
          setNewRecord={setNewRecord}
          addRecord={addRecord}
          loading={loading}
          onCancel={() => setShowAddRecord(false)}
        />
      ) : showDeleteConfirm && records.length > 0 ? (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color="yellow" bold>Delete Record Confirmation</Text>
          </Box>
          <Box marginBottom={1}>
            <Text>Are you sure you want to delete the record:</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="cyan" bold>  Name: {records[selectedRecordIndex]?.name}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="cyan" bold>  Type: {records[selectedRecordIndex]?.type || 'A'}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="cyan" bold>  Value: {records[selectedRecordIndex]?.value}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="cyan" bold>  TTL: {records[selectedRecordIndex]?.ttl}</Text>
          </Box>
          <Box>
            <Text color="green" bold>Press 'y' to confirm deletion</Text>
            <Text> | </Text>
            <Text color="red" bold>Press 'n' to cancel</Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column">
          <RecordList records={records} loading={loading} selectedIndex={selectedRecordIndex} />
        </Box>
      )}
      {!showAddRecord && !showDeleteConfirm && records.length > 0 && (
        <Box marginTop={1}>
          <Text dimColor>Use up/down arrows, d to delete, a/A/c/m/t/n to create records, or press escape to go back</Text>
        </Box>
      )}
    </Box>
  );
};

export default RecordsScreen;
