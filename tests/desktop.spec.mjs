import { mkdirSync } from 'fs';
import { test, expect } from '@playwright/test';
import {
  DUMMY_PROFILES,
  DUMMY_HOSTED_ZONES,
  DUMMY_DNS_RECORDS,
  DUMMY_SECURITY_GROUPS,
  DUMMY_INBOUND_RULES,
  DUMMY_BUCKETS,
  DUMMY_S3_OBJECTS,
  DUMMY_BUCKET_IAM_USERS,
  DUMMY_RECREATED_CREDENTIAL,
  DUMMY_SES_IDENTITIES,
} from './fixtures/dummyData.mjs';

mkdirSync('docs', { recursive: true });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({
      profiles,
      zones,
      records,
      groups,
      rules,
      buckets,
      objects,
      iamUsers,
      recreatedCred,
      sesIdentities,
    }) => {
      let currentUsers = structuredClone(iamUsers);
      let currentSes = structuredClone(sesIdentities);

      window.__TAURI_INTERNALS__ = {
        transformCallback: () => 0,
        invoke: async (cmd, args = {}) => {
          switch (cmd) {
            case 'list_profiles':
              return profiles;
            case 'list_hosted_zones':
              return zones;
            case 'list_dns_records':
              return records;
            case 'list_security_groups':
              return groups;
            case 'list_inbound_rules':
              return rules;
            case 'list_buckets':
              return buckets;
            case 'list_bucket_objects':
              return objects;
            case 'get_bucket_region':
              return 'eu-central-1';
            case 'list_bucket_iam_users':
              return currentUsers.filter((u) => u.bucketName === args.bucketName);
            case 'create_bucket_iam_user': {
              if (
                args.role === 'put-only' &&
                currentUsers.some(
                  (u) => u.bucketName === args.bucketName && u.role === 'put-only'
                )
              ) {
                throw 'Only one write (put-only) key/user is allowed per bucket.';
              }
              const name =
                args.customUserName?.trim() ||
                `${args.bucketName}-${args.role === 'put-only' ? 'put' : `read-${currentUsers.length + 1}`}`;
              const created = {
                bucketName: args.bucketName,
                userName: name,
                role: args.role,
                roleLabel:
                  args.role === 'put-only'
                    ? 'Put Only (no read, no delete)'
                    : 'Read Only (no put, no delete)',
                accessKeyId: 'AKIANEWKEY0000EXAMPLE',
                secretAccessKey: 'newSecretKeyValue000000000000000000EXAMPLE',
              };
              currentUsers.push({
                bucketName: args.bucketName,
                userName: name,
                role: args.role,
                roleLabel: created.roleLabel,
                createdAt: '2026-11-21T08:00:00Z',
                accessKeys: [
                  {
                    accessKeyId: created.accessKeyId,
                    status: 'Active',
                    createDate: '2026-11-21T08:00:00Z',
                  },
                ],
              });
              return created;
            }
            case 'recreate_bucket_iam_user': {
              currentUsers = currentUsers.map((u) =>
                u.userName === args.userName
                  ? {
                      ...u,
                      accessKeys: [
                        {
                          accessKeyId: recreatedCred.accessKeyId,
                          status: 'Active',
                          createDate: '2026-11-21T08:45:00Z',
                        },
                      ],
                    }
                  : u
              );
              return {
                ...recreatedCred,
                bucketName: args.bucketName,
                userName: args.userName,
                role: args.role,
              };
            }
            case 'revoke_bucket_iam_user': {
              currentUsers = currentUsers.filter((u) => u.userName !== args.userName);
              return null;
            }
            case 'list_ses_identities':
              return currentSes;
            case 'create_ses_identity': {
              const isEmail = args.identityName.includes('@');
              currentSes.push({
                identityName: args.identityName,
                identityType: isEmail ? 'EMAIL_ADDRESS' : 'DOMAIN',
                typeLabel: isEmail ? 'Email' : 'Domain',
                verificationStatus: 'PENDING',
                dkimStatus: 'PENDING',
                sendingEnabled: false,
              });
              return args.identityName;
            }
            case 'delete_ses_identity': {
              currentSes = currentSes.filter((i) => i.identityName !== args.identityName);
              return null;
            }
            case 'publish_ses_dkim_records': {
              return `Published 3 DKIM CNAME records for "${args.domain}" to Route53 zone "example.com." (prod-aws).`;
            }
            default:
              return [];
          }
        },
      };
    },
    {
      profiles: DUMMY_PROFILES,
      zones: DUMMY_HOSTED_ZONES,
      records: DUMMY_DNS_RECORDS,
      groups: DUMMY_SECURITY_GROUPS,
      rules: DUMMY_INBOUND_RULES,
      buckets: DUMMY_BUCKETS,
      objects: DUMMY_S3_OBJECTS,
      iamUsers: DUMMY_BUCKET_IAM_USERS,
      recreatedCred: DUMMY_RECREATED_CREDENTIAL,
      sesIdentities: DUMMY_SES_IDENTITIES,
    }
  );
});

test('Desktop App: Route53, EC2, S3 IAM Keys (multiple read / single write), QR modal & Accounts screenshots', async ({
  page,
}) => {
  await page.goto('/');

  // 1. Route53 Hosted Zones -> click into example.com.
  await expect(page.getByText('example.com.')).toBeVisible();
  await page.getByText('example.com.').click();
  await expect(page.getByText('203.0.113.10')).toBeVisible();
  await page.screenshot({ path: 'docs/desktop-route53.png' });

  // 2. EC2 Security Groups -> click into prod-web-sg
  await page.getByRole('button', { name: /EC2 Security Groups/i }).click();
  await expect(page.getByText('prod-web-sg')).toBeVisible();
  await page.getByText('prod-web-sg').click();
  await expect(page.getByText('Public HTTPS traffic')).toBeVisible();
  await page.screenshot({ path: 'docs/desktop-ec2.png' });

  // 3. S3 Buckets -> open IAM Keys modal for acme-backups-prod
  await page.getByRole('button', { name: /S3 Buckets/i }).click();
  await expect(page.getByText('acme-backups-prod')).toBeVisible();
  const backupRow = page.locator('tr', { hasText: 'acme-backups-prod' });
  await backupRow.getByRole('button', { name: /Keys/i }).click();

  // Verify 1/1 write key cap (no Create Write Key button) and 3 read keys
  await expect(page.getByText('1 / 1')).toBeVisible();
  await expect(page.getByText('3 keys')).toBeVisible();
  await expect(page.getByRole('button', { name: /Create Write Key/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Add Read Key/i })).toBeVisible();
  await page.screenshot({ path: 'docs/desktop-s3-keys.png' });

  // 4. Recreate write key -> confirm -> QR credentials modal
  const writeRow = page.locator('tr', { hasText: 'acme-backups-prod-put' });
  await writeRow.getByRole('button', { name: /Recreate/i }).click();
  await expect(page.getByText('Recreate Access Key')).toBeVisible();
  await page.getByRole('button', { name: /Recreate Key/i }).click();
  await expect(page.getByText('AKIAWRITE9999ROTATED', { exact: true })).toBeVisible();
  await expect(page.locator('img[alt="S3 Bucket Credentials QR Code"]')).toBeVisible();
  await page.screenshot({ path: 'docs/desktop-s3-qr.png' });

  // Close QR modal and Keys modal
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Close' }).click();

  // 5. Amazon SES Identities (Domains & Email Addresses)
  await page.getByRole('button', { name: /Amazon SES/i }).click();
  await expect(page.getByText('Domains (3)')).toBeVisible();
  await expect(page.getByText('Email Addresses (3)')).toBeVisible();
  await expect(page.getByText('alerts@example.com')).toBeVisible();
  await page.screenshot({ path: 'docs/desktop-ses.png' });

  // 6. AWS Accounts & IAM Permissions Guide
  await page.getByRole('button', { name: /AWS Accounts/i }).click();
  await expect(page.getByText('prod-aws')).toBeVisible();
  await page.getByRole('button', { name: /Minimum IAM Permissions/i }).click();
  await expect(page.getByText('IAMManageBucketUsersOnly')).toBeVisible();
  await expect(page.getByText('SESManageIdentities')).toBeVisible();
  await page.screenshot({ path: 'docs/desktop-accounts.png' });
});
