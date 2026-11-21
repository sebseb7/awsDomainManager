import { mkdirSync } from 'fs';
import React from 'react';
import { test, expect } from '@playwright/test';
import App from '../src/components/App.jsx';
import {
  renderInkToAnsi,
  screenshotAnsiTerminal,
  stripAnsi,
} from './helpers/tuiRenderer.mjs';
import {
  DUMMY_PROFILES,
  DUMMY_HOSTED_ZONES,
  DUMMY_DNS_RECORDS,
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
