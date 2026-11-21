import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import AccountList from '../AccountList.jsx';
import AccountForm from '../AccountForm.jsx';
import { maskCredential, VAULT_DISPLAY_PATH } from '../../utils/profiles.js';

const PinSetupBox = ({
  pinSetupInput = '',
  setPinSetupInput,
  pinSetupConfirmInput = '',
  setPinSetupConfirmInput,
  onSubmit,
  onCancel,
}) => {
  const [step, setStep] = useState('pin'); // 'pin' | 'confirm'

  useInput((input, key) => {
    if (key.escape) {
      onCancel?.();
      return;
    }
    if (key.tab || key.upArrow || key.downArrow) {
      setStep((prev) => (prev === 'pin' ? 'confirm' : 'pin'));
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1}>
      <Text bold color="yellow">
        Set 6-Digit Encryption PIN (First Account Setup)
      </Text>
      <Box marginTop={1}>
        <Text dimColor>
          Auth data is only stored encrypted with your 6-digit PIN. A random salt is hashed with
          your PIN so the app can verify your PIN on every launch.
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color={step === 'pin' ? 'cyan' : undefined}>Create 6-Digit PIN: </Text>
        <TextInput
          value={pinSetupInput}
          placeholder="6 digits (0-9)"
          mask="*"
          focus={step === 'pin'}
          showCursor
          onChange={(val) => setPinSetupInput?.(val.replace(/\D/g, '').slice(0, 6))}
          onSubmit={() => setStep('confirm')}
        />
      </Box>

      <Box>
        <Text color={step === 'confirm' ? 'cyan' : undefined}>Confirm 6-Digit PIN: </Text>
        <TextInput
          value={pinSetupConfirmInput}
          placeholder="Re-enter 6 digits"
          mask="*"
          focus={step === 'confirm'}
          showCursor
          onChange={(val) => setPinSetupConfirmInput?.(val.replace(/\D/g, '').slice(0, 6))}
          onSubmit={() => onSubmit?.()}
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Enter 6 digits (0-9), press Enter to advance/save, Tab or ↑/↓ to switch fields, Esc to go
          back
        </Text>
      </Box>
    </Box>
  );
};

const ManageAccountsScreen = ({
  accounts,
  authStatus,
  selectedAccountIndex,
  accountFormMode,
  editingProfile,
  accountFormData,
  setAccountFormData,
  saveAccount,
  cancelAccountForm,
  showPinSetupModal,
  pinSetupInput,
  setPinSetupInput,
  pinSetupConfirmInput,
  setPinSetupConfirmInput,
  submitPinSetup,
  cancelPinSetup,
  showDeleteConfirm,
  statusMessage,
}) => {
  const selectedAccount = accounts[selectedAccountIndex];
  const vaultPath = authStatus?.vaultPath || VAULT_DISPLAY_PATH;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={1}>
        <Text dimColor>
          PIN-Encrypted Auth Vault: {vaultPath}
          {authStatus?.hasPin
            ? ` [6-Digit PIN · Salted Hash ${authStatus.pinHashPreview || 'PBKDF2-SHA256'}]`
            : ' [No PIN configured yet — set 6-digit PIN on first account creation]'}
        </Text>
      </Box>

      {statusMessage && !accountFormMode && !showPinSetupModal && !showDeleteConfirm && (
        <Box marginBottom={1}>
          <Text color="green">✓ {statusMessage}</Text>
        </Box>
      )}

      {showPinSetupModal ? (
        <PinSetupBox
          pinSetupInput={pinSetupInput}
          setPinSetupInput={setPinSetupInput}
          pinSetupConfirmInput={pinSetupConfirmInput}
          setPinSetupConfirmInput={setPinSetupConfirmInput}
          onSubmit={submitPinSetup}
          onCancel={cancelPinSetup}
        />
      ) : accountFormMode ? (
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
            <Text>
              Are you sure you want to remove this AWS profile from the PIN-encrypted auth vault (
              {vaultPath})?
            </Text>
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

      {!accountFormMode && !showPinSetupModal && !showDeleteConfirm && accounts.length > 0 && (
        <Box marginTop={1}>
          <Text dimColor>Use ↑/↓ arrows, a to add, e or Enter to edit, d to remove, or Esc to go back</Text>
        </Box>
      )}

      {!accountFormMode && !showPinSetupModal && !showDeleteConfirm && accounts.length === 0 && (
        <Box marginTop={1}>
          <Text dimColor>Press a to add your first AWS account (asks for a 6-digit encryption PIN), or Esc to go back</Text>
        </Box>
      )}
    </Box>
  );
};

export default ManageAccountsScreen;
