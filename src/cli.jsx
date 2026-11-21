import React, { useState, useEffect } from 'react';
import { render, useApp } from 'ink';
import App from './components/App.jsx';
import {
  getAuthStatus,
  unlockWithPin,
  validatePin,
  validateProfileName,
  getAwsProfiles,
  addAwsProfile,
  updateAwsProfile,
  removeAwsProfile,
} from './utils/profiles.js';
import { loadHostedZones, loadRecords, createRecord, deleteRecord as deleteRecordService } from './services/route53Service.js';
import {
  loadSecurityGroups,
  loadInboundRules,
  addInboundRule,
  deleteInboundRule as deleteRuleService,
  loadEc2Instances,
  loadElasticIps,
  rebootEc2Instance,
  startEc2Instance,
  stopEc2Instance,
  setEc2RebootLock,
  allocateElasticIp,
  associateElasticIp,
  disassociateElasticIp,
  releaseElasticIp,
  updateElasticIpReverseDns,
  resetElasticIpReverseDns,
} from './services/ec2Service.js';
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
  getBucketRegion,
} from './services/s3Service.js';
import {
  createBucketIamUsers,
  resolveBucketIamUsers,
  listBucketIamUsers,
  createBucketIamUser,
  recreateBucketIamUser,
  revokeBucketIamUser,
} from './services/iamService.js';
import {
  loadSesIdentities,
  createSesIdentity as createSesIdentityService,
  resendSesVerificationEmail,
  publishSesDkimToRoute53,
  publishSesMxToRoute53,
  deleteSesIdentity as deleteSesIdentityService,
} from './services/sesService.js';
import {
  listSesSenderKeys,
  createSesSenderKey,
  recreateSesSenderKey,
  revokeSesSenderKey,
  sendSesSmtpTestEmail,
  getSesSmtpHost,
} from './services/sesSmtpService.js';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation.js';

const EMPTY_ACCOUNT_FORM = {
  profile: '',
  region: 'us-east-1',
  accessKeyId: '',
  secretAccessKey: '',
  sessionToken: '',
};

const CLI = () => {
  const [authStatus, setAuthStatus] = useState(() => getAuthStatus());
  // Navigation state: 'pin-unlock', 'resource', 'account', 'zone', 'records', 'sg', 'rules', 'manage-accounts'
  const [screen, setScreen] = useState(() => {
    const initial = getAuthStatus();
    return initial.hasPin && !initial.unlocked ? 'pin-unlock' : 'resource';
  });
  const [pinUnlockInput, setPinUnlockInput] = useState('');
  const [selectedResource, setSelectedResource] = useState(null);
  const [accounts, setAccounts] = useState(() => getAwsProfiles());
  const [selectedAccount, setSelectedAccount] = useState(null);

  // Account management state
  const [selectedAccountIndex, setSelectedAccountIndex] = useState(0);
  const [accountFormMode, setAccountFormMode] = useState(null); // null | 'add' | 'edit'
  const [editingProfile, setEditingProfile] = useState(null);
  const [accountFormData, setAccountFormData] = useState(EMPTY_ACCOUNT_FORM);
  const [showPinSetupModal, setShowPinSetupModal] = useState(false);
  const [pinSetupInput, setPinSetupInput] = useState('');
  const [pinSetupConfirmInput, setPinSetupConfirmInput] = useState('');
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

  // EC2 Instances & Elastic IPs state
  const [ec2Instances, setEc2Instances] = useState([]);
  const [elasticIps, setElasticIps] = useState([]);
  const [selectedEc2Index, setSelectedEc2Index] = useState(0);
  const [showEc2DetailsModal, setShowEc2DetailsModal] = useState(false);
  const [showAllocateEipModal, setShowAllocateEipModal] = useState(false);
  const [newEipName, setNewEipName] = useState('');
  const [showAssociateEipModal, setShowAssociateEipModal] = useState(false);
  const [associateInstanceIdx, setAssociateInstanceIdx] = useState(0);
  const [showPtrEipModal, setShowPtrEipModal] = useState(false);
  const [eipPtrInput, setEipPtrInput] = useState('');
  const [ec2ConfirmAction, setEc2ConfirmAction] = useState(null);

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
  const [bucketRegion, setBucketRegion] = useState('us-east-1');
  const [bucketKeys, setBucketKeys] = useState([]);
  const [selectedKeyIndex, setSelectedKeyIndex] = useState(0);
  const [addKeyRole, setAddKeyRole] = useState(null); // null | 'put-only' | 'read-only'
  const [addKeyUserName, setAddKeyUserName] = useState('');
  const [keyConfirmAction, setKeyConfirmAction] = useState(null); // null | 'revoke' | 'recreate'
  const [keysReturnScreen, setKeysReturnScreen] = useState('s3-buckets');

  // Amazon SES state
  const [sesIdentities, setSesIdentities] = useState([]);
  const [selectedSesIndex, setSelectedSesIndex] = useState(0);
  const [showAddSesIdentity, setShowAddSesIdentity] = useState(false);
  const [sesIdentityInput, setSesIdentityInput] = useState('');
  const [showSesDkimModal, setShowSesDkimModal] = useState(false);
  const [selectedSesIdentity, setSelectedSesIdentity] = useState(null);
  const [sesSenderKeys, setSesSenderKeys] = useState([]);
  const [selectedSesKeyIndex, setSelectedSesKeyIndex] = useState(0);
  const [showAddSesKey, setShowAddSesKey] = useState(false);
  const [sesKeyUserName, setSesKeyUserName] = useState('');
  const [sesKeyConfirmAction, setSesKeyConfirmAction] = useState(null); // null | 'revoke' | 'recreate'
  const [createdSesKeyResult, setCreatedSesKeyResult] = useState(null);
  const [sesSessionPasswords, setSesSessionPasswords] = useState({});
  const [showSmtpTestForm, setShowSmtpTestForm] = useState(false);
  const [smtpTestFormData, setSmtpTestFormData] = useState({
    smtpHost: '',
    smtpPort: 587,
    smtpUsername: '',
    smtpPassword: '',
    fromEmail: '',
    toEmail: '',
    subject: '',
    body: '',
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

  // Load EC2 instances and Elastic IPs when account is selected (EC2 Instances flow)
  useEffect(() => {
    if (selectedAccount && screen === 'ec2-instances' && selectedResource?.id === 'ec2-instances') {
      loadEc2InstancesAndEipsAndHandleError(selectedAccount);
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

  // Load IAM keys when entering S3 keys screen
  useEffect(() => {
    if (selectedAccount && selectedBucket && screen === 's3-keys') {
      loadBucketKeysAndHandleError(selectedAccount, selectedBucket.name);
    }
  }, [selectedAccount, selectedBucket, screen]);

  // Load Amazon SES identities when account is selected (SES flow)
  useEffect(() => {
    if (selectedAccount && screen === 'ses-identities' && selectedResource?.id === 'ses') {
      loadSesIdentitiesAndHandleError(selectedAccount);
    }
  }, [selectedAccount, screen, selectedResource]);

  // Load SES SMTP sender keys when entering ses-keys screen
  useEffect(() => {
    if (selectedAccount && selectedSesIdentity && screen === 'ses-keys') {
      loadSesSenderKeysAndHandleError(selectedAccount, selectedSesIdentity.identityName);
    }
  }, [selectedAccount, selectedSesIdentity, screen]);

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
      setEc2Instances([]);
      setElasticIps([]);
      setSelectedEc2Index(0);
      setShowEc2DetailsModal(false);
      setShowAllocateEipModal(false);
      setNewEipName('');
      setShowAssociateEipModal(false);
      setAssociateInstanceIdx(0);
      setEc2ConfirmAction(null);
      setBuckets([]);
      setSelectedBucket(null);
      setSelectedBucketIndex(0);
      setShowAddBucket(false);
      setCreatedIamResult(null);
      setBucketPrefix('');
      setObjects([]);
      setSelectedObjectIndex(0);
      setObjectFormMode(null);
      setBucketKeys([]);
      setSelectedKeyIndex(0);
      setAddKeyRole(null);
      setAddKeyUserName('');
      setKeyConfirmAction(null);
      setSesIdentities([]);
      setSelectedSesIndex(0);
      setShowAddSesIdentity(false);
      setSesIdentityInput('');
      setShowSesDkimModal(false);
      setSelectedSesIdentity(null);
      setSesSenderKeys([]);
      setSelectedSesKeyIndex(0);
      setShowAddSesKey(false);
      setSesKeyUserName('');
      setSesKeyConfirmAction(null);
      setCreatedSesKeyResult(null);
      setShowSmtpTestForm(false);
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

  const loadEc2InstancesAndEipsAndHandleError = async (account) => {
    setLoading(true);
    setError(null);
    try {
      const [loadedInstances, loadedEips] = await Promise.all([
        loadEc2Instances(account),
        loadElasticIps(account),
      ]);
      setEc2Instances(loadedInstances);
      setElasticIps(loadedEips);
      const total = loadedInstances.length + loadedEips.length;
      setSelectedEc2Index((prev) => (total === 0 ? 0 : Math.min(prev, total - 1)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleEc2Lock = async () => {
    if (!selectedAccount || selectedEc2Index >= ec2Instances.length) {
      setError('Select an EC2 instance row to toggle Reboot Lock.');
      return;
    }
    const inst = ec2Instances[selectedEc2Index];
    if (!inst) return;
    setLoading(true);
    setError(null);
    try {
      const msg = await setEc2RebootLock(selectedAccount, inst.instanceId, !inst.rebootLock);
      setStatusMessage(msg);
      await loadEc2InstancesAndEipsAndHandleError(selectedAccount);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const promptRebootEc2 = () => {
    if (selectedEc2Index >= ec2Instances.length) {
      setError('Select an EC2 instance row to reboot.');
      return;
    }
    const inst = ec2Instances[selectedEc2Index];
    if (!inst) return;
    if (inst.rebootLock) {
      setError(
        `Instance "${inst.name !== '-' ? inst.name : inst.instanceId}" has Reboot Lock enabled. Press 'l' to unlock before rebooting.`
      );
      return;
    }
    if (inst.state !== 'running') {
      setError(`Instance "${inst.instanceId}" is ${inst.state}. Only running instances can be rebooted.`);
      return;
    }
    setError(null);
    setStatusMessage(null);
    setEc2ConfirmAction({
      type: 'reboot',
      instanceId: inst.instanceId,
      label: 'EC2 Instance Reboot',
      message: `Reboot instance "${inst.name !== '-' ? inst.name : inst.instanceId}" (${inst.instanceId} · ${inst.publicIp})?`,
    });
  };

  const promptStartStopEc2 = async () => {
    if (!selectedAccount || selectedEc2Index >= ec2Instances.length) {
      setError('Select an EC2 instance row to start or stop.');
      return;
    }
    const inst = ec2Instances[selectedEc2Index];
    if (!inst) return;
    if (inst.state === 'stopped') {
      setLoading(true);
      setError(null);
      try {
        const msg = await startEc2Instance(selectedAccount, inst.instanceId);
        setStatusMessage(msg);
        await loadEc2InstancesAndEipsAndHandleError(selectedAccount);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
      return;
    }
    if (inst.rebootLock) {
      setError(
        `Instance "${inst.name !== '-' ? inst.name : inst.instanceId}" has Reboot Lock enabled. Press 'l' to unlock before stopping.`
      );
      return;
    }
    if (inst.state !== 'running') {
      setError(`Instance "${inst.instanceId}" is currently ${inst.state}.`);
      return;
    }
    setError(null);
    setStatusMessage(null);
    setEc2ConfirmAction({
      type: 'stop',
      instanceId: inst.instanceId,
      label: 'Stop EC2 Instance',
      message: `Stop running instance "${inst.name !== '-' ? inst.name : inst.instanceId}" (${inst.instanceId})?`,
    });
  };

  const submitAllocateEip = async () => {
    if (!selectedAccount) return;
    setLoading(true);
    setError(null);
    try {
      const created = await allocateElasticIp(selectedAccount, newEipName);
      setShowAllocateEipModal(false);
      setNewEipName('');
      setStatusMessage(
        `Allocated Elastic IP ${created.publicIp} (${created.allocationId}).`
      );
      await loadEc2InstancesAndEipsAndHandleError(selectedAccount);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openAssociateEip = () => {
    if (selectedEc2Index < ec2Instances.length) {
      setError('Select an Elastic IP row in the bottom table to associate it with an instance.');
      return;
    }
    if (ec2Instances.length === 0) {
      setError('No EC2 instances available in this region to associate.');
      return;
    }
    setError(null);
    setStatusMessage(null);
    setAssociateInstanceIdx(0);
    setShowAssociateEipModal(true);
  };

  const submitAssociateEip = async (instanceId) => {
    const eip = elasticIps[selectedEc2Index - ec2Instances.length];
    if (!selectedAccount || !eip || !instanceId) return;
    setLoading(true);
    setError(null);
    try {
      const msg = await associateElasticIp(selectedAccount, eip.allocationId, instanceId);
      setShowAssociateEipModal(false);
      setStatusMessage(msg);
      await loadEc2InstancesAndEipsAndHandleError(selectedAccount);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const promptDisassociateEip = () => {
    if (selectedEc2Index < ec2Instances.length) {
      setError('Select an Elastic IP row to disassociate.');
      return;
    }
    const eip = elasticIps[selectedEc2Index - ec2Instances.length];
    if (!eip) return;
    if (!eip.associationId) {
      setError(`Elastic IP ${eip.publicIp} is already unassociated.`);
      return;
    }
    setError(null);
    setStatusMessage(null);
    setEc2ConfirmAction({
      type: 'disassociate-eip',
      associationId: eip.associationId,
      label: 'Disassociate Elastic IP',
      message: `Disassociate Elastic IP ${eip.publicIp} from ${eip.instanceName || eip.instanceId || eip.networkInterfaceId}?`,
    });
  };

  const openEditEipPtr = () => {
    if (selectedEc2Index < ec2Instances.length) {
      setError('Select an Elastic IP row in the bottom table to update or clear Reverse DNS.');
      return;
    }
    const eip = elasticIps[selectedEc2Index - ec2Instances.length];
    if (!eip) return;
    setError(null);
    setStatusMessage(null);
    setEipPtrInput(eip.ptrRecord ? eip.ptrRecord.replace(/\.$/, '') : '');
    setShowPtrEipModal(true);
  };

  const submitEditEipPtr = async () => {
    const eip = elasticIps[selectedEc2Index - ec2Instances.length];
    if (!selectedAccount || !eip) return;
    setLoading(true);
    setError(null);
    try {
      const trimmed = eipPtrInput.trim();
      const msg = trimmed
        ? await updateElasticIpReverseDns(selectedAccount, eip.allocationId, trimmed)
        : await resetElasticIpReverseDns(selectedAccount, eip.allocationId);
      setShowPtrEipModal(false);
      setEipPtrInput('');
      setStatusMessage(msg);
      await loadEc2InstancesAndEipsAndHandleError(selectedAccount);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const promptReleaseEip = () => {
    if (selectedEc2Index < ec2Instances.length) {
      setError('Select an unassociated Elastic IP row to release.');
      return;
    }
    const eip = elasticIps[selectedEc2Index - ec2Instances.length];
    if (!eip) return;
    if (eip.associationId) {
      setError(`Disassociate Elastic IP ${eip.publicIp} (press 'u') before releasing it.`);
      return;
    }
    setError(null);
    setStatusMessage(null);
    setEc2ConfirmAction({
      type: 'release-eip',
      allocationId: eip.allocationId,
      label: eip.ptrRecord ? 'Clear Reverse DNS & Release Elastic IP' : 'Release Elastic IP',
      message: eip.ptrRecord
        ? `Elastic IP ${eip.publicIp} (${eip.allocationId}) has Reverse DNS "${eip.ptrRecord}". AWS requires removing Reverse DNS first — confirm to automatically clear PTR and release this Elastic IP?`
        : `Release Elastic IP ${eip.publicIp} (${eip.allocationId}) back to Amazon's pool?`,
    });
  };

  const confirmEc2Action = async () => {
    if (!selectedAccount || !ec2ConfirmAction) return;
    const action = ec2ConfirmAction;
    setLoading(true);
    setError(null);
    try {
      let msg = '';
      if (action.type === 'reboot') {
        msg = await rebootEc2Instance(selectedAccount, action.instanceId);
      } else if (action.type === 'stop') {
        msg = await stopEc2Instance(selectedAccount, action.instanceId);
      } else if (action.type === 'disassociate-eip') {
        msg = await disassociateElasticIp(selectedAccount, action.associationId);
      } else if (action.type === 'release-eip') {
        msg = await releaseElasticIp(selectedAccount, action.allocationId);
      }
      setEc2ConfirmAction(null);
      setStatusMessage(msg);
      await loadEc2InstancesAndEipsAndHandleError(selectedAccount);
    } catch (err) {
      setError(err.message);
      setEc2ConfirmAction(null);
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
    setShowPinSetupModal(false);
    setPinSetupInput('');
    setPinSetupConfirmInput('');
    setError(null);
  };

  const submitPinUnlock = (directVal) => {
    setError(null);
    try {
      const candidate = typeof directVal === 'string' && directVal ? directVal : pinUnlockInput;
      const unlockedAccounts = unlockWithPin(candidate);
      setAccounts(unlockedAccounts);
      setAuthStatus(getAuthStatus());
      setPinUnlockInput('');
      setScreen('resource');
    } catch (err) {
      setError(err.message);
      setPinUnlockInput('');
    }
  };

  const cancelPinSetup = () => {
    setShowPinSetupModal(false);
    setPinSetupInput('');
    setPinSetupConfirmInput('');
    setError(null);
  };

  const submitPinSetup = () => {
    setError(null);
    try {
      const cleanPin = validatePin(pinSetupInput);
      if (cleanPin !== (pinSetupConfirmInput || '').trim()) {
        throw new Error('6-digit PIN and confirmation PIN do not match.');
      }
      const targetProfile = accountFormData.profile.trim();
      const updatedAccounts = addAwsProfile({
        ...accountFormData,
        pin: cleanPin,
      });
      setAccounts(updatedAccounts);
      setAuthStatus(getAuthStatus());
      const newIndex = updatedAccounts.findIndex((a) => a.profile === targetProfile);
      if (newIndex >= 0) {
        setSelectedAccountIndex(newIndex);
      }
      setShowPinSetupModal(false);
      setPinSetupInput('');
      setPinSetupConfirmInput('');
      setAccountFormMode(null);
      setEditingProfile(null);
      setStatusMessage(
        `Created 6-digit PIN (salted hash) and encrypted account "${targetProfile}".`
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const saveAccount = () => {
    setError(null);
    try {
      const targetProfile = validateProfileName(accountFormData.profile);
      const accessKeyId = (accountFormData.accessKeyId || '').trim();
      const secretAccessKey = (accountFormData.secretAccessKey || '').trim();
      if (!accessKeyId) {
        throw new Error('Access Key ID is required.');
      }
      if (accountFormMode === 'add' && !secretAccessKey) {
        throw new Error('Secret Access Key is required.');
      }

      const currentAuth = getAuthStatus();
      if (accountFormMode === 'add' && !currentAuth.hasPin && accounts.length === 0) {
        setPinSetupInput('');
        setPinSetupConfirmInput('');
        setShowPinSetupModal(true);
        return;
      }

      let updatedAccounts;
      if (accountFormMode === 'edit') {
        updatedAccounts = updateAwsProfile(editingProfile, accountFormData);
        setStatusMessage(`Account "${targetProfile}" updated in PIN-encrypted auth vault.`);
      } else {
        updatedAccounts = addAwsProfile(accountFormData);
        setStatusMessage(`Account "${targetProfile}" added to PIN-encrypted auth vault.`);
      }
      setAccounts(updatedAccounts);
      setAuthStatus(getAuthStatus());
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
      setAuthStatus(getAuthStatus());
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
          isScopedIamUsers: true,
        });
        setStatusMessage(
          `Bucket "${createdName}" and ${createdUsers.length} IAM user${createdUsers.length > 1 ? 's' : ''} created.`
        );
      } else {
        if (selectedAccount.accessKeyId && selectedAccount.secretAccessKey) {
          setCreatedIamResult({
            bucketName: createdName,
            region: targetRegion,
            users: [
              {
                bucketName: createdName,
                userName: selectedAccount.profile,
                accessKeyId: selectedAccount.accessKeyId,
                secretAccessKey: selectedAccount.secretAccessKey,
              },
            ],
            isScopedIamUsers: false,
          });
        }
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

  // S3 IAM Keys: Load, create, recreate, revoke
  const loadBucketKeysAndHandleError = async (account, bucketName) => {
    setLoading(true);
    setError(null);
    try {
      const [keys, region] = await Promise.all([
        listBucketIamUsers(account, bucketName),
        getBucketRegion(account, bucketName),
      ]);
      setBucketKeys(keys);
      setBucketRegion(region || account.region || 'us-east-1');
      setSelectedKeyIndex((prev) =>
        keys.length === 0 ? 0 : Math.min(prev, keys.length - 1)
      );
    } catch (err) {
      setError(err.message);
      setBucketKeys([]);
    } finally {
      setLoading(false);
    }
  };

  const openAddBucketKey = (role) => {
    setError(null);
    setStatusMessage(null);
    if (role === 'put-only') {
      const existingWrite = bucketKeys.find((u) => u.role === 'put-only');
      if (existingWrite) {
        setError(
          `Only one write (put-only) key is allowed per bucket. Select "${existingWrite.userName}" and press 'r' to recreate or 'd' to revoke.`
        );
        return;
      }
    }
    setAddKeyUserName('');
    setAddKeyRole(role);
  };

  const cancelAddBucketKey = () => {
    setAddKeyRole(null);
    setAddKeyUserName('');
    setError(null);
  };

  const submitAddBucketKey = async () => {
    if (!selectedAccount || !selectedBucket || !addKeyRole) return;
    const role = addKeyRole;
    setLoading(true);
    setError(null);
    try {
      const created = await createBucketIamUser(
        selectedAccount,
        selectedBucket.name,
        role,
        addKeyUserName
      );
      setAddKeyRole(null);
      setAddKeyUserName('');
      setCreatedIamResult({
        bucketName: selectedBucket.name,
        region: bucketRegion || selectedAccount.region || 'us-east-1',
        users: [created],
        isScopedIamUsers: true,
        title: `${role === 'put-only' ? 'Write' : 'Read'} IAM key created for "${selectedBucket.name}" (${bucketRegion || selectedAccount.region || 'us-east-1'})`,
      });
      setStatusMessage(
        `Created ${role === 'put-only' ? 'write (put-only)' : 'read (read-only)'} IAM user "${created.userName}".`
      );
      await loadBucketKeysAndHandleError(selectedAccount, selectedBucket.name);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const confirmBucketKeyAction = async () => {
    const target = bucketKeys[selectedKeyIndex];
    if (!selectedAccount || !selectedBucket || !target || !keyConfirmAction) return;
    const action = keyConfirmAction;
    setLoading(true);
    setError(null);
    try {
      if (action === 'revoke') {
        await revokeBucketIamUser(selectedAccount, target.userName);
        setKeyConfirmAction(null);
        setStatusMessage(`Revoked IAM user "${target.userName}".`);
        await loadBucketKeysAndHandleError(selectedAccount, selectedBucket.name);
      } else if (action === 'recreate') {
        const recreated = await recreateBucketIamUser(
          selectedAccount,
          selectedBucket.name,
          target.userName,
          target.role
        );
        setKeyConfirmAction(null);
        setCreatedIamResult({
          bucketName: selectedBucket.name,
          region: bucketRegion || selectedAccount.region || 'us-east-1',
          users: [recreated],
          isScopedIamUsers: true,
          title: `IAM key recreated for "${target.userName}" (${selectedBucket.name})`,
        });
        setStatusMessage(`Recreated access key for "${target.userName}".`);
        await loadBucketKeysAndHandleError(selectedAccount, selectedBucket.name);
      }
    } catch (err) {
      setError(err.message);
      setKeyConfirmAction(null);
    } finally {
      setLoading(false);
    }
  };

  // Amazon SES: Load, create, publish DKIM, delete identities
  const loadSesIdentitiesAndHandleError = async (account) => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadSesIdentities(account, accounts);
      setSesIdentities(loaded);
      setSelectedSesIndex((prev) =>
        loaded.length === 0 ? 0 : Math.min(prev, loaded.length - 1)
      );
    } catch (err) {
      setError(err.message);
      setSesIdentities([]);
    } finally {
      setLoading(false);
    }
  };

  const addSesIdentity = async () => {
    if (!selectedAccount) return;
    setLoading(true);
    setError(null);
    try {
      const message = await createSesIdentityService(selectedAccount, sesIdentityInput, accounts);
      setShowAddSesIdentity(false);
      setSesIdentityInput('');
      setStatusMessage(message);
      await loadSesIdentitiesAndHandleError(selectedAccount);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resendSesVerification = async () => {
    const target = sesIdentities[selectedSesIndex];
    if (!selectedAccount || !target) return;
    if (target.identityType !== 'EMAIL_ADDRESS') {
      setError('Resend verification email is only available for email address identities.');
      return;
    }
    if (target.verificationStatus === 'SUCCESS') {
      setStatusMessage(`SES identity "${target.identityName}" is already verified.`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const message = await resendSesVerificationEmail(selectedAccount, target.identityName);
      setStatusMessage(message);
      await loadSesIdentitiesAndHandleError(selectedAccount);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const publishSesDkim = async () => {
    const target = sesIdentities[selectedSesIndex];
    if (!selectedAccount || !target) return;
    setLoading(true);
    setError(null);
    try {
      const message = await publishSesDkimToRoute53(
        selectedAccount,
        accounts,
        target.identityName,
        target.dkimTokens
      );
      setStatusMessage(message);
      await loadSesIdentitiesAndHandleError(selectedAccount);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const publishSesMx = async () => {
    const target = sesIdentities[selectedSesIndex];
    if (!selectedAccount || !target) return;
    if (target.identityType !== 'DOMAIN') {
      setError('Inbound MX records can only be published for SES domain identities.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const message = await publishSesMxToRoute53(
        selectedAccount,
        accounts,
        target.identityName
      );
      setStatusMessage(message);
      await loadSesIdentitiesAndHandleError(selectedAccount);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteSesIdentity = async () => {
    const target = sesIdentities[selectedSesIndex];
    if (!selectedAccount || !target) return;
    setLoading(true);
    setError(null);
    try {
      await deleteSesIdentityService(selectedAccount, target.identityName);
      setShowDeleteConfirm(false);
      setStatusMessage(`Deleted SES identity "${target.identityName}".`);
      await loadSesIdentitiesAndHandleError(selectedAccount);
    } catch (err) {
      setError(err.message);
      setShowDeleteConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  // Amazon SES SMTP Sender Keys & Integrated SMTP Tester
  const loadSesSenderKeysAndHandleError = async (account, identityName) => {
    setLoading(true);
    setError(null);
    try {
      const keys = await listSesSenderKeys(account, identityName);
      setSesSenderKeys(keys);
      setSelectedSesKeyIndex((prev) => (keys.length === 0 ? 0 : Math.min(prev, keys.length - 1)));
    } catch (err) {
      setError(err.message);
      setSesSenderKeys([]);
    } finally {
      setLoading(false);
    }
  };

  const submitAddSesKey = async () => {
    if (!selectedAccount || !selectedSesIdentity) return;
    setLoading(true);
    setError(null);
    try {
      const created = await createSesSenderKey(
        selectedAccount,
        selectedSesIdentity.identityName,
        sesKeyUserName
      );
      setShowAddSesKey(false);
      setSesKeyUserName('');
      setSesSessionPasswords((prev) => ({
        ...prev,
        [created.smtpUsername]: created.smtpPassword,
      }));
      setCreatedSesKeyResult(created);
      setStatusMessage(
        `Created SMTP sender key "${created.userName}" (AmazonSesSendingAccess) for "${selectedSesIdentity.identityName}".`
      );
      await loadSesSenderKeysAndHandleError(selectedAccount, selectedSesIdentity.identityName);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const cancelAddSesKey = () => {
    setShowAddSesKey(false);
    setSesKeyUserName('');
    setError(null);
  };

  const confirmSesKeyAction = async () => {
    const target = sesSenderKeys[selectedSesKeyIndex];
    if (!selectedAccount || !selectedSesIdentity || !target || !sesKeyConfirmAction) return;
    const action = sesKeyConfirmAction;
    setLoading(true);
    setError(null);
    try {
      if (action === 'revoke') {
        await revokeSesSenderKey(selectedAccount, target.userName);
        setSesKeyConfirmAction(null);
        setStatusMessage(`Revoked SMTP sender IAM user "${target.userName}".`);
        await loadSesSenderKeysAndHandleError(selectedAccount, selectedSesIdentity.identityName);
      } else if (action === 'recreate') {
        const recreated = await recreateSesSenderKey(
          selectedAccount,
          selectedSesIdentity.identityName,
          target.userName
        );
        setSesKeyConfirmAction(null);
        setSesSessionPasswords((prev) => ({
          ...prev,
          [recreated.smtpUsername]: recreated.smtpPassword,
        }));
        setCreatedSesKeyResult(recreated);
        setStatusMessage(`Recreated SMTP credentials for "${target.userName}".`);
        await loadSesSenderKeysAndHandleError(selectedAccount, selectedSesIdentity.identityName);
      }
    } catch (err) {
      setError(err.message);
      setSesKeyConfirmAction(null);
    } finally {
      setLoading(false);
    }
  };

  const openSmtpTester = (overrideCred = null) => {
    if (!selectedAccount || !selectedSesIdentity) return;
    const region = selectedAccount.region || 'us-east-1';
    const host = overrideCred?.smtpHost || getSesSmtpHost(region);
    const port = overrideCred?.smtpPort || 587;
    const highlighted = sesSenderKeys[selectedSesKeyIndex];
    const keyId = overrideCred?.smtpUsername || highlighted?.accessKeys?.[0]?.accessKeyId || '';
    const pass = overrideCred?.smtpPassword || sesSessionPasswords[keyId] || '';
    const fromEmail = selectedSesIdentity.identityName;

    setCreatedSesKeyResult(null);
    setError(null);
    setStatusMessage(null);
    setSmtpTestFormData({
      smtpHost: host,
      smtpPort: port,
      smtpUsername: keyId,
      smtpPassword: pass,
      fromEmail,
      toEmail: fromEmail,
      subject: `AWS SES SMTP Test — ${fromEmail}`,
      body: `SMTP test email sent from ${fromEmail} via ${host}:${port}.`,
    });
    setShowSmtpTestForm(true);
  };

  const submitSmtpTest = async () => {
    setLoading(true);
    setError(null);
    try {
      const msg = await sendSesSmtpTestEmail(smtpTestFormData);
      setShowSmtpTestForm(false);
      setStatusMessage(msg);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const cancelSmtpTest = () => {
    setShowSmtpTestForm(false);
    setError(null);
  };

  // Determine which context we're in
  const getCurrentList = () => {
    if (screen === 'manage-accounts') return accounts;
    if (screen === 's3-buckets') return buckets;
    if (screen === 's3-objects') return objects;
    if (screen === 's3-keys') return bucketKeys;
    if (screen === 'ses-identities') return sesIdentities;
    if (screen === 'ses-keys') return sesSenderKeys;
    if (screen === 'ec2-instances') return [...ec2Instances, ...elasticIps];
    if (screen === 'rules') return rules;
    return records;
  };

  const getCurrentIndex = () => {
    if (screen === 'manage-accounts') return selectedAccountIndex;
    if (screen === 's3-buckets') return selectedBucketIndex;
    if (screen === 's3-objects') return selectedObjectIndex;
    if (screen === 's3-keys') return selectedKeyIndex;
    if (screen === 'ses-identities') return selectedSesIndex;
    if (screen === 'ses-keys') return selectedSesKeyIndex;
    if (screen === 'ec2-instances') return selectedEc2Index;
    if (screen === 'rules') return selectedRuleIndex;
    return selectedRecordIndex;
  };

  const currentRecords = getCurrentList();
  const currentIndex = getCurrentIndex();

  // Keyboard navigation handlers
  const navigationActions = {
    handleDeleteConfirm:
      screen === 'ec2-instances'
        ? confirmEc2Action
        : screen === 's3-keys'
          ? confirmBucketKeyAction
          : screen === 'ses-keys'
            ? confirmSesKeyAction
            : screen === 'ses-identities'
              ? deleteSesIdentity
              : screen === 'manage-accounts'
                ? deleteAccount
                : screen === 's3-buckets'
                  ? deleteBucket
                  : screen === 's3-objects'
                    ? deleteObject
                    : screen === 'rules'
                      ? deleteRule
                      : deleteRecord,
    handleDeleteCancel: () => {
      setShowDeleteConfirm(false);
      setKeyConfirmAction(null);
      setSesKeyConfirmAction(null);
      setEc2ConfirmAction(null);
    },
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
      } else if (screen === 's3-keys') {
        openAddBucketKey(recordType === 'put-only' ? 'put-only' : 'read-only');
      } else if (screen === 'ses-identities') {
        setError(null);
        setStatusMessage(null);
        setSesIdentityInput('');
        setShowAddSesIdentity(true);
      } else if (screen === 'ses-keys') {
        setError(null);
        setStatusMessage(null);
        setSesKeyUserName('');
        setShowAddSesKey(true);
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
    handleManageKeys: () => {
      if (screen === 's3-buckets') {
        const bucket = buckets[selectedBucketIndex];
        if (!bucket) return;
        setSelectedBucket(bucket);
        setKeysReturnScreen('s3-buckets');
        setSelectedKeyIndex(0);
        setBucketKeys([]);
        setAddKeyRole(null);
        setKeyConfirmAction(null);
        setStatusMessage(null);
        setError(null);
        setScreen('s3-keys');
      } else if (screen === 's3-objects' && selectedBucket) {
        setKeysReturnScreen('s3-objects');
        setSelectedKeyIndex(0);
        setBucketKeys([]);
        setAddKeyRole(null);
        setKeyConfirmAction(null);
        setStatusMessage(null);
        setError(null);
        setScreen('s3-keys');
      }
    },
    handleRecreateKey: () => {
      if (screen === 's3-keys' && bucketKeys[selectedKeyIndex]) {
        setError(null);
        setStatusMessage(null);
        setKeyConfirmAction('recreate');
      } else if (screen === 'ses-keys' && sesSenderKeys[selectedSesKeyIndex]) {
        setError(null);
        setStatusMessage(null);
        setSesKeyConfirmAction('recreate');
      }
    },
    handleManageSesKeys: () => {
      if (screen === 'ses-identities') {
        const target = sesIdentities[selectedSesIndex];
        if (!target) return;
        if (target.identityType !== 'EMAIL_ADDRESS') {
          setError('SMTP sender keys are managed per email address identity. Select an [EMAIL] row.');
          return;
        }
        setSelectedSesIdentity(target);
        setSesSenderKeys([]);
        setSelectedSesKeyIndex(0);
        setShowAddSesKey(false);
        setSesKeyConfirmAction(null);
        setCreatedSesKeyResult(null);
        setShowSmtpTestForm(false);
        setStatusMessage(null);
        setError(null);
        setScreen('ses-keys');
      }
    },
    handleTestSesSmtp: () => {
      if (screen === 'ses-keys') {
        openSmtpTester();
      }
    },
    handlePublishSesDkim: () => {
      if (screen === 'ses-identities') {
        publishSesDkim();
      }
    },
    handlePublishSesMx: () => {
      if (screen === 'ses-identities') {
        publishSesMx();
      }
    },
    handleResendSesVerification: () => {
      if (screen === 'ses-identities') {
        resendSesVerification();
      }
    },
    handleViewSesDkim: () => {
      if (screen === 'ses-identities') {
        const target = sesIdentities[selectedSesIndex];
        if (!target) return;
        setError(null);
        setStatusMessage(null);
        setShowSesDkimModal(true);
      }
    },
    handleToggleEc2Lock: () => {
      if (screen === 'ec2-instances') {
        toggleEc2Lock();
      }
    },
    handleRebootEc2Instance: () => {
      if (screen === 'ec2-instances') {
        promptRebootEc2();
      }
    },
    handleStartStopEc2Instance: () => {
      if (screen === 'ec2-instances') {
        promptStartStopEc2();
      }
    },
    handleViewEc2Details: () => {
      if (screen === 'ec2-instances') {
        if (selectedEc2Index < ec2Instances.length) {
          setError(null);
          setStatusMessage(null);
          setShowEc2DetailsModal(true);
        } else {
          openAssociateEip();
        }
      }
    },
    handleAllocateEip: () => {
      if (screen === 'ec2-instances') {
        setError(null);
        setStatusMessage(null);
        setNewEipName('');
        setShowAllocateEipModal(true);
      }
    },
    handleAssociateEip: () => {
      if (screen === 'ec2-instances') {
        openAssociateEip();
      }
    },
    handleEditEipPtr: () => {
      if (screen === 'ec2-instances') {
        openEditEipPtr();
      }
    },
    handleDisassociateEip: () => {
      if (screen === 'ec2-instances') {
        promptDisassociateEip();
      }
    },
    handleReleaseEip: () => {
      if (screen === 'ec2-instances') {
        promptReleaseEip();
      }
    },
    handleTabEc2Section: () => {
      if (screen === 'ec2-instances') {
        if (selectedEc2Index < ec2Instances.length && elasticIps.length > 0) {
          setSelectedEc2Index(ec2Instances.length);
        } else if (ec2Instances.length > 0) {
          setSelectedEc2Index(0);
        }
      }
    },
    handleDeleteRecord: () => {
      if (screen === 's3-objects' && objects[selectedObjectIndex]?.isFolder) {
        setError('Folders cannot be deleted directly. Open the folder and delete objects inside.');
        return;
      }
      if (screen === 's3-keys') {
        if (!bucketKeys[selectedKeyIndex]) return;
        setError(null);
        setStatusMessage(null);
        setKeyConfirmAction('revoke');
        return;
      }
      if (screen === 'ses-keys') {
        if (!sesSenderKeys[selectedSesKeyIndex]) return;
        setError(null);
        setStatusMessage(null);
        setSesKeyConfirmAction('revoke');
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
      } else if (screen === 's3-keys') {
        setSelectedKeyIndex((prev) => Math.max(0, prev - 1));
      } else if (screen === 'ses-identities') {
        setSelectedSesIndex((prev) => Math.max(0, prev - 1));
      } else if (screen === 'ses-keys') {
        setSelectedSesKeyIndex((prev) => Math.max(0, prev - 1));
      } else if (screen === 'ec2-instances') {
        setSelectedEc2Index((prev) => Math.max(0, prev - 1));
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
      } else if (screen === 's3-keys') {
        setSelectedKeyIndex((prev) => Math.min(bucketKeys.length - 1, prev + 1));
      } else if (screen === 'ses-identities') {
        setSelectedSesIndex((prev) => Math.min(sesIdentities.length - 1, prev + 1));
      } else if (screen === 'ses-keys') {
        setSelectedSesKeyIndex((prev) => Math.min(sesSenderKeys.length - 1, prev + 1));
      } else if (screen === 'ec2-instances') {
        const total = ec2Instances.length + elasticIps.length;
        setSelectedEc2Index((prev) => Math.min(Math.max(0, total - 1), prev + 1));
      } else if (screen === 'rules') {
        setSelectedRuleIndex(prev => Math.min(rules.length - 1, prev + 1));
      } else {
        setSelectedRecordIndex(prev => Math.min(records.length - 1, prev + 1));
      }
    },
    handleEscape: () => {
      if (createdIamResult) {
        dismissCreatedIamResult();
      } else if (createdSesKeyResult) {
        setCreatedSesKeyResult(null);
      } else if (showSmtpTestForm) {
        cancelSmtpTest();
      } else if (showAddSesKey) {
        cancelAddSesKey();
      } else if (showSesDkimModal) {
        setShowSesDkimModal(false);
      } else if (showEc2DetailsModal) {
        setShowEc2DetailsModal(false);
      } else if (showAllocateEipModal) {
        setShowAllocateEipModal(false);
        setError(null);
      } else if (showAssociateEipModal) {
        setShowAssociateEipModal(false);
        setError(null);
      } else if (showPtrEipModal) {
        setShowPtrEipModal(false);
        setError(null);
      } else if (addKeyRole) {
        cancelAddBucketKey();
      } else if (showAddSesIdentity) {
        setShowAddSesIdentity(false);
        setError(null);
      } else if (showPinSetupModal) {
        cancelPinSetup();
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
      } else if (screen === 'ses-keys') {
        setScreen('ses-identities');
        setSelectedSesIdentity(null);
        setSesSenderKeys([]);
        setSelectedSesKeyIndex(0);
        setShowAddSesKey(false);
        setSesKeyConfirmAction(null);
        setCreatedSesKeyResult(null);
        setShowSmtpTestForm(false);
        setStatusMessage(null);
        setError(null);
      } else if (screen === 's3-keys') {
        setScreen(keysReturnScreen || 's3-buckets');
        setBucketKeys([]);
        setSelectedKeyIndex(0);
        setAddKeyRole(null);
        setKeyConfirmAction(null);
        setStatusMessage(null);
        setError(null);
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
      } else if (screen === 'ses-identities') {
        setScreen('account');
        setSelectedAccount(null);
        setSesIdentities([]);
        setSelectedSesIndex(0);
        setShowAddSesIdentity(false);
        setStatusMessage(null);
        setError(null);
      } else if (screen === 'ec2-instances') {
        setScreen('account');
        setSelectedAccount(null);
        setEc2Instances([]);
        setElasticIps([]);
        setSelectedEc2Index(0);
        setShowEc2DetailsModal(false);
        setShowAllocateEipModal(false);
        setShowAssociateEipModal(false);
        setShowPtrEipModal(false);
        setEc2ConfirmAction(null);
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
      } else if (screen === 'resource' || screen === 'pin-unlock') {
        exit();
      }
    },
    exit,
  };

  const navigationState = {
    screen,
    showAddRecord:
      screen === 'pin-unlock' ||
      showPinSetupModal ||
      showAddRecord ||
      showAddRule ||
      showAddBucket ||
      showAddSesIdentity ||
      showSesDkimModal ||
      showAddSesKey ||
      showSmtpTestForm ||
      showEc2DetailsModal ||
      showAllocateEipModal ||
      showAssociateEipModal ||
      showPtrEipModal ||
      Boolean(accountFormMode) ||
      Boolean(objectFormMode) ||
      Boolean(addKeyRole) ||
      Boolean(createdIamResult) ||
      Boolean(createdSesKeyResult),
    showDeleteConfirm:
      showDeleteConfirm ||
      Boolean(keyConfirmAction) ||
      Boolean(sesKeyConfirmAction) ||
      Boolean(ec2ConfirmAction),
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
      authStatus={authStatus}
      pinUnlockInput={pinUnlockInput}
      setPinUnlockInput={setPinUnlockInput}
      submitPinUnlock={submitPinUnlock}
      accountFormMode={accountFormMode}
      editingProfile={editingProfile}
      accountFormData={accountFormData}
      setAccountFormData={setAccountFormData}
      saveAccount={saveAccount}
      cancelAccountForm={cancelAccountForm}
      showPinSetupModal={showPinSetupModal}
      pinSetupInput={pinSetupInput}
      setPinSetupInput={setPinSetupInput}
      pinSetupConfirmInput={pinSetupConfirmInput}
      setPinSetupConfirmInput={setPinSetupConfirmInput}
      submitPinSetup={submitPinSetup}
      cancelPinSetup={cancelPinSetup}
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
      bucketRegion={bucketRegion}
      bucketKeys={bucketKeys}
      selectedKeyIndex={selectedKeyIndex}
      addKeyRole={addKeyRole}
      addKeyUserName={addKeyUserName}
      setAddKeyUserName={setAddKeyUserName}
      submitAddBucketKey={submitAddBucketKey}
      cancelAddBucketKey={cancelAddBucketKey}
      keyConfirmAction={keyConfirmAction}
      sesIdentities={sesIdentities}
      selectedSesIndex={selectedSesIndex}
      showAddSesIdentity={showAddSesIdentity}
      setShowAddSesIdentity={setShowAddSesIdentity}
      sesIdentityInput={sesIdentityInput}
      setSesIdentityInput={setSesIdentityInput}
      addSesIdentity={addSesIdentity}
      showSesDkimModal={showSesDkimModal}
      setShowSesDkimModal={setShowSesDkimModal}
      publishSesDkim={publishSesDkim}
      publishSesMx={publishSesMx}
      selectedSesIdentity={selectedSesIdentity}
      sesSenderKeys={sesSenderKeys}
      selectedSesKeyIndex={selectedSesKeyIndex}
      showAddSesKey={showAddSesKey}
      sesKeyUserName={sesKeyUserName}
      setSesKeyUserName={setSesKeyUserName}
      submitAddSesKey={submitAddSesKey}
      cancelAddSesKey={cancelAddSesKey}
      sesKeyConfirmAction={sesKeyConfirmAction}
      createdSesKeyResult={createdSesKeyResult}
      dismissCreatedSesKeyResult={() => setCreatedSesKeyResult(null)}
      openSmtpTesterWithCred={(cred) => openSmtpTester(cred)}
      showSmtpTestForm={showSmtpTestForm}
      smtpTestFormData={smtpTestFormData}
      setSmtpTestFormData={setSmtpTestFormData}
      submitSmtpTest={submitSmtpTest}
      cancelSmtpTest={cancelSmtpTest}
      ec2Instances={ec2Instances}
      elasticIps={elasticIps}
      selectedEc2Index={selectedEc2Index}
      showEc2DetailsModal={showEc2DetailsModal}
      setShowEc2DetailsModal={setShowEc2DetailsModal}
      showAllocateEipModal={showAllocateEipModal}
      setShowAllocateEipModal={setShowAllocateEipModal}
      newEipName={newEipName}
      setNewEipName={setNewEipName}
      submitAllocateEip={submitAllocateEip}
      showAssociateEipModal={showAssociateEipModal}
      setShowAssociateEipModal={setShowAssociateEipModal}
      associateInstanceIdx={associateInstanceIdx}
      setAssociateInstanceIdx={setAssociateInstanceIdx}
      submitAssociateEip={submitAssociateEip}
      showPtrEipModal={showPtrEipModal}
      setShowPtrEipModal={setShowPtrEipModal}
      eipPtrInput={eipPtrInput}
      setEipPtrInput={setEipPtrInput}
      submitEditEipPtr={submitEditEipPtr}
      ec2ConfirmAction={ec2ConfirmAction}
    />
  );
};

render(<CLI />);
