import React from 'react';
import { Box, Text } from 'ink';
import AccountList from '../AccountList.jsx';
import AccountForm from '../AccountForm.jsx';
import { maskCredential } from '../../utils/profiles.js';

const ManageAccountsScreen = ({
  accounts,
  selectedAccountIndex,
  accountFormMode,
  editingProfile,
  accountFormData,
  setAccountFormData,
  saveAccount,
  cancelAccountForm,
  showDeleteConfirm,
  statusMessage,
}) => {
  const selectedAccount = accounts[selectedAccountIndex];

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={1}>
        <Text dimColor>Credentials &amp; config: ~/.aws/credentials, ~/.aws/config</Text>
      </Box>

      {statusMessage && !accountFormMode && !showDeleteConfirm && (
        <Box marginBottom={1}>
          <Text color="green">✓ {statusMessage}</Text>
        </Box>
      )}

      {accountFormMode ? (
        <AccountForm
          mode={accountFormMode}
          editingProfile={editingProfile}
          accountData={accountFormData}
          setAccountData={setAccountFormData}
          onSubmit={saveAccount}
          onCancel={cancelAccountForm}
        />
      ) : showDeleteConfirm && selectedAccount ? (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color="yellow" bold>Remove AWS Account Confirmation</Text>
          </Box>
          <Box marginBottom={1}>
            <Text>Are you sure you want to remove this AWS profile from ~/.aws/credentials and ~/.aws/config?</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="cyan" bold>  Profile: {selectedAccount.profile}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="cyan" bold>  Region: {selectedAccount.region}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="cyan" bold>  Access Key ID: {maskCredential(selectedAccount.accessKeyId)}</Text>
          </Box>
          <Box>
            <Text color="green" bold>Press &apos;y&apos; to confirm removal</Text>
            <Text> | </Text>
            <Text color="red" bold>Press &apos;n&apos; to cancel</Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column">
          <AccountList accounts={accounts} selectedIndex={selectedAccountIndex} />
        </Box>
      )}

      {!accountFormMode && !showDeleteConfirm && accounts.length > 0 && (
        <Box marginTop={1}>
          <Text dimColor>Use ↑/↓ arrows, a to add, e or Enter to edit, d to remove, or Esc to go back</Text>
        </Box>
      )}

      {!accountFormMode && !showDeleteConfirm && accounts.length === 0 && (
        <Box marginTop={1}>
          <Text dimColor>Press a to add a new AWS account, or Esc to go back</Text>
        </Box>
      )}
    </Box>
  );
};

export default ManageAccountsScreen;
