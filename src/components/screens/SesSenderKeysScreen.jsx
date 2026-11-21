import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { buildSmtpQrPayload, renderQrLines } from '../../utils/qrCode.js';

const AddSesSenderKeyForm = ({ identityName, userName, setUserName, onSubmit, onCancel }) => {
  useInput((input, key) => {
    if (key.escape) {
      onCancel?.();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Text bold color="cyan">
        Add SMTP Sender Key (AmazonSesSendingAccess) for &quot;{identityName}&quot;
      </Text>
      <Box marginTop={1}>
        <Box flexShrink={0}>
          <Text color="cyan">IAM Username (optional): </Text>
        </Box>
        <TextInput
          value={userName}
          placeholder="leave blank for auto-generated username"
          focus={true}
          showCursor
          onChange={setUserName}
          onSubmit={onSubmit}
        />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press Enter to create key, or Esc to cancel</Text>
      </Box>
    </Box>
  );
};

const CreatedSesKeyModal = ({ cred, onTestSend, onDismiss }) => {
  useInput((input, key) => {
    if (input === 't' || input === 'T') {
      onTestSend?.(cred);
      return;
    }
    if (key.return || key.escape) {
      onDismiss?.();
    }
  });

  const qrLines = useMemo(() => {
    if (!cred) return [];
    const payload = buildSmtpQrPayload({
      host: cred.smtpHost,
      port: cred.smtpPort || 587,
      user: cred.smtpUsername,
      password: cred.smtpPassword,
      sender: cred.identityName,
      backupReceiver: cred.identityName,
      reconciliationReceiver: cred.identityName,
    });
    return renderQrLines(payload, { margin: 2, errorCorrectionLevel: 'L' });
  }, [cred]);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" padding={1}>
      <Text bold color="green">
        SMTP Sender Key Ready — {cred.identityName}
      </Text>
      <Box marginTop={1}>
        <Text color="yellow" bold>
          Save these SMTP credentials now — AWS will not display the SMTP password again.
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text>
          <Text color="cyan">IAM User:      </Text>
          <Text bold>{cred.userName}</Text>
          <Text dimColor> (AmazonSesSendingAccess)</Text>
        </Text>
        <Text>
          <Text color="cyan">SMTP Host:     </Text>
          <Text>{cred.smtpHost}</Text>
        </Text>
        <Text>
          <Text color="cyan">SMTP Port:     </Text>
          <Text>{cred.smtpPort} (STARTTLS) / 465 (SMTPS)</Text>
        </Text>
        <Text>
          <Text color="cyan">SMTP Username: </Text>
          <Text bold color="green">{cred.smtpUsername}</Text>
        </Text>
        <Text>
          <Text color="cyan">SMTP Password: </Text>
          <Text bold color="yellow">{cred.smtpPassword}</Text>
        </Text>
      </Box>
      {qrLines.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {qrLines.map((line, idx) => (
            <Text key={idx} color="black" backgroundColor="white">
              {line}
            </Text>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>
          QR JSON (pos420settings): smtphost, smtpport, smtpuser, smtppassword, emailsender, backupemailreceiver, reconciliationemailreceiver
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          Press &apos;t&apos; to open SMTP Send Tester with these credentials, or Enter/Esc to close
        </Text>
      </Box>
    </Box>
  );
};

const SmtpTestForm = ({ formData, setFormData, onSubmit, onCancel }) => {
  const fields = ['smtpUsername', 'smtpPassword', 'toEmail', 'subject', 'body'];
  const [activeFieldIdx, setActiveFieldIdx] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      onCancel?.();
      return;
    }
    if (key.tab || key.downArrow) {
      setActiveFieldIdx((prev) => (prev + 1) % fields.length);
      return;
    }
    if (key.upArrow) {
      setActiveFieldIdx((prev) => (prev - 1 + fields.length) % fields.length);
    }
  });

  const handleFieldSubmit = () => {
    if (activeFieldIdx < fields.length - 1) {
      setActiveFieldIdx(activeFieldIdx + 1);
    } else {
      onSubmit?.();
    }
  };

  const activeField = fields[activeFieldIdx];

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Text bold color="cyan">
        Integrated SMTP Send Tester — {formData.smtpHost}:{formData.smtpPort} (STARTTLS)
      </Text>
      <Text dimColor>From: {formData.fromEmail}</Text>

      <Box marginTop={1}>
        <Text color={activeField === 'smtpUsername' ? 'yellow' : 'cyan'}>
          {activeField === 'smtpUsername' ? '▸ ' : '  '}SMTP Username: {' '}
        </Text>
        <TextInput
          value={formData.smtpUsername}
          placeholder="AKIA..."
          focus={activeField === 'smtpUsername'}
          showCursor
          onChange={(val) => setFormData((prev) => ({ ...prev, smtpUsername: val }))}
          onSubmit={handleFieldSubmit}
        />
      </Box>

      <Box>
        <Text color={activeField === 'smtpPassword' ? 'yellow' : 'cyan'}>
          {activeField === 'smtpPassword' ? '▸ ' : '  '}SMTP Password: {' '}
        </Text>
        <TextInput
          value={formData.smtpPassword}
          placeholder="SigV4-derived SMTP password"
          mask="*"
          focus={activeField === 'smtpPassword'}
          showCursor
          onChange={(val) => setFormData((prev) => ({ ...prev, smtpPassword: val }))}
          onSubmit={handleFieldSubmit}
        />
      </Box>

      <Box>
        <Text color={activeField === 'toEmail' ? 'yellow' : 'cyan'}>
          {activeField === 'toEmail' ? '▸ ' : '  '}To Email:      {' '}
        </Text>
        <TextInput
          value={formData.toEmail}
          placeholder="recipient@example.com"
          focus={activeField === 'toEmail'}
          showCursor
          onChange={(val) => setFormData((prev) => ({ ...prev, toEmail: val }))}
          onSubmit={handleFieldSubmit}
        />
      </Box>

      <Box>
        <Text color={activeField === 'subject' ? 'yellow' : 'cyan'}>
          {activeField === 'subject' ? '▸ ' : '  '}Subject:       {' '}
        </Text>
        <TextInput
          value={formData.subject}
          placeholder="AWS SES SMTP Test"
          focus={activeField === 'subject'}
          showCursor
          onChange={(val) => setFormData((prev) => ({ ...prev, subject: val }))}
          onSubmit={handleFieldSubmit}
        />
      </Box>

      <Box>
        <Text color={activeField === 'body' ? 'yellow' : 'cyan'}>
          {activeField === 'body' ? '▸ ' : '  '}Body:          {' '}
        </Text>
        <TextInput
          value={formData.body}
          placeholder="Test message..."
          focus={activeField === 'body'}
          showCursor
          onChange={(val) => setFormData((prev) => ({ ...prev, body: val }))}
          onSubmit={handleFieldSubmit}
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Use Tab/↑/↓ to move between fields, Enter on Body to send via SMTP, or Esc to cancel
        </Text>
      </Box>
    </Box>
  );
};

const SesSenderKeysScreen = ({
  selectedAccount,
  selectedSesIdentity,
  sesSenderKeys,
  loading,
  selectedSesKeyIndex,
  showAddSesKey,
  sesKeyUserName,
  setSesKeyUserName,
  submitAddSesKey,
  cancelAddSesKey,
  sesKeyConfirmAction,
  createdSesKeyResult,
  dismissCreatedSesKeyResult,
  openSmtpTesterWithCred,
  showSmtpTestForm,
  smtpTestFormData,
  setSmtpTestFormData,
  submitSmtpTest,
  cancelSmtpTest,
  statusMessage,
}) => {
  const region = selectedAccount?.region || 'us-east-1';
  const smtpHost = `email-smtp.${region}.amazonaws.com`;
  const highlighted = sesSenderKeys[selectedSesKeyIndex];
  const isModalOpen =
    Boolean(showAddSesKey) ||
    Boolean(sesKeyConfirmAction) ||
    Boolean(createdSesKeyResult) ||
    Boolean(showSmtpTestForm);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={1}>
        <Text color="green">
          ✓ Account: {selectedAccount.name} | SMTP Sender Keys for {selectedSesIdentity?.identityName} ({smtpHost}:587)
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>
          <Text bold color="cyan">Policy: AmazonSesSendingAccess</Text>
          <Text dimColor>   |   </Text>
          <Text bold color="yellow">Keys: {sesSenderKeys.length}</Text>
          <Text dimColor> (multiple allowed per email)</Text>
        </Text>
      </Box>

      {statusMessage && !isModalOpen && (
        <Box marginBottom={1}>
          <Text color="green">✓ {statusMessage}</Text>
        </Box>
      )}

      {createdSesKeyResult ? (
        <CreatedSesKeyModal
          cred={createdSesKeyResult}
          onTestSend={openSmtpTesterWithCred}
          onDismiss={dismissCreatedSesKeyResult}
        />
      ) : showSmtpTestForm ? (
        <SmtpTestForm
          formData={smtpTestFormData}
          setFormData={setSmtpTestFormData}
          onSubmit={submitSmtpTest}
          onCancel={cancelSmtpTest}
        />
      ) : showAddSesKey ? (
        <AddSesSenderKeyForm
          identityName={selectedSesIdentity?.identityName || ''}
          userName={sesKeyUserName}
          setUserName={setSesKeyUserName}
          onSubmit={submitAddSesKey}
          onCancel={cancelAddSesKey}
        />
      ) : sesKeyConfirmAction && highlighted ? (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color="yellow" bold>
              {sesKeyConfirmAction === 'revoke'
                ? 'Revoke & Delete SMTP Sender IAM User'
                : 'Recreate SMTP Sender Credentials'}
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text>
              {sesKeyConfirmAction === 'revoke'
                ? 'Permanently revoke all access keys and delete this IAM user?'
                : 'Revoke existing access key(s) and generate a new SMTP username & password?'}
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="cyan" bold>  IAM User: {highlighted.userName}</Text>
          </Box>
          <Box>
            <Text color="green" bold>
              Press &apos;y&apos; to confirm {sesKeyConfirmAction === 'revoke' ? 'revocation' : 'recreation'}
            </Text>
            <Text> | </Text>
            <Text color="red" bold>Press &apos;n&apos; to cancel</Text>
          </Box>
        </Box>
      ) : loading ? (
        <Box>
          <Text>Loading SES SMTP sender keys for {selectedSesIdentity?.identityName}...</Text>
        </Box>
      ) : sesSenderKeys.length === 0 ? (
        <Box>
          <Text dimColor>
            No SMTP sender keys found for {selectedSesIdentity?.identityName}. Press &apos;a&apos; to create one.
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box>
            <Text bold>{'  '}{'IAM User'.padEnd(32)}</Text>
            <Text bold>{'SMTP Username (Key ID)'.padEnd(25)}</Text>
            <Text bold>{'Created (UTC)'.padEnd(19)}</Text>
            <Text bold>Last Used (UTC)</Text>
          </Box>
          {sesSenderKeys.map((u, idx) => {
            const isSelected = idx === selectedSesKeyIndex;
            const rowColor = isSelected ? 'cyan' : undefined;
            const userNameDisplay =
              u.userName.length > 30 ? `${u.userName.slice(0, 27)}...` : u.userName;
            const keySummary =
              u.accessKeys.length === 0
                ? '(no active key)'
                : u.accessKeys.map((k) => k.accessKeyId).join(', ');
            const keyDisplay =
              keySummary.length > 23 ? `${keySummary.slice(0, 20)}...` : keySummary;
            const createdDisplay = u.accessKeys[0]?.createDate || u.createdAt || '-';
            const lastUsedDisplay = u.accessKeys[0]?.lastUsedDate || u.lastUsedAt || 'Never';

            return (
              <Box key={u.userName}>
                <Text color={isSelected ? 'cyan' : 'green'} bold={isSelected}>
                  {isSelected ? '▸ ' : '  '}
                  {userNameDisplay.padEnd(32)}
                </Text>
                <Text color={rowColor}>{keyDisplay.padEnd(25)}</Text>
                <Text color={rowColor}>{createdDisplay.padEnd(19)}</Text>
                <Text color={rowColor} dimColor={!isSelected && lastUsedDisplay === 'Never'}>
                  {lastUsedDisplay}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {!isModalOpen && !loading && (
        <Box marginTop={1}>
          <Text dimColor>
            {sesSenderKeys.length > 0
              ? '↑/↓ select | a add key | t test SMTP send | r recreate | d revoke | Esc back'
              : 'Press a to add an SMTP sender key, t to test SMTP send, or Esc to go back'}
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default SesSenderKeysScreen;
