import React, { useState, useEffect } from 'react';
import { render, useApp } from 'ink';
import App from './components/App.jsx';
import { getAwsProfiles } from './utils/profiles.js';
import { loadHostedZones, loadRecords, createRecord, deleteRecord as deleteRecordService } from './services/route53Service.js';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation.js';

// Get available AWS profiles
const awsAccounts = getAwsProfiles();

const CLI = () => {
  // Navigation state: 'account', 'zone', 'records', 'add'
  const [screen, setScreen] = useState('account');
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [hostedZones, setHostedZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [newRecord, setNewRecord] = useState({
    name: '',
    value: '',
    ttl: 300,
    type: 'A',
  });
  const [selectedRecordIndex, setSelectedRecordIndex] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { exit } = useApp();

  // Load hosted zones when account is selected
  useEffect(() => {
    if (selectedAccount && screen === 'zone') {
      loadHostedZonesAndHandleError(selectedAccount);
    }
  }, [selectedAccount, screen]);

  // Load records when zone is selected
  useEffect(() => {
    if (selectedZone && screen === 'records') {
      loadRecordsAndHandleError(selectedAccount, selectedZone);
    }
  }, [selectedZone, screen]);

  const loadHostedZonesAndHandleError = async (account) => {
    setLoading(true);
    setError(null);
    try {
      const zones = await loadHostedZones(account);
      setHostedZones(zones);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadRecordsAndHandleError = async (account, zone) => {
    if (!zone) {
      setRecords([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const loadedRecords = await loadRecords(account, zone);
      setRecords(loadedRecords);
    } catch (err) {
      setError(err.message);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const addRecord = async () => {
    if (!selectedZone || !newRecord.value) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await createRecord(selectedAccount, selectedZone, newRecord);
      setShowAddRecord(false);
      setNewRecord({ name: '', value: '', ttl: 300, type: 'A' });
      // Refresh records
      loadRecordsAndHandleError(selectedAccount, selectedZone);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteRecord = async () => {
    if (!selectedZone || records.length === 0) {
      return;
    }

    const recordToDelete = records[selectedRecordIndex];
    if (!recordToDelete) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await deleteRecordService(selectedAccount, selectedZone, recordToDelete);
      setShowDeleteConfirm(false);
      // Refresh records
      loadRecordsAndHandleError(selectedAccount, selectedZone);
      // Adjust selection if needed
      if (selectedRecordIndex >= records.length - 1 && records.length > 1) {
        setSelectedRecordIndex(records.length - 2);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Keyboard navigation handlers
  const navigationActions = {
    handleDeleteConfirm: deleteRecord,
    handleDeleteCancel: () => setShowDeleteConfirm(false),
    handleAddRecord: (recordType) => {
      setNewRecord({ name: '', value: '', ttl: 300, type: recordType || 'A' });
      setShowAddRecord(true);
    },
    handleDeleteRecord: () => setShowDeleteConfirm(true),
    handleUpArrow: () => setSelectedRecordIndex(prev => Math.max(0, prev - 1)),
    handleDownArrow: () => setSelectedRecordIndex(prev => Math.min(records.length - 1, prev + 1)),
    handleEscape: () => {
      if (showAddRecord) {
        setShowAddRecord(false);
      } else if (screen === 'records') {
        setScreen('zone');
        setSelectedZone(null);
      } else if (screen === 'zone') {
        setScreen('account');
        setSelectedAccount(null);
        setHostedZones([]);
        setSelectedZone(null);
      }
    },
    exit,
  };

  const navigationState = {
    screen,
    showAddRecord,
    showDeleteConfirm,
    records,
    selectedRecordIndex,
  };

  // Use the keyboard navigation hook
  useKeyboardNavigation(navigationState, navigationActions);

  return (
    <App
      screen={screen}
      setScreen={setScreen}
      accounts={awsAccounts}
      selectedAccount={selectedAccount}
      setSelectedAccount={setSelectedAccount}
      hostedZones={hostedZones}
      selectedZone={selectedZone}
      setSelectedZone={setSelectedZone}
      records={records}
      loading={loading}
      error={error}
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
};

render(<CLI />);
