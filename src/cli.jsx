import React, { useState, useEffect } from 'react';
import { render, useApp } from 'ink';
import App from './components/App.jsx';
import {
  getAwsProfiles,
  addAwsProfile,
  updateAwsProfile,
  removeAwsProfile,
} from './utils/profiles.js';
import { loadHostedZones, loadRecords, createRecord, deleteRecord as deleteRecordService } from './services/route53Service.js';
import { loadSecurityGroups, loadInboundRules, addInboundRule, deleteInboundRule as deleteRuleService } from './services/ec2Service.js';
import {
  loadBuckets,
  createBucket,
  deleteBucket as deleteBucketService,
  loadBucketObjects,
  uploadObject,
  downloadObject,
  deleteObject as deleteObjectService,
  getParentPrefix,
  validateBucketName,
} from './services/s3Service.js';
import {
  createBucketIamUsers,
  resolveBucketIamUsers,
} from './services/iamService.js';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation.js';

const EMPTY_ACCOUNT_FORM = {
  profile: '',
  region: 'us-east-1',
  accessKeyId: '',
  secretAccessKey: '',
  sessionToken: '',
};

const CLI = () => {
  // Navigation state: 'resource', 'account', 'zone', 'records', 'sg', 'rules', 'manage-accounts'
  const [screen, setScreen] = useState('resource');
  const [selectedResource, setSelectedResource] = useState(null);
  const [accounts, setAccounts] = useState(() => getAwsProfiles());
  const [selectedAccount, setSelectedAccount] = useState(null);

  // Account management state
  const [selectedAccountIndex, setSelectedAccountIndex] = useState(0);
  const [accountFormMode, setAccountFormMode] = useState(null); // null | 'add' | 'edit'
  const [editingProfile, setEditingProfile] = useState(null);
  const [accountFormData, setAccountFormData] = useState(EMPTY_ACCOUNT_FORM);
  const [statusMessage, setStatusMessage] = useState(null);
  
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

  // S3 state
  const [buckets, setBuckets] = useState([]);
  const [selectedBucket, setSelectedBucket] = useState(null);
  const [selectedBucketIndex, setSelectedBucketIndex] = useState(0);
  const [showAddBucket, setShowAddBucket] = useState(false);
  const [bucketFormData, setBucketFormData] = useState({
    name: '',
    region: 'us-east-1',
    iamAccess: 'none',
    iamUserName: '',
  });
  const [createdIamResult, setCreatedIamResult] = useState(null);
  const [bucketPrefix, setBucketPrefix] = useState('');
  const [objects, setObjects] = useState([]);
  const [selectedObjectIndex, setSelectedObjectIndex] = useState(0);
  const [objectFormMode, setObjectFormMode] = useState(null); // null | 'upload' | 'download'
  const [objectFormData, setObjectFormData] = useState({
    localPath: '',
    key: '',
    destinationPath: '',
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

  // Load S3 buckets when account is selected (S3 flow)
  useEffect(() => {
    if (selectedAccount && screen === 's3-buckets' && selectedResource?.id === 's3') {
      loadBucketsAndHandleError(selectedAccount);
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

  // Load S3 objects when bucket or prefix changes
  useEffect(() => {
    if (selectedAccount && selectedBucket && screen === 's3-objects') {
      loadBucketObjectsAndHandleError(selectedAccount, selectedBucket.name, bucketPrefix);
    }
  }, [selectedAccount, selectedBucket, bucketPrefix, screen]);

  // Reset state when switching resources
  useEffect(() => {
    if (selectedResource) {
      setAccounts(getAwsProfiles());
      setSelectedAccount(null);
      setSelectedZone(null);
      setHostedZones([]);
      setRecords([]);
      setSelectedGroup(null);
      setSecurityGroups([]);
      setRules([]);
      setBuckets([]);
      setSelectedBucket(null);
      setSelectedBucketIndex(0);
      setShowAddBucket(false);
      setCreatedIamResult(null);
      setBucketPrefix('');
      setObjects([]);
      setSelectedObjectIndex(0);
      setObjectFormMode(null);
      setSelectedRecordIndex(0);
      setSelectedRuleIndex(0);
      setSelectedAccountIndex(0);
      setShowDeleteConfirm(false);
      setShowAddRecord(false);
      setShowAddRule(false);
      setAccountFormMode(null);
      setEditingProfile(null);
      setStatusMessage(null);
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

  // AWS Account management: Open add/edit forms, save, remove
  const openAddAccount = () => {
    setError(null);
    setStatusMessage(null);
    setEditingProfile(null);
    setAccountFormData(EMPTY_ACCOUNT_FORM);
    setAccountFormMode('add');
  };

  const openEditAccount = () => {
    const accountToEdit = accounts[selectedAccountIndex];
    if (!accountToEdit) return;
    setError(null);
    setStatusMessage(null);
    setEditingProfile(accountToEdit.profile);
    setAccountFormData({
      profile: accountToEdit.profile,
      region: accountToEdit.region || 'us-east-1',
      accessKeyId: accountToEdit.accessKeyId || '',
      secretAccessKey: '',
      sessionToken: accountToEdit.sessionToken || '',
    });
    setAccountFormMode('edit');
  };

  const cancelAccountForm = () => {
    setAccountFormMode(null);
    setEditingProfile(null);
    setError(null);
  };

  const saveAccount = () => {
    setError(null);
    try {
      const targetProfile = accountFormData.profile.trim();
      let updatedAccounts;
      if (accountFormMode === 'edit') {
        updatedAccounts = updateAwsProfile(editingProfile, accountFormData);
        setStatusMessage(`Account "${targetProfile}" updated.`);
      } else {
        updatedAccounts = addAwsProfile(accountFormData);
        setStatusMessage(`Account "${targetProfile}" added.`);
      }
      setAccounts(updatedAccounts);
      const newIndex = updatedAccounts.findIndex((a) => a.profile === targetProfile);
      if (newIndex >= 0) {
        setSelectedAccountIndex(newIndex);
      }
      setAccountFormMode(null);
      setEditingProfile(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteAccount = () => {
    const accountToRemove = accounts[selectedAccountIndex];
    if (!accountToRemove) return;
    setError(null);
    try {
      const updatedAccounts = removeAwsProfile(accountToRemove.profile);
      setAccounts(updatedAccounts);
      setShowDeleteConfirm(false);
      setSelectedAccountIndex((prev) =>
        updatedAccounts.length === 0 ? 0 : Math.min(prev, updatedAccounts.length - 1)
      );
      setStatusMessage(`Account "${accountToRemove.profile}" removed.`);
    } catch (err) {
      setError(err.message);
      setShowDeleteConfirm(false);
    }
  };

  // S3: Load, create, delete buckets & manage objects
  const loadBucketsAndHandleError = async (account) => {
    setLoading(true);
    setError(null);
    try {
      const loadedBuckets = await loadBuckets(account);
      setBuckets(loadedBuckets);
      setSelectedBucketIndex((prev) =>
        loadedBuckets.length === 0 ? 0 : Math.min(prev, loadedBuckets.length - 1)
      );
    } catch (err) {
      setError(err.message);
      setBuckets([]);
    } finally {
      setLoading(false);
    }
  };

  const loadBucketObjectsAndHandleError = async (account, bucketName, prefix) => {
    setLoading(true);
    setError(null);
    try {
      const loadedObjects = await loadBucketObjects(account, bucketName, prefix);
      setObjects(loadedObjects);
      setSelectedObjectIndex((prev) =>
        loadedObjects.length === 0 ? 0 : Math.min(prev, loadedObjects.length - 1)
      );
    } catch (err) {
      setError(err.message);
      setObjects([]);
    } finally {
      setLoading(false);
    }
  };

  const addBucket = async () => {
    if (!selectedAccount) return;
    setLoading(true);
    setError(null);
    try {
      // Validate bucket name and IAM user input up-front before making AWS calls
      const validBucketName = validateBucketName(bucketFormData.name);
      const iamAccess = bucketFormData.iamAccess || 'none';
      resolveBucketIamUsers(validBucketName, iamAccess, bucketFormData.iamUserName);

      const targetRegion = (bucketFormData.region || '').trim() || selectedAccount.region || 'us-east-1';
      const createdName = await createBucket(selectedAccount, {
        name: validBucketName,
        region: targetRegion,
      });

      const createdUsers =
        iamAccess !== 'none'
          ? await createBucketIamUsers(
              selectedAccount,
              createdName,
              iamAccess,
              bucketFormData.iamUserName
            )
          : [];

      setShowAddBucket(false);
      setBucketFormData({
        name: '',
        region: selectedAccount.region || 'us-east-1',
        iamAccess: 'none',
        iamUserName: '',
      });

      if (createdUsers.length > 0) {
        setCreatedIamResult({
          bucketName: createdName,
          region: targetRegion,
          users: createdUsers,
        });
        setStatusMessage(
          `Bucket "${createdName}" and ${createdUsers.length} IAM user${createdUsers.length > 1 ? 's' : ''} created.`
        );
      } else {
        setStatusMessage(`Bucket "${createdName}" created.`);
      }

      await loadBucketsAndHandleError(selectedAccount);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const dismissCreatedIamResult = () => {
    setCreatedIamResult(null);
  };

  const deleteBucket = async () => {
    const bucketToDelete = buckets[selectedBucketIndex];
    if (!selectedAccount || !bucketToDelete) return;
    setLoading(true);
    setError(null);
    try {
      await deleteBucketService(selectedAccount, bucketToDelete.name);
      setShowDeleteConfirm(false);
      setStatusMessage(`Bucket "${bucketToDelete.name}" deleted.`);
      await loadBucketsAndHandleError(selectedAccount);
    } catch (err) {
      setError(err.message);
      setShowDeleteConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  const openUploadForm = () => {
    setError(null);
    setStatusMessage(null);
    setObjectFormData({
      localPath: '',
      key: bucketPrefix || '',
      destinationPath: '',
    });
    setObjectFormMode('upload');
  };

  const openDownloadForm = () => {
    const item = objects[selectedObjectIndex];
    if (!item) return;
    if (item.isFolder) {
      setError('Select a file (not a folder) to download.');
      return;
    }
    setError(null);
    setStatusMessage(null);
    setObjectFormData({
      localPath: '',
      key: item.key,
      destinationPath: `./${item.displayName}`,
    });
    setObjectFormMode('download');
  };

  const cancelObjectForm = () => {
    setObjectFormMode(null);
    setError(null);
  };

  const submitObjectForm = async () => {
    if (!selectedAccount || !selectedBucket) return;
    setLoading(true);
    setError(null);
    try {
      if (objectFormMode === 'upload') {
        const uploadedKey = await uploadObject(selectedAccount, selectedBucket.name, objectFormData);
        setObjectFormMode(null);
        setStatusMessage(`Uploaded "${uploadedKey}".`);
        await loadBucketObjectsAndHandleError(selectedAccount, selectedBucket.name, bucketPrefix);
      } else if (objectFormMode === 'download') {
        const item = objects[selectedObjectIndex];
        const savedPath = await downloadObject(
          selectedAccount,
          selectedBucket.name,
          item.key,
          objectFormData.destinationPath
        );
        setObjectFormMode(null);
        setStatusMessage(`Downloaded to ${savedPath}.`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteObject = async () => {
    const item = objects[selectedObjectIndex];
    if (!selectedAccount || !selectedBucket || !item || item.isFolder) return;
    setLoading(true);
    setError(null);
    try {
      await deleteObjectService(selectedAccount, selectedBucket.name, item.key);
      setShowDeleteConfirm(false);
      setStatusMessage(`Deleted "${item.key}".`);
      await loadBucketObjectsAndHandleError(selectedAccount, selectedBucket.name, bucketPrefix);
    } catch (err) {
      setError(err.message);
      setShowDeleteConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  // Determine which context we're in
  const getCurrentList = () => {
    if (screen === 'manage-accounts') return accounts;
    if (screen === 's3-buckets') return buckets;
    if (screen === 's3-objects') return objects;
    if (screen === 'rules') return rules;
    return records;
  };

  const getCurrentIndex = () => {
    if (screen === 'manage-accounts') return selectedAccountIndex;
    if (screen === 's3-buckets') return selectedBucketIndex;
    if (screen === 's3-objects') return selectedObjectIndex;
    if (screen === 'rules') return selectedRuleIndex;
    return selectedRecordIndex;
  };

  const currentRecords = getCurrentList();
  const currentIndex = getCurrentIndex();

  // Keyboard navigation handlers
  const navigationActions = {
    handleDeleteConfirm:
      screen === 'manage-accounts'
        ? deleteAccount
        : screen === 's3-buckets'
          ? deleteBucket
          : screen === 's3-objects'
            ? deleteObject
            : screen === 'rules'
              ? deleteRule
              : deleteRecord,
    handleDeleteCancel: () => setShowDeleteConfirm(false),
    handleAddRecord: (recordType) => {
      if (screen === 'manage-accounts') {
        openAddAccount();
      } else if (screen === 's3-buckets') {
        setError(null);
        setStatusMessage(null);
        setBucketFormData({
          name: '',
          region: selectedAccount?.region || 'us-east-1',
          iamAccess: 'none',
          iamUserName: '',
        });
        setShowAddBucket(true);
      } else if (screen === 's3-objects') {
        openUploadForm();
      } else if (screen === 'rules') {
        setRuleData({ protocol: 'tcp', fromPort: 80, toPort: 80, source: '0.0.0.0/0', description: '' });
        setShowAddRule(true);
      } else {
        setNewRecord({ name: '', value: '', ttl: 300, type: recordType || 'A' });
        setShowAddRecord(true);
      }
    },
    handleEditItem: () => {
      if (screen === 'manage-accounts') {
        openEditAccount();
      }
    },
    handleSelectItem: () => {
      if (screen === 's3-buckets') {
        const bucket = buckets[selectedBucketIndex];
        if (!bucket) return;
        setSelectedBucket(bucket);
        setBucketPrefix('');
        setSelectedObjectIndex(0);
        setStatusMessage(null);
        setError(null);
        setScreen('s3-objects');
      } else if (screen === 's3-objects') {
        const item = objects[selectedObjectIndex];
        if (item?.isFolder) {
          setBucketPrefix(item.key);
          setSelectedObjectIndex(0);
          setStatusMessage(null);
          setError(null);
        }
      }
    },
    handleDownloadItem: () => {
      if (screen === 's3-objects') {
        openDownloadForm();
      }
    },
    handleDeleteRecord: () => {
      if (screen === 's3-objects' && objects[selectedObjectIndex]?.isFolder) {
        setError('Folders cannot be deleted directly. Open the folder and delete objects inside.');
        return;
      }
      setError(null);
      setStatusMessage(null);
      setShowDeleteConfirm(true);
    },
    handleUpArrow: () => {
      if (screen === 'manage-accounts') {
        setSelectedAccountIndex((prev) => Math.max(0, prev - 1));
      } else if (screen === 's3-buckets') {
        setSelectedBucketIndex((prev) => Math.max(0, prev - 1));
      } else if (screen === 's3-objects') {
        setSelectedObjectIndex((prev) => Math.max(0, prev - 1));
      } else if (screen === 'rules') {
        setSelectedRuleIndex(prev => Math.max(0, prev - 1));
      } else {
        setSelectedRecordIndex(prev => Math.max(0, prev - 1));
      }
    },
    handleDownArrow: () => {
      if (screen === 'manage-accounts') {
        setSelectedAccountIndex((prev) => Math.min(accounts.length - 1, prev + 1));
      } else if (screen === 's3-buckets') {
        setSelectedBucketIndex((prev) => Math.min(buckets.length - 1, prev + 1));
      } else if (screen === 's3-objects') {
        setSelectedObjectIndex((prev) => Math.min(objects.length - 1, prev + 1));
      } else if (screen === 'rules') {
        setSelectedRuleIndex(prev => Math.min(rules.length - 1, prev + 1));
      } else {
        setSelectedRecordIndex(prev => Math.min(records.length - 1, prev + 1));
      }
    },
    handleEscape: () => {
      if (createdIamResult) {
        dismissCreatedIamResult();
      } else if (accountFormMode) {
        cancelAccountForm();
      } else if (objectFormMode) {
        cancelObjectForm();
      } else if (showAddBucket) {
        setShowAddBucket(false);
        setError(null);
      } else if (showAddRecord) {
        setShowAddRecord(false);
      } else if (showAddRule) {
        setShowAddRule(false);
      } else if (screen === 's3-objects') {
        if (bucketPrefix) {
          setBucketPrefix(getParentPrefix(bucketPrefix));
          setSelectedObjectIndex(0);
          setStatusMessage(null);
          setError(null);
        } else {
          setScreen('s3-buckets');
          setSelectedBucket(null);
          setObjects([]);
          setSelectedObjectIndex(0);
          setStatusMessage(null);
          setError(null);
        }
      } else if (screen === 's3-buckets') {
        setScreen('account');
        setSelectedAccount(null);
        setBuckets([]);
        setSelectedBucket(null);
        setSelectedBucketIndex(0);
        setStatusMessage(null);
        setError(null);
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
      } else if (screen === 'account' || screen === 'manage-accounts') {
        setScreen('resource');
        setSelectedResource(null);
        setStatusMessage(null);
        setError(null);
      } else if (screen === 'resource') {
        exit();
      }
    },
    exit,
  };

  const navigationState = {
    screen,
    showAddRecord:
      showAddRecord ||
      showAddRule ||
      showAddBucket ||
      Boolean(accountFormMode) ||
      Boolean(objectFormMode) ||
      Boolean(createdIamResult),
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
      accounts={accounts}
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
      selectedAccountIndex={selectedAccountIndex}
      accountFormMode={accountFormMode}
      editingProfile={editingProfile}
      accountFormData={accountFormData}
      setAccountFormData={setAccountFormData}
      saveAccount={saveAccount}
      cancelAccountForm={cancelAccountForm}
      statusMessage={statusMessage}
      buckets={buckets}
      selectedBucket={selectedBucket}
      selectedBucketIndex={selectedBucketIndex}
      showAddBucket={showAddBucket}
      setShowAddBucket={setShowAddBucket}
      bucketFormData={bucketFormData}
      setBucketFormData={setBucketFormData}
      addBucket={addBucket}
      createdIamResult={createdIamResult}
      dismissCreatedIamResult={dismissCreatedIamResult}
      bucketPrefix={bucketPrefix}
      objects={objects}
      selectedObjectIndex={selectedObjectIndex}
      objectFormMode={objectFormMode}
      objectFormData={objectFormData}
      setObjectFormData={setObjectFormData}
      submitObjectForm={submitObjectForm}
      cancelObjectForm={cancelObjectForm}
    />
  );
};

render(<CLI />);
