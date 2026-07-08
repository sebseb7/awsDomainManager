import React, { useState, useEffect } from 'react';
import { render, useApp } from 'ink';
import App from './components/App.jsx';
import { getAwsProfiles } from './utils/profiles.js';
import { loadHostedZones, loadRecords, createRecord, deleteRecord as deleteRecordService } from './services/route53Service.js';
import { loadSecurityGroups, loadInboundRules, addInboundRule, deleteInboundRule as deleteRuleService } from './services/ec2Service.js';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation.js';

// Get available AWS profiles
const awsAccounts = getAwsProfiles();

const CLI = () => {
  // Navigation state: 'resource', 'account', 'zone', 'records', 'sg', 'rules'
  const [screen, setScreen] = useState('resource');
  const [selectedResource, setSelectedResource] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);
  
  // Route53 state
  const [hostedZones, setHostedZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [records, setRecords] = useState([]);
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [newRecord, setNewRecord] = useState({
    name: '',
    value: '',
    ttl: 300,
    type: 'A',
  });
  
  // EC2 Security Group state
  const [securityGroups, setSecurityGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [rules, setRules] = useState([]);
  const [showAddRule, setShowAddRule] = useState(false);
  const [ruleData, setRuleData] = useState({
    protocol: 'tcp',
    fromPort: 80,
    toPort: 80,
    source: '0.0.0.0/0',
    description: '',
  });

  // Shared state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRecordIndex, setSelectedRecordIndex] = useState(0);
  const [selectedRuleIndex, setSelectedRuleIndex] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { exit } = useApp();

  // Load hosted zones when account is selected (Route53 flow)
  useEffect(() => {
    if (selectedAccount && screen === 'zone' && selectedResource?.id === 'route53') {
      loadHostedZonesAndHandleError(selectedAccount);
    }
  }, [selectedAccount, screen, selectedResource]);

  // Load security groups when account is selected (EC2 flow)
  useEffect(() => {
    if (selectedAccount && screen === 'sg' && selectedResource?.id === 'ec2') {
      loadSecurityGroupsAndHandleError(selectedAccount);
    }
  }, [selectedAccount, screen, selectedResource]);

  // Load records when zone is selected
  useEffect(() => {
    if (selectedZone && screen === 'records') {
      loadRecordsAndHandleError(selectedAccount, selectedZone);
    }
  }, [selectedZone, screen]);

  // Load inbound rules when security group is selected
  useEffect(() => {
    if (selectedGroup && screen === 'rules') {
      loadRulesAndHandleError(selectedAccount, selectedGroup);
    }
  }, [selectedGroup, screen]);

  // Reset state when switching resources
  useEffect(() => {
    if (selectedResource) {
      setSelectedAccount(null);
      setSelectedZone(null);
      setHostedZones([]);
      setRecords([]);
      setSelectedGroup(null);
      setSecurityGroups([]);
      setRules([]);
      setSelectedRecordIndex(0);
      setSelectedRuleIndex(0);
      setShowDeleteConfirm(false);
      setShowAddRecord(false);
      setShowAddRule(false);
      setError(null);
    }
  }, [selectedResource]);

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

  const loadSecurityGroupsAndHandleError = async (account) => {
    setLoading(true);
    setError(null);
    try {
      const groups = await loadSecurityGroups(account);
      setSecurityGroups(groups);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadRulesAndHandleError = async (account, group) => {
    if (!group) {
      setRules([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const loadedRules = await loadInboundRules(account, group);
      setRules(loadedRules);
    } catch (err) {
      setError(err.message);
      setRules([]);
    } finally {
      setLoading(false);
    }
  };

  // Route53: Add record
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
      loadRecordsAndHandleError(selectedAccount, selectedZone);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Route53: Delete record
  const deleteRecord = async () => {
    if (!selectedZone || records.length === 0) return;
    const recordToDelete = records[selectedRecordIndex];
    if (!recordToDelete) return;
    setLoading(true);
    setError(null);
    try {
      await deleteRecordService(selectedAccount, selectedZone, recordToDelete);
      setShowDeleteConfirm(false);
      loadRecordsAndHandleError(selectedAccount, selectedZone);
      if (selectedRecordIndex >= records.length - 1 && records.length > 1) {
        setSelectedRecordIndex(records.length - 2);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // EC2: Add rule
  const addRule = async () => {
    if (!selectedGroup) return;
    setLoading(true);
    setError(null);
    try {
      await addInboundRule(selectedAccount, selectedGroup, ruleData);
      setShowAddRule(false);
      setRuleData({ protocol: 'tcp', fromPort: 80, toPort: 80, source: '0.0.0.0/0', description: '' });
      loadRulesAndHandleError(selectedAccount, selectedGroup);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // EC2: Delete rule
  const deleteRule = async () => {
    if (!selectedGroup || rules.length === 0) return;
    const ruleToDelete = rules[selectedRuleIndex];
    if (!ruleToDelete) return;
    setLoading(true);
    setError(null);
    try {
      await deleteRuleService(selectedAccount, selectedGroup, ruleToDelete);
      setShowDeleteConfirm(false);
      loadRulesAndHandleError(selectedAccount, selectedGroup);
      if (selectedRuleIndex >= rules.length - 1 && rules.length > 1) {
        setSelectedRuleIndex(rules.length - 2);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Determine which context we're in
  const isRoute53 = screen === 'zone' || screen === 'records';
  const isEC2 = screen === 'sg' || screen === 'rules';
  const currentRecords = screen === 'rules' ? rules : records;
  const currentIndex = screen === 'rules' ? selectedRuleIndex : selectedRecordIndex;

  // Keyboard navigation handlers
  const navigationActions = {
    handleDeleteConfirm: screen === 'rules' ? deleteRule : deleteRecord,
    handleDeleteCancel: () => setShowDeleteConfirm(false),
    handleAddRecord: (recordType) => {
      if (screen === 'rules') {
        setRuleData({ protocol: 'tcp', fromPort: 80, toPort: 80, source: '0.0.0.0/0', description: '' });
        setShowAddRule(true);
      } else {
        setNewRecord({ name: '', value: '', ttl: 300, type: recordType || 'A' });
        setShowAddRecord(true);
      }
    },
    handleDeleteRecord: () => setShowDeleteConfirm(true),
    handleUpArrow: () => {
      if (screen === 'rules') {
        setSelectedRuleIndex(prev => Math.max(0, prev - 1));
      } else {
        setSelectedRecordIndex(prev => Math.max(0, prev - 1));
      }
    },
    handleDownArrow: () => {
      if (screen === 'rules') {
        setSelectedRuleIndex(prev => Math.min(rules.length - 1, prev + 1));
      } else {
        setSelectedRecordIndex(prev => Math.min(records.length - 1, prev + 1));
      }
    },
    handleEscape: () => {
      if (showAddRecord) {
        setShowAddRecord(false);
      } else if (showAddRule) {
        setShowAddRule(false);
      } else if (screen === 'records' || screen === 'rules') {
        if (screen === 'records') {
          setScreen('zone');
          setSelectedZone(null);
        } else {
          setScreen('sg');
          setSelectedGroup(null);
        }
      } else if (screen === 'zone' || screen === 'sg') {
        setScreen('account');
        setSelectedAccount(null);
        setHostedZones([]);
        setSelectedZone(null);
        setSecurityGroups([]);
        setSelectedGroup(null);
      } else if (screen === 'account') {
        setScreen('resource');
        setSelectedResource(null);
      } else if (screen === 'resource') {
        exit();
      }
    },
    exit,
  };

  const navigationState = {
    screen,
    showAddRecord: showAddRecord || showAddRule,
    showDeleteConfirm,
    records: currentRecords,
    selectedRecordIndex: currentIndex,
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
      selectedResource={selectedResource}
      setSelectedResource={setSelectedResource}
      securityGroups={securityGroups}
      selectedGroup={selectedGroup}
      setSelectedGroup={setSelectedGroup}
      rules={rules}
      showAddRule={showAddRule}
      setShowAddRule={setShowAddRule}
      ruleData={ruleData}
      setRuleData={setRuleData}
      addRule={addRule}
      selectedRuleIndex={selectedRuleIndex}
      deleteRule={deleteRule}
    />
  );
};

render(<CLI />);
