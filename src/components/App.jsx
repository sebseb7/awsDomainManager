import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import ResourceScreen from './screens/ResourceScreen.jsx';
import AccountScreen from './screens/AccountScreen.jsx';
import ZoneScreen from './screens/ZoneScreen.jsx';
import RecordsScreen from './screens/RecordsScreen.jsx';
import SecurityGroupScreen from './screens/SecurityGroupScreen.jsx';
import RulesScreen from './screens/RulesScreen.jsx';
import ManageAccountsScreen from './screens/ManageAccountsScreen.jsx';
import BucketScreen from './screens/BucketScreen.jsx';
import BucketObjectsScreen from './screens/BucketObjectsScreen.jsx';
import BucketKeysScreen from './screens/BucketKeysScreen.jsx';
import SesScreen from './screens/SesScreen.jsx';
import SesSenderKeysScreen from './screens/SesSenderKeysScreen.jsx';
import Ec2InstancesScreen from './screens/Ec2InstancesScreen.jsx';

const getTitle = (selectedResource) => {
  if (!selectedResource) return 'AWS Domain Manager';
  if (selectedResource.id === 'ec2-instances') return 'EC2 Instances & Elastic IPs Manager';
  if (selectedResource.id === 'ec2') return 'EC2 Security Group Inbound Rules Manager';
  if (selectedResource.id === 's3') return 'S3 Bucket Manager';
  if (selectedResource.id === 'ses') return 'Amazon SES Identity Manager (Domains & Email Addresses)';
  if (selectedResource.id === 'accounts') return 'AWS Account Manager';
  return 'Route53 DNS Record Manager';
};

const App = (props) => {
  const {
    screen,
    setScreen,
    accounts,
    selectedAccount,
    setSelectedAccount,
    hostedZones,
    selectedZone,
    setSelectedZone,
    records,
    loading,
    error,
    showAddRecord,
    setShowAddRecord,
    newRecord,
    setNewRecord,
    addRecord,
    selectedRecordIndex,
    showDeleteConfirm,
    setShowDeleteConfirm,
    deleteRecord,
    selectedResource,
    setSelectedResource,
    securityGroups,
    selectedGroup,
    setSelectedGroup,
    rules,
    showAddRule,
    setShowAddRule,
    ruleData,
    setRuleData,
    addRule,
    selectedRuleIndex,
    deleteRule,
    selectedAccountIndex,
    authStatus,
    pinUnlockInput,
    setPinUnlockInput,
    submitPinUnlock,
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
    statusMessage,
    buckets,
    selectedBucket,
    selectedBucketIndex,
    showAddBucket,
    setShowAddBucket,
    bucketFormData,
    setBucketFormData,
    addBucket,
    createdIamResult,
    dismissCreatedIamResult,
    bucketPrefix,
    objects,
    selectedObjectIndex,
    objectFormMode,
    objectFormData,
    setObjectFormData,
    submitObjectForm,
    cancelObjectForm,
    bucketRegion,
    bucketKeys,
    selectedKeyIndex,
    addKeyRole,
    addKeyUserName,
    setAddKeyUserName,
    submitAddBucketKey,
    cancelAddBucketKey,
    keyConfirmAction,
    sesIdentities,
    selectedSesIndex,
    showAddSesIdentity,
    setShowAddSesIdentity,
    sesIdentityInput,
    setSesIdentityInput,
    addSesIdentity,
    showSesDkimModal,
    setShowSesDkimModal,
    publishSesDkim,
    publishSesMx,
    selectedSesIdentity,
    sesSenderKeys,
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
    ec2Instances,
    elasticIps,
    selectedEc2Index,
    showEc2DetailsModal,
    setShowEc2DetailsModal,
    showAllocateEipModal,
    setShowAllocateEipModal,
    newEipName,
    setNewEipName,
    submitAllocateEip,
    showAssociateEipModal,
    setShowAssociateEipModal,
    associateInstanceIdx,
    setAssociateInstanceIdx,
    submitAssociateEip,
    showPtrEipModal,
    setShowPtrEipModal,
    eipPtrInput,
    setEipPtrInput,
    submitEditEipPtr,
    ec2ConfirmAction,
  } = props;

  const renderScreen = () => {
    switch (screen) {
      case 'pin-unlock':
        return (
          <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1}>
            <Text bold color="yellow">
              Unlock PIN-Encrypted Auth Vault
            </Text>
            <Box marginTop={1}>
              <Text>
                AWS credentials are encrypted with your 6-digit PIN. Enter your PIN to verify the
                salted hash and unlock your accounts.
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text dimColor>
                Vault: {authStatus?.vaultPath || '~/.aws-domain-manager/auth.enc.json'}
                {authStatus?.pinHashPreview
                  ? ` | Salted Hash: ${authStatus.pinHashPreview} (Salt: ${authStatus.saltPreview || '16B'})`
                  : ''}
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text color="cyan" bold>
                6-Digit PIN:{' '}
              </Text>
              <TextInput
                value={pinUnlockInput || ''}
                placeholder="••••••"
                mask="*"
                focus
                showCursor
                onChange={(val) => setPinUnlockInput?.(val.replace(/\D/g, '').slice(0, 6))}
                onSubmit={(val) => submitPinUnlock?.(val)}
              />
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Enter your 6-digit PIN and press Enter to unlock, or Esc to exit</Text>
            </Box>
          </Box>
        );

      case 'resource':
        return (
          <ResourceScreen
            selectedResource={selectedResource}
            setSelectedResource={setSelectedResource}
            setScreen={setScreen}
          />
        );

      case 'account':
        return (
          <AccountScreen
            accounts={accounts}
            selectedAccount={selectedAccount}
            setSelectedAccount={setSelectedAccount}
            setScreen={setScreen}
            selectedResource={selectedResource}
          />
        );

      case 'zone':
        return (
          <ZoneScreen
            selectedAccount={selectedAccount}
            hostedZones={hostedZones}
            selectedZone={selectedZone}
            setSelectedZone={setSelectedZone}
            setScreen={setScreen}
            loading={loading}
          />
        );

      case 'records':
        return (
          <RecordsScreen
            selectedAccount={selectedAccount}
            selectedZone={selectedZone}
            records={records}
            loading={loading}
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

      case 'sg':
        return (
          <SecurityGroupScreen
            selectedAccount={selectedAccount}
            securityGroups={securityGroups}
            selectedGroup={selectedGroup}
            setSelectedGroup={setSelectedGroup}
            setScreen={setScreen}
            loading={loading}
          />
        );

      case 'rules':
        return (
          <RulesScreen
            selectedAccount={selectedAccount}
            selectedGroup={selectedGroup}
            rules={rules}
            loading={loading}
            showAddRule={showAddRule}
            setShowAddRule={setShowAddRule}
            ruleData={ruleData}
            setRuleData={setRuleData}
            addRule={addRule}
            selectedRuleIndex={selectedRuleIndex}
            showDeleteConfirm={showDeleteConfirm}
            setShowDeleteConfirm={setShowDeleteConfirm}
            deleteRule={deleteRule}
          />
        );

      case 'manage-accounts':
        return (
          <ManageAccountsScreen
            accounts={accounts}
            authStatus={authStatus}
            selectedAccountIndex={selectedAccountIndex}
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
            showDeleteConfirm={showDeleteConfirm}
            statusMessage={statusMessage}
          />
        );

      case 's3-buckets':
        return (
          <BucketScreen
            selectedAccount={selectedAccount}
            buckets={buckets}
            loading={loading}
            selectedBucketIndex={selectedBucketIndex}
            showAddBucket={showAddBucket}
            setShowAddBucket={setShowAddBucket}
            bucketFormData={bucketFormData}
            setBucketFormData={setBucketFormData}
            addBucket={addBucket}
            createdIamResult={createdIamResult}
            dismissCreatedIamResult={dismissCreatedIamResult}
            showDeleteConfirm={showDeleteConfirm}
            statusMessage={statusMessage}
          />
        );

      case 's3-objects':
        return (
          <BucketObjectsScreen
            selectedAccount={selectedAccount}
            selectedBucket={selectedBucket}
            bucketPrefix={bucketPrefix}
            objects={objects}
            loading={loading}
            selectedObjectIndex={selectedObjectIndex}
            objectFormMode={objectFormMode}
            objectFormData={objectFormData}
            setObjectFormData={setObjectFormData}
            submitObjectForm={submitObjectForm}
            cancelObjectForm={cancelObjectForm}
            showDeleteConfirm={showDeleteConfirm}
            statusMessage={statusMessage}
          />
        );

      case 's3-keys':
        return (
          <BucketKeysScreen
            selectedAccount={selectedAccount}
            selectedBucket={selectedBucket}
            bucketRegion={bucketRegion}
            bucketKeys={bucketKeys}
            loading={loading}
            selectedKeyIndex={selectedKeyIndex}
            addKeyRole={addKeyRole}
            addKeyUserName={addKeyUserName}
            setAddKeyUserName={setAddKeyUserName}
            submitAddBucketKey={submitAddBucketKey}
            cancelAddBucketKey={cancelAddBucketKey}
            keyConfirmAction={keyConfirmAction}
            createdIamResult={createdIamResult}
            dismissCreatedIamResult={dismissCreatedIamResult}
            statusMessage={statusMessage}
          />
        );

      case 'ses-identities':
        return (
          <SesScreen
            selectedAccount={selectedAccount}
            sesIdentities={sesIdentities}
            loading={loading}
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
            showDeleteConfirm={showDeleteConfirm}
            statusMessage={statusMessage}
          />
        );

      case 'ses-keys':
        return (
          <SesSenderKeysScreen
            selectedAccount={selectedAccount}
            selectedSesIdentity={selectedSesIdentity}
            sesSenderKeys={sesSenderKeys}
            loading={loading}
            selectedSesKeyIndex={selectedSesKeyIndex}
            showAddSesKey={showAddSesKey}
            sesKeyUserName={sesKeyUserName}
            setSesKeyUserName={setSesKeyUserName}
            submitAddSesKey={submitAddSesKey}
            cancelAddSesKey={cancelAddSesKey}
            sesKeyConfirmAction={sesKeyConfirmAction}
            createdSesKeyResult={createdSesKeyResult}
            dismissCreatedSesKeyResult={dismissCreatedSesKeyResult}
            openSmtpTesterWithCred={openSmtpTesterWithCred}
            showSmtpTestForm={showSmtpTestForm}
            smtpTestFormData={smtpTestFormData}
            setSmtpTestFormData={setSmtpTestFormData}
            submitSmtpTest={submitSmtpTest}
            cancelSmtpTest={cancelSmtpTest}
            statusMessage={statusMessage}
          />
        );

      case 'ec2-instances':
        return (
          <Ec2InstancesScreen
            selectedAccount={selectedAccount}
            ec2Instances={ec2Instances}
            elasticIps={elasticIps}
            loading={loading}
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
            statusMessage={statusMessage}
          />
        );

      default:
        return null;
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>
          {getTitle(selectedResource)}
        </Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {renderScreen()}
    </Box>
  );
};

export default App;
