import React from 'react';
import { Box, Text } from 'ink';
import ResourceScreen from './screens/ResourceScreen.jsx';
import AccountScreen from './screens/AccountScreen.jsx';
import ZoneScreen from './screens/ZoneScreen.jsx';
import RecordsScreen from './screens/RecordsScreen.jsx';
import SecurityGroupScreen from './screens/SecurityGroupScreen.jsx';
import RulesScreen from './screens/RulesScreen.jsx';

const getTitle = (selectedResource) => {
  if (!selectedResource) return 'AWS Domain Manager';
  if (selectedResource.id === 'ec2') return 'EC2 Security Group Inbound Rules Manager';
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
  } = props;

  const renderScreen = () => {
    switch (screen) {
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
