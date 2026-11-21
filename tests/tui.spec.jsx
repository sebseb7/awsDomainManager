import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import React from 'react';
import { test, expect } from '@playwright/test';
import App from '../src/components/App.jsx';
import {
  addAwsProfile,
  getAuthStatus,
  getAwsProfiles,
  lockAuthSession,
  removeAwsProfile,
  unlockWithPin,
  updateAwsProfile,
  validatePin,
} from '../src/utils/profiles.js';
import {
  renderInkToAnsi,
  screenshotAnsiTerminal,
  stripAnsi,
} from './helpers/tuiRenderer.mjs';
import {
  DUMMY_PROFILES,
  DUMMY_HOSTED_ZONES,
  DUMMY_DNS_RECORDS,
  DUMMY_EC2_INSTANCES,
  DUMMY_ELASTIC_IPS,
  DUMMY_BUCKETS,
  DUMMY_BUCKET_IAM_USERS,
  DUMMY_RECREATED_CREDENTIAL,
  DUMMY_SES_IDENTITIES,
  DUMMY_SES_SENDER_KEYS,
} from './fixtures/dummyData.mjs';

mkdirSync('docs', { recursive: true });

const BASE_TUI_PROPS = {
  screen: 'resource',
  setScreen: () => {},
  accounts: DUMMY_PROFILES,
  selectedAccount: DUMMY_PROFILES[0],
  setSelectedAccount: () => {},
  hostedZones: DUMMY_HOSTED_ZONES,
  selectedZone: DUMMY_HOSTED_ZONES[0],
  setSelectedZone: () => {},
  records: DUMMY_DNS_RECORDS,
  loading: false,
  error: null,
  showAddRecord: false,
  setShowAddRecord: () => {},
  newRecord: { name: '', value: '', ttl: 300, type: 'A' },
  setNewRecord: () => {},
  addRecord: () => {},
  selectedRecordIndex: 1,
  showDeleteConfirm: false,
  setShowDeleteConfirm: () => {},
  deleteRecord: () => {},
  selectedResource: { id: 'route53', name: 'Route53 DNS' },
  setSelectedResource: () => {},
  securityGroups: [],
  selectedGroup: null,
  setSelectedGroup: () => {},
  rules: [],
  showAddRule: false,
  setShowAddRule: () => {},
  ruleData: {},
  setRuleData: () => {},
  addRule: () => {},
  selectedRuleIndex: 0,
  deleteRule: () => {},
  selectedAccountIndex: 0,
  accountFormMode: null,
  editingProfile: null,
  accountFormData: {},
  setAccountFormData: () => {},
  saveAccount: () => {},
  cancelAccountForm: () => {},
  statusMessage: null,
  buckets: DUMMY_BUCKETS,
  selectedBucket: DUMMY_BUCKETS[0],
  selectedBucketIndex: 0,
  showAddBucket: false,
  setShowAddBucket: () => {},
  bucketFormData: {},
  setBucketFormData: () => {},
  addBucket: () => {},
  createdIamResult: null,
  dismissCreatedIamResult: () => {},
  bucketPrefix: '',
  objects: [],
  selectedObjectIndex: 0,
  objectFormMode: null,
  objectFormData: {},
  setObjectFormData: () => {},
  submitObjectForm: () => {},
  cancelObjectForm: () => {},
  bucketRegion: 'eu-central-1',
  bucketKeys: DUMMY_BUCKET_IAM_USERS.map((u) => ({
    ...u,
    createdAt: u.createdAt.slice(0, 16).replace('T', ' '),
    lastUsedAt:
      u.lastUsedAt && u.lastUsedAt !== 'Never'
        ? u.lastUsedAt.slice(0, 16).replace('T', ' ')
        : 'Never',
    accessKeys: u.accessKeys.map((k) => ({
      ...k,
      createDate: k.createDate.slice(0, 16).replace('T', ' '),
      lastUsedDate:
        k.lastUsedDate && k.lastUsedDate !== 'Never'
          ? k.lastUsedDate.slice(0, 16).replace('T', ' ')
          : 'Never',
    })),
  })),
  selectedKeyIndex: 0,
  addKeyRole: null,
  addKeyUserName: '',
  setAddKeyUserName: () => {},
  submitAddBucketKey: () => {},
  cancelAddBucketKey: () => {},
  keyConfirmAction: null,
  sesIdentities: DUMMY_SES_IDENTITIES,
  selectedSesIndex: 0,
  showAddSesIdentity: false,
  setShowAddSesIdentity: () => {},
  sesIdentityInput: '',
  setSesIdentityInput: () => {},
  addSesIdentity: () => {},
  selectedSesIdentity: DUMMY_SES_IDENTITIES[3],
  sesSenderKeys: DUMMY_SES_SENDER_KEYS,
  selectedSesKeyIndex: 0,
  showAddSesKey: false,
  sesKeyUserName: '',
  setSesKeyUserName: () => {},
  submitAddSesKey: () => {},
  cancelAddSesKey: () => {},
  sesKeyConfirmAction: null,
  createdSesKeyResult: null,
  dismissCreatedSesKeyResult: () => {},
  openSmtpTesterWithCred: () => {},
  showSmtpTestForm: false,
  smtpTestFormData: {},
  setSmtpTestFormData: () => {},
  submitSmtpTest: () => {},
  cancelSmtpTest: () => {},
  ec2Instances: DUMMY_EC2_INSTANCES,
  elasticIps: DUMMY_ELASTIC_IPS,
  selectedEc2Index: 0,
  showEc2DetailsModal: false,
  setShowEc2DetailsModal: () => {},
  showAllocateEipModal: false,
  setShowAllocateEipModal: () => {},
  newEipName: '',
  setNewEipName: () => {},
  submitAllocateEip: () => {},
  showAssociateEipModal: false,
  setShowAssociateEipModal: () => {},
  associateInstanceIdx: 0,
  setAssociateInstanceIdx: () => {},
  submitAssociateEip: () => {},
  showPtrEipModal: false,
  setShowPtrEipModal: () => {},
  eipPtrInput: '',
  setEipPtrInput: () => {},
  submitEditEipPtr: () => {},
  ec2ConfirmAction: null,
};

test('TUI: Route53 DNS Records screenshot', async ({ page }) => {
  const ansi = await renderInkToAnsi(
    <App
      {...BASE_TUI_PROPS}
      screen="records"
      selectedResource={{ id: 'route53', name: 'Route53 DNS' }}
    />,
    { columns: 104, rows: 28 }
  );

  const plain = stripAnsi(ansi);
  expect(plain).toContain('Route53 DNS Record Manager');
  expect(plain).toContain('example.com.');
  expect(plain).toContain('203.0.113.10');

  await screenshotAnsiTerminal(
    page,
    ansi,
    'docs/tui-route53.png',
    'aws-domain-manager — Route53 DNS Records'
  );
});

test('TUI: EC2 Instances & Elastic IPs (State, IPs, Reboot Lock & EIPs) screenshot', async ({
  page,
}) => {
  const ansi = await renderInkToAnsi(
    <App
      {...BASE_TUI_PROPS}
      screen="ec2-instances"
      selectedResource={{ id: 'ec2-instances', name: 'EC2 Instances & Elastic IPs' }}
      selectedEc2Index={0}
    />,
    { columns: 126, rows: 26 }
  );

  const plain = stripAnsi(ansi);
  expect(plain).toContain('EC2 Instances & Elastic IPs Manager');
  expect(plain).toContain('Running: 3');
  expect(plain).toContain('Stopped: 1');
  expect(plain).toContain('Reboot Locked: 2');
  expect(plain).toContain('prod-web-01');
  expect(plain).toContain('3.120.45.10 [EIP]');
  expect(plain).toContain('[LOCKED]');
  expect(plain).toContain('spare-failover-eip');
  expect(plain).toContain('52.59.210.77');
  expect(plain).toContain('UNASSOCIATED');
  expect(plain).toContain('mail.example.com.');

  await screenshotAnsiTerminal(
    page,
    ansi,
    'docs/tui-ec2-instances.png',
    'aws-domain-manager — EC2 Instances & Elastic IPs'
  );
});

test('TUI: S3 Bucket IAM Keys (Write 1/1 + multiple Read keys) screenshot', async ({ page }) => {
  const ansi = await renderInkToAnsi(
    <App
      {...BASE_TUI_PROPS}
      screen="s3-keys"
      selectedResource={{ id: 's3', name: 'S3 Buckets' }}
      selectedKeyIndex={0}
    />,
    { columns: 108, rows: 26 }
  );

  const plain = stripAnsi(ansi);
  expect(plain).toContain('S3 Bucket Manager');
  expect(plain).toContain('Write (Put-Only): 1/1');
  expect(plain).toContain('Read (Read-Only): 3');
  expect(plain).toContain('acme-backups-prod-put');
  expect(plain).toContain('audit-reader-eu');

  await screenshotAnsiTerminal(
    page,
    ansi,
    'docs/tui-s3-keys.png',
    'aws-domain-manager — S3 Bucket IAM Keys'
  );
});

test('TUI: Recreated IAM Key with terminal QR code screenshot', async ({ page }) => {
  const ansi = await renderInkToAnsi(
    <App
      {...BASE_TUI_PROPS}
      screen="s3-keys"
      selectedResource={{ id: 's3', name: 'S3 Buckets' }}
      createdIamResult={{
        bucketName: 'acme-backups-prod',
        region: 'eu-central-1',
        users: [DUMMY_RECREATED_CREDENTIAL],
        isScopedIamUsers: true,
        title: 'IAM key recreated for "acme-backups-prod-put" (acme-backups-prod)',
      }}
    />,
    { columns: 112, rows: 44 }
  );

  const plain = stripAnsi(ansi);
  expect(plain).toContain('AKIAWRITE9999ROTATED');
  expect(plain).toContain('Save these credentials now');

  await screenshotAnsiTerminal(
    page,
    ansi,
    'docs/tui-s3-qr.png',
    'aws-domain-manager — Recreated IAM Key & QR Code'
  );
});

test('TUI: Amazon SES Identities (Domains & Email Addresses) screenshot', async ({ page }) => {
  const ansi = await renderInkToAnsi(
    <App
      {...BASE_TUI_PROPS}
      screen="ses-identities"
      selectedResource={{ id: 'ses', name: 'Amazon SES' }}
      selectedSesIndex={0}
    />,
    { columns: 108, rows: 26 }
  );

  const plain = stripAnsi(ansi);
  expect(plain).toContain('Amazon SES Identity Manager');
  expect(plain).toContain('Domains: 3');
  expect(plain).toContain('Email Addresses: 3');
  expect(plain).toContain('alerts@example.com');
  expect(plain).toContain('Action required');
  expect(plain).toContain('dev-team@staging.example.com');
  expect(plain).toContain('resend');
  expect(plain).toContain('publish MX');

  await screenshotAnsiTerminal(
    page,
    ansi,
    'docs/tui-ses.png',
    'aws-domain-manager — Amazon SES Identities'
  );
});

test('TUI: Amazon SES SMTP Sender Keys (AmazonSesSendingAccess) screen', async () => {
  const ansi = await renderInkToAnsi(
    <App
      {...BASE_TUI_PROPS}
      screen="ses-keys"
      selectedResource={{ id: 'ses', name: 'Amazon SES' }}
      selectedSesIdentity={DUMMY_SES_IDENTITIES[3]}
      sesSenderKeys={DUMMY_SES_SENDER_KEYS}
      selectedSesKeyIndex={0}
    />,
    { columns: 108, rows: 24 }
  );

  const plain = stripAnsi(ansi);
  expect(plain).toContain('SMTP Sender Keys for alerts@example.com');
  expect(plain).toContain('AmazonSesSendingAccess');
  expect(plain).toContain('ses-alerts-example-com');
  expect(plain).toContain('ses-alerts-ci-notifier');
  expect(plain).toContain('AKIASMTPSENDER01EXMP');
  expect(plain).toContain('test SMTP send');

  const qrAnsi = await renderInkToAnsi(
    <App
      {...BASE_TUI_PROPS}
      screen="ses-keys"
      selectedResource={{ id: 'ses', name: 'Amazon SES' }}
      selectedSesIdentity={DUMMY_SES_IDENTITIES[3]}
      sesSenderKeys={DUMMY_SES_SENDER_KEYS}
      createdSesKeyResult={{
        identityName: 'alerts@example.com',
        userName: 'ses-alerts-example-com',
        region: 'eu-central-1',
        smtpHost: 'email-smtp.eu-central-1.amazonaws.com',
        smtpPort: 587,
        smtpUsername: 'AKIASMTPSENDER01EXMP',
        smtpPassword: 'BNExampleSigV4DerivedSmtpPassword000000000000=',
      }}
    />,
    { columns: 108, rows: 48 }
  );
  const qrPlain = stripAnsi(qrAnsi);
  expect(qrPlain).toContain('SMTP Sender Key Ready — alerts@example.com');
  expect(qrPlain).toContain('pos420settings');
  expect(qrPlain).toContain('backupemailreceiver');
  expect(qrPlain).toContain('reconciliationemailreceiver');
  expect(qrPlain).toContain('█');
});

test('TUI & Vault: 6-digit PIN encryption, salted PIN hash verification, and PIN prompt screens', async () => {
  const tempVaultDir = mkdtempSync(join(tmpdir(), 'aws-dm-pin-test-'));
  try {
    lockAuthSession(tempVaultDir);
    const initialStatus = getAuthStatus(tempVaultDir);
    expect(initialStatus.hasPin).toBe(false);
    expect(initialStatus.unlocked).toBe(true);

    expect(() => validatePin('12345')).toThrow('PIN must be exactly 6 digits');
    expect(() => validatePin('12345a')).toThrow('PIN must be exactly 6 digits');
    expect(validatePin('482910')).toBe('482910');

    // First account creation requires a 6-digit PIN
    expect(() =>
      addAwsProfile(
        {
          profile: 'prod-aws',
          region: 'eu-central-1',
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        },
        tempVaultDir
      )
    ).toThrow('6-digit PIN is required');

    // Create first account with 6-digit PIN
    const profiles = addAwsProfile(
      {
        profile: 'prod-aws',
        region: 'eu-central-1',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        pin: '482910',
      },
      tempVaultDir
    );
    expect(profiles).toHaveLength(1);
    expect(profiles[0].profile).toBe('prod-aws');

    // Verify encrypted vault on disk has salt & pinHash and zero plaintext credentials
    const rawVaultJson = readFileSync(join(tempVaultDir, 'auth.enc.json'), 'utf8');
    const parsedVault = JSON.parse(rawVaultJson);
    expect(parsedVault.kdf).toBe('pbkdf2-hmac-sha256');
    expect(parsedVault.salt).toBeTruthy();
    expect(parsedVault.pinHash).toBeTruthy();
    expect(parsedVault.ciphertext).toBeTruthy();
    expect(rawVaultJson).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(rawVaultJson).not.toContain('wJalrXUtnFEMI');
    expect(rawVaultJson).not.toContain('482910');

    // Simulate app relaunch -> vault is locked and asks for PIN
    const relaunchStatus = lockAuthSession(tempVaultDir);
    expect(relaunchStatus.hasPin).toBe(true);
    expect(relaunchStatus.unlocked).toBe(false);
    expect(getAwsProfiles(tempVaultDir)).toHaveLength(0);

    // Wrong PIN fails salted PIN hash verification
    expect(() => unlockWithPin('000000', tempVaultDir)).toThrow(
      'Incorrect 6-digit PIN. Salted PIN hash verification failed.'
    );

    // Correct PIN passes salted PIN hash check and decrypts profiles
    const unlocked = unlockWithPin('482910', tempVaultDir);
    expect(unlocked).toHaveLength(1);
    expect(unlocked[0].accessKeyId).toBe('AKIAIOSFODNN7EXAMPLE');

    // Update and remove profile in encrypted vault
    const updated = updateAwsProfile(
      'prod-aws',
      {
        profile: 'prod-aws',
        region: 'us-west-2',
        accessKeyId: 'AKIAROTATED000000001',
      },
      tempVaultDir
    );
    expect(updated[0].region).toBe('us-west-2');
    expect(updated[0].accessKeyId).toBe('AKIAROTATED000000001');

    const afterRemove = removeAwsProfile('prod-aws', tempVaultDir);
    expect(afterRemove).toHaveLength(0);
    expect(getAuthStatus(tempVaultDir).hasPin).toBe(false);
  } finally {
    rmSync(tempVaultDir, { recursive: true, force: true });
  }

  // Verify TUI launch PIN unlock screen and first-account PIN setup screen render cleanly
  const unlockAnsi = await renderInkToAnsi(
    <App
      {...BASE_TUI_PROPS}
      screen="pin-unlock"
      authStatus={{
        hasPin: true,
        unlocked: false,
        vaultPath: '~/.aws-domain-manager/auth.enc.json',
        saltPreview: 'a9f3c18b...',
        pinHashPreview: '7e4d20b8f12c...',
      }}
      pinUnlockInput="482"
    />,
    { columns: 100, rows: 16 }
  );
  const unlockPlain = stripAnsi(unlockAnsi);
  expect(unlockPlain).toContain('Unlock PIN-Encrypted Auth Vault');
  expect(unlockPlain).toContain('7e4d20b8f12c...');

  const setupAnsi = await renderInkToAnsi(
    <App
      {...BASE_TUI_PROPS}
      screen="manage-accounts"
      accounts={[]}
      showPinSetupModal={true}
      pinSetupInput="482910"
      pinSetupConfirmInput="482910"
    />,
    { columns: 100, rows: 18 }
  );
  const setupPlain = stripAnsi(setupAnsi);
  expect(setupPlain).toContain('Set 6-Digit Encryption PIN (First Account Setup)');
});
