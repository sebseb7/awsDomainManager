import { useInput } from 'ink';

const LIST_SCREENS = ['records', 'rules', 'manage-accounts', 's3-buckets', 's3-objects', 's3-keys', 'ses-identities', 'ses-keys', 'ec2-instances'];

/**
 * Custom hook for handling global keyboard navigation
 * @param {Object} navigationState - The navigation and UI state
 * @param {Object} navigationActions - Functions to perform navigation actions
 */
export const useKeyboardNavigation = (navigationState, navigationActions) => {
  const {
    screen,
    showAddRecord,
    showDeleteConfirm,
    records,
    selectedRecordIndex,
  } = navigationState;

  const {
    handleDeleteConfirm,
    handleDeleteCancel,
    handleAddRecord,
    handleEditItem,
    handleSelectItem,
    handleDownloadItem,
    handleManageKeys,
    handleRecreateKey,
    handlePublishSesDkim,
    handlePublishSesMx,
    handleViewSesDkim,
    handleResendSesVerification,
    handleManageSesKeys,
    handleTestSesSmtp,
    handleToggleEc2Lock,
    handleRebootEc2Instance,
    handleStartStopEc2Instance,
    handleViewEc2Details,
    handleAllocateEip,
    handleAssociateEip,
    handleEditEipPtr,
    handleDisassociateEip,
    handleReleaseEip,
    handleTabEc2Section,
    handleDeleteRecord,
    handleUpArrow,
    handleDownArrow,
    handleEscape,
    exit,
  } = navigationActions;

  useInput((input, key) => {
    // When add/edit form is active, only handle escape
    if (showAddRecord) {
      if (input === 'escape' || key.escape) {
        handleEscape();
      }
      return;
    }

    // Handle delete confirmation
    if (showDeleteConfirm) {
      if (input === 'y' || input === 'Y') {
        handleDeleteConfirm();
      } else if (input === 'n' || input === 'N' || input === 'escape' || key.escape) {
        handleDeleteCancel();
      }
      return;
    }

    // Handle 'a' to add a rule, AWS account, S3 bucket, SES identity, or SES SMTP sender key
    if (
      input === 'a' &&
      (screen === 'rules' || screen === 'manage-accounts' || screen === 's3-buckets' || screen === 'ses-identities' || screen === 'ses-keys') &&
      !showAddRecord
    ) {
      handleAddRecord();
      return;
    }

    // Handle 'k' to manage IAM keys for selected S3 bucket
    if (
      input === 'k' &&
      ((screen === 's3-buckets' && records.length > 0) || screen === 's3-objects') &&
      !showAddRecord
    ) {
      handleManageKeys?.();
      return;
    }

    // Handle 'w' (create write key) and 'n'/'a' (add read key) on S3 keys screen
    if (screen === 's3-keys' && !showAddRecord) {
      if (input === 'w') {
        handleAddRecord('put-only');
        return;
      }
      if (input === 'n' || input === 'a') {
        handleAddRecord('read-only');
        return;
      }
      if (input === 'r' && records.length > 0) {
        handleRecreateKey?.();
        return;
      }
    }

    // Handle 'k' (manage SMTP sender keys), 'r' (resend verification email), 'p' (publish DKIM/DMARC), 'm' (publish inbound MX), and 'v'/Enter (view DNS records) on SES screen
    if (screen === 'ses-identities' && !showAddRecord && records.length > 0) {
      if (input === 'k') {
        handleManageSesKeys?.();
        return;
      }
      if (input === 'r') {
        handleResendSesVerification?.();
        return;
      }
      if (input === 'p') {
        handlePublishSesDkim?.();
        return;
      }
      if (input === 'm') {
        handlePublishSesMx?.();
        return;
      }
      if (input === 'v' || key.return) {
        handleViewSesDkim?.();
        return;
      }
    }

    // Handle 'n' (add key), 't' (test SMTP send), 'r' (recreate key) on SES sender keys screen
    if (screen === 'ses-keys' && !showAddRecord) {
      if (input === 'n') {
        handleAddRecord();
        return;
      }
      if (input === 't') {
        handleTestSesSmtp?.();
        return;
      }
      if (input === 'r' && records.length > 0) {
        handleRecreateKey?.();
        return;
      }
    }

    // Handle EC2 Instances & Elastic IPs screen keys
    if (screen === 'ec2-instances' && !showAddRecord) {
      if (key.tab) {
        handleTabEc2Section?.();
        return;
      }
      if (input === 'l' && records.length > 0) {
        handleToggleEc2Lock?.();
        return;
      }
      if (input === 'r' && records.length > 0) {
        handleRebootEc2Instance?.();
        return;
      }
      if (input === 's' && records.length > 0) {
        handleStartStopEc2Instance?.();
        return;
      }
      if ((input === 'v' || key.return) && records.length > 0) {
        handleViewEc2Details?.();
        return;
      }
      if (input === 'n') {
        handleAllocateEip?.();
        return;
      }
      if (input === 'a' && records.length > 0) {
        handleAssociateEip?.();
        return;
      }
      if (input === 'p' && records.length > 0) {
        handleEditEipPtr?.();
        return;
      }
      if (input === 'u' && records.length > 0) {
        handleDisassociateEip?.();
        return;
      }
      if (input === 'd' && records.length > 0) {
        handleReleaseEip?.();
        return;
      }
    }

    // Handle 'u' to upload an object (S3 objects screen)
    if (input === 'u' && screen === 's3-objects' && !showAddRecord) {
      handleAddRecord('upload');
      return;
    }

    // Handle 'g' to download selected object (S3 objects screen)
    if (input === 'g' && screen === 's3-objects' && !showAddRecord && records.length > 0) {
      handleDownloadItem?.();
      return;
    }

    // Handle 'e' or Enter to edit selected AWS account
    if ((input === 'e' || key.return) && screen === 'manage-accounts' && !showAddRecord && records.length > 0) {
      handleEditItem?.();
      return;
    }

    // Handle Enter to open selected S3 bucket or folder
    if (key.return && (screen === 's3-buckets' || screen === 's3-objects') && !showAddRecord && records.length > 0) {
      handleSelectItem?.();
      return;
    }

    // Handle record type shortcuts to add a new record (Route53 records screen)
    if (screen === 'records' && !showAddRecord) {
      const recordTypeMap = {
        'a': 'A',
        'A': 'AAAA',
        'c': 'CNAME',
        'm': 'MX',
        't': 'TXT',
        'n': 'NS',
      };

      if (recordTypeMap[input]) {
        handleAddRecord(recordTypeMap[input]);
        return;
      }
    }

    // Handle 'd' to delete on list screens
    if (input === 'd' && LIST_SCREENS.includes(screen) && !showAddRecord && records.length > 0) {
      handleDeleteRecord();
      return;
    }

    // Handle arrow keys for item selection on list screens
    if (LIST_SCREENS.includes(screen) && !showAddRecord && records.length > 0) {
      if (key.upArrow) {
        handleUpArrow();
      } else if (key.downArrow) {
        handleDownArrow();
      }
    }

    // Handle escape to go back
    if (input === 'escape' || key.escape) {
      if (
        LIST_SCREENS.includes(screen) ||
        screen === 'zone' ||
        screen === 'sg' ||
        screen === 'account'
      ) {
        handleEscape();
      } else if (screen === 'resource') {
        // Exit the application when pressing escape on the resource screen
        exit();
      }
    }
  });
};
