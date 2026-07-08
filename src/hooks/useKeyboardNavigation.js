import { useInput } from 'ink';

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
    handleDeleteRecord,
    handleUpArrow,
    handleDownArrow,
    handleEscape,
    exit,
  } = navigationActions;

  useInput((input, key) => {
    // When add record/rule form is active, only handle escape
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

    // Handle 'a' to add a rule (EC2 rules screen)
    if (input === 'a' && screen === 'rules' && !showAddRecord) {
      handleAddRecord();
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

    // Handle 'd' to delete (records or rules screen)
    if (input === 'd' && (screen === 'records' || screen === 'rules') && !showAddRecord && records.length > 0) {
      handleDeleteRecord();
      return;
    }

    // Handle arrow keys for item selection (records or rules screen)
    if ((screen === 'records' || screen === 'rules') && !showAddRecord && records.length > 0) {
      if (key.upArrow) {
        handleUpArrow();
      } else if (key.downArrow) {
        handleDownArrow();
      }
    }

    // Handle escape to go back
    if (input === 'escape' || key.escape) {
      if (screen === 'records' || screen === 'rules') {
        handleEscape();
      } else if (screen === 'zone' || screen === 'sg') {
        handleEscape();
      } else if (screen === 'account') {
        handleEscape();
      } else if (screen === 'resource') {
        // Exit the application when pressing escape on the resource screen
        exit();
      }
    }
  });
};
