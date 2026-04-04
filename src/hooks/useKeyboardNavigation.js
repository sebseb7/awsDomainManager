import { useInput } from 'ink';

/**
 * Custom hook for handling global keyboard navigation
 * @param {Object} navigationState - The navigation and UI state
 * @param {Function} navigationActions - Functions to perform navigation actions
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
    // Handle delete confirmation
    if (showDeleteConfirm) {
      if (input === 'y' || input === 'Y') {
        handleDeleteConfirm();
      } else if (input === 'n' || input === 'N' || input === 'escape' || key.escape) {
        handleDeleteCancel();
      }
      return;
    }
    
    // Handle 'a' to add a new record (only on records screen and not already adding)
    if (input === 'a' && screen === 'records' && !showAddRecord) {
      handleAddRecord();
    }
    
    // Handle 'd' to delete selected record (only on records screen)
    if (input === 'd' && screen === 'records' && !showAddRecord && records.length > 0) {
      handleDeleteRecord();
      return;
    }
    
    // Handle arrow keys for record selection (only on records screen)
    if (screen === 'records' && !showAddRecord && records.length > 0) {
      if (key.upArrow) {
        handleUpArrow();
      } else if (key.downArrow) {
        handleDownArrow();
      }
    }
    
    // Handle escape to go back
    if (input === 'escape' || key.escape) {
      if (showAddRecord) {
        // Cancel add record form
        handleEscape();
      } else if (screen === 'records') {
        handleEscape();
      } else if (screen === 'zone') {
        handleEscape();
      } else if (screen === 'account') {
        // Exit the application when pressing escape on the account screen
        exit();
      }
    }
  });
};
