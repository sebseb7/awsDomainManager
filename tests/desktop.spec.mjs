import { mkdirSync } from 'fs';
import { test, expect } from '@playwright/test';
import {
  DUMMY_PROFILES,
  DUMMY_HOSTED_ZONES,
  DUMMY_DNS_RECORDS,
  DUMMY_SECURITY_GROUPS,
  DUMMY_EC2_INSTANCES,
  DUMMY_ELASTIC_IPS,
  DUMMY_INBOUND_RULES,
  DUMMY_BUCKETS,
  DUMMY_S3_OBJECTS,
  DUMMY_BUCKET_IAM_USERS,
  DUMMY_RECREATED_CREDENTIAL,
  DUMMY_SES_IDENTITIES,
  DUMMY_SES_SENDER_KEYS,
} from './fixtures/dummyData.mjs';

mkdirSync('docs', { recursive: true });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({
      profiles,
      zones,
      records,
      groups,
      ec2Instances,
      elasticIps,
      rules,
      buckets,
      objects,
      iamUsers,
      recreatedCred,
      sesIdentities,
      sesSenderKeys,
    }) => {
      let currentUsers = structuredClone(iamUsers);
      let currentSes = structuredClone(sesIdentities);
      let currentSesKeys = structuredClone(sesSenderKeys);
      let currentInstances = structuredClone(ec2Instances);
      let currentEips = structuredClone(elasticIps);

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
            case 'list_ec2_instances':
              return currentInstances;
            case 'list_elastic_ips':
              return currentEips;
            case 'set_ec2_reboot_lock': {
              currentInstances = currentInstances.map((inst) =>
                inst.instanceId === args.instanceId
                  ? { ...inst, rebootLock: Boolean(args.locked) }
                  : inst
              );
              return args.locked
                ? `Reboot Lock enabled for instance ${args.instanceId} (Tag RebootLock=true).`
                : `Reboot Lock disabled for instance ${args.instanceId}.`;
            }
            case 'reboot_ec2_instance': {
              const target = currentInstances.find((i) => i.instanceId === args.instanceId);
              if (target?.rebootLock) {
                throw `Instance ${args.instanceId} has Reboot Lock enabled. Unlock it before attempting to reboot.`;
              }
              return `Reboot initiated for EC2 instance ${args.instanceId}.`;
            }
            case 'start_ec2_instance': {
              currentInstances = currentInstances.map((inst) =>
                inst.instanceId === args.instanceId ? { ...inst, state: 'running' } : inst
              );
              return `Start initiated for EC2 instance ${args.instanceId}.`;
            }
            case 'stop_ec2_instance': {
              const target = currentInstances.find((i) => i.instanceId === args.instanceId);
              if (target?.rebootLock) {
                throw `Instance ${args.instanceId} has Reboot Lock enabled. Unlock it before attempting to stop.`;
              }
              currentInstances = currentInstances.map((inst) =>
                inst.instanceId === args.instanceId ? { ...inst, state: 'stopped' } : inst
              );
              return `Stop initiated for EC2 instance ${args.instanceId}.`;
            }
            case 'allocate_elastic_ip': {
              const created = {
                allocationId: `eipalloc-0a1b2c3d4e5f6000${currentEips.length + 1}`,
                publicIp: '35.158.112.90',
                name: args.name || '-',
                associationId: null,
                instanceId: null,
                instanceName: null,
                privateIp: '-',
                networkInterfaceId: '-',
                domain: 'vpc',
                publicIpv4Pool: 'amazon',
                networkBorderGroup: 'eu-central-1',
              };
              currentEips.push(created);
              return created;
            }
            case 'associate_elastic_ip': {
              const inst = currentInstances.find((i) => i.instanceId === args.instanceId);
              currentEips = currentEips.map((e) =>
                e.allocationId === args.allocationId
                  ? {
                      ...e,
                      associationId: 'eipassoc-0987654321fed9999',
                      instanceId: args.instanceId,
                      instanceName: inst?.name || null,
                      privateIp: inst?.privateIp || '-',
                    }
                  : e
              );
              return `Associated Elastic IP (${args.allocationId}) with instance ${args.instanceId}.`;
            }
            case 'disassociate_elastic_ip': {
              currentEips = currentEips.map((e) =>
                e.associationId === args.associationId
                  ? {
                      ...e,
                      associationId: null,
                      instanceId: null,
                      instanceName: null,
                      privateIp: '-',
                    }
                  : e
              );
              return `Disassociated Elastic IP (association ${args.associationId}).`;
            }
            case 'release_elastic_ip': {
              currentEips = currentEips.filter((e) => e.allocationId !== args.allocationId);
              return `Released Elastic IP ${args.allocationId}.`;
            }
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
            case 'resend_ses_verification_email': {
              return `Verification email resent to "${args.identityName}". Check the inbox and click the provided link.`;
            }
            case 'publish_ses_dkim_records': {
              return `Published 3 DKIM CNAME records for "${args.domain}" to Route53 zone "example.com." (prod-aws).`;
            }
            case 'publish_ses_mx_record': {
              currentSes = currentSes.map((i) =>
                i.identityName === args.domain
                  ? {
                      ...i,
                      mxRecordPublished: true,
                      mxExistingValue: '10 inbound-smtp.eu-central-1.amazonaws.com',
                    }
                  : i
              );
              return `Published SES inbound MX record (10 inbound-smtp.eu-central-1.amazonaws.com) for "${args.domain}" to Route53 zone "example.com." (prod-aws).`;
            }
            case 'list_ses_sender_keys': {
              return currentSesKeys.filter((k) => k.identityName === args.identityName);
            }
            case 'create_ses_sender_key': {
              const name =
                args.customUserName?.trim() ||
                `ses-alerts-example-com-${currentSesKeys.length + 1}`;
              const keyId = `AKIASMTPNEW000${currentSesKeys.length + 1}EXMP`;
              const created = {
                identityName: args.identityName,
                userName: name,
                region: 'eu-central-1',
                smtpHost: 'email-smtp.eu-central-1.amazonaws.com',
                smtpPort: 587,
                smtpUsername: keyId,
                smtpPassword: 'BNExampleSigV4DerivedSmtpPassword000000000000=',
                accessKeyId: keyId,
                secretAccessKey: 'exampleSecretKey000000000000000000000000',
              };
              currentSesKeys.push({
                identityName: args.identityName,
                userName: name,
                region: 'eu-central-1',
                smtpHost: created.smtpHost,
                smtpPort: 587,
                policyName: 'AmazonSesSendingAccess',
                createdAt: '2026-11-21T12:00:00Z',
                lastUsedAt: 'Never',
                accessKeys: [
                  {
                    accessKeyId: keyId,
                    status: 'Active',
                    createDate: '2026-11-21T12:00:00Z',
                    lastUsedDate: 'Never',
                  },
                ],
              });
              return created;
            }
            case 'recreate_ses_sender_key': {
              return {
                identityName: args.identityName,
                userName: args.userName,
                region: 'eu-central-1',
                smtpHost: 'email-smtp.eu-central-1.amazonaws.com',
                smtpPort: 587,
                smtpUsername: 'AKIASMTPROTATED99EXMP',
                smtpPassword: 'BNRotatedSigV4DerivedSmtpPassword00000000000=',
                accessKeyId: 'AKIASMTPROTATED99EXMP',
                secretAccessKey: 'rotatedSecretKey000000000000000000000000',
              };
            }
            case 'revoke_ses_sender_key': {
              currentSesKeys = currentSesKeys.filter((k) => k.userName !== args.userName);
              return null;
            }
            case 'test_ses_smtp_send': {
              const inp = args.input || {};
              return `SMTP test email sent from "${inp.fromEmail}" to "${inp.toEmail}" via ${inp.smtpHost}:${inp.smtpPort} (250 Ok 01070193example).`;
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
      ec2Instances: DUMMY_EC2_INSTANCES,
      elasticIps: DUMMY_ELASTIC_IPS,
      rules: DUMMY_INBOUND_RULES,
      buckets: DUMMY_BUCKETS,
      objects: DUMMY_S3_OBJECTS,
      iamUsers: DUMMY_BUCKET_IAM_USERS,
      recreatedCred: DUMMY_RECREATED_CREDENTIAL,
      sesIdentities: DUMMY_SES_IDENTITIES,
      sesSenderKeys: DUMMY_SES_SENDER_KEYS,
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

  // 2. EC2 Instances & Elastic IPs -> state, IP, reboot, reboot lock & Elastic IP list
  await page.getByRole('button', { name: /EC2 Instances & EIPs/i }).click();
  await expect(page.getByText('EC2 Instances (4)')).toBeVisible();
  await expect(page.getByText('Elastic IPs (3)')).toBeVisible();
  await expect(page.getByText('spare-failover-eip')).toBeVisible();
  await expect(page.getByText('52.59.210.77')).toBeVisible();
  const webInstRow = page.locator('tr', { hasText: 'i-0a1b2c3d4e5f60101' });
  await expect(webInstRow.getByText('Locked', { exact: true })).toBeVisible();
  await expect(webInstRow.getByRole('button', { name: /Reboot/i })).toBeDisabled();
  const apiInstRow = page.locator('tr', { hasText: 'i-0a1b2c3d4e5f60102' });
  await expect(apiInstRow.getByText('Unlocked', { exact: true })).toBeVisible();
  await expect(apiInstRow.getByRole('button', { name: /Reboot/i })).toBeEnabled();
  await page.screenshot({ path: 'docs/desktop-ec2-instances.png' });

  // Test toggling Reboot Lock and rebooting an unlocked instance
  await apiInstRow.getByRole('button', { name: /Reboot/i }).click();
  await expect(page.getByText('Reboot EC2 Instance')).toBeVisible();
  await page.getByRole('button', { name: /Reboot Instance/i }).click();
  await expect(
    page.getByText('Reboot initiated for EC2 instance i-0a1b2c3d4e5f60102.')
  ).toBeVisible();
  await apiInstRow.getByRole('button', { name: 'Lock', exact: true }).click();
  await expect(
    page.getByText('Reboot Lock enabled for instance i-0a1b2c3d4e5f60102')
  ).toBeVisible();
  await expect(apiInstRow.getByRole('button', { name: /Reboot/i })).toBeDisabled();

  // 2b. EC2 Security Groups -> click into prod-web-sg
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
  await expect(page.getByText('Action required')).toBeVisible();
  const pendingEmailRow = page.locator('tr', { hasText: 'dev-team@staging.example.com' });
  await expect(pendingEmailRow.getByText('Check inbox')).toBeVisible();
  await expect(pendingEmailRow.getByRole('button', { name: /Resend/i })).toBeVisible();
  const verifiedEmailRow = page.locator('tr', { hasText: 'alerts@example.com' });
  await expect(verifiedEmailRow.getByRole('button', { name: /Resend/i })).toHaveCount(0);
  await expect(verifiedEmailRow.getByRole('button', { name: /Publish MX/i })).toHaveCount(0);
  const mailDomainRow = page.locator('tr', { hasText: 'mail.example.com' });
  await expect(mailDomainRow.getByRole('button', { name: /Publish MX/i })).toHaveCount(0);
  const stagingDomainRow = page.locator('tr', { hasText: 'staging.example.com' }).first();
  await expect(stagingDomainRow.getByRole('button', { name: /Publish MX/i })).toBeVisible();
  await page.screenshot({ path: 'docs/desktop-ses.png' });

  // Test resending verification email for pending email identity
  await pendingEmailRow.getByRole('button', { name: /Resend/i }).click();
  await expect(
    page.getByText('Verification email resent to "dev-team@staging.example.com".')
  ).toBeVisible();

  // Test publishing SES inbound MX record directly (no existing MX) and with overwrite confirmation (existing MX)
  await stagingDomainRow.getByRole('button', { name: /Publish MX/i }).click();
  await expect(
    page.getByText('Published SES inbound MX record (10 inbound-smtp.eu-central-1.amazonaws.com)')
  ).toBeVisible();
  await expect(stagingDomainRow.getByRole('button', { name: /Publish MX/i })).toHaveCount(0);

  const rootDomainRow = page.locator('tr', { hasText: /^example\.com/ });
  await rootDomainRow.getByRole('button', { name: /Publish MX/i }).click();
  await expect(page.getByText('Replace Existing MX Record?')).toBeVisible();
  await expect(page.getByText('10 mail.example.com.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // 5b. SES Email SMTP Sender Keys (AmazonSesSendingAccess) & Integrated SMTP Send Tester
  await verifiedEmailRow.getByRole('button', { name: /Keys/i }).click();
  await expect(page.getByText('AmazonSesSendingAccess')).toBeVisible();
  await expect(page.getByText('ses-alerts-example-com')).toBeVisible();
  await expect(page.getByText('ses-alerts-ci-notifier')).toBeVisible();

  // Add a 3rd sender key for the same email (multiple allowed) -> opens credentials + QR modal -> test SMTP send
  await page.getByRole('button', { name: /Add Sender Key/i }).click();
  await page.getByRole('button', { name: /Create Key/i }).click();
  await expect(page.getByText('SMTP Sender Key Created — alerts@example.com')).toBeVisible();
  await expect(page.getByText('BNExampleSigV4DerivedSmtpPassword000000000000=')).toBeVisible();
  await expect(page.locator('img[alt="SES SMTP Credentials QR Code"]')).toBeVisible();
  await expect(
    page.getByText(/pos420settings.*backupemailreceiver, reconciliationemailreceiver/)
  ).toBeVisible();
  await page.getByRole('button', { name: /Test SMTP Send/i }).click();
  await expect(page.getByRole('button', { name: /Send Test Email/i })).toBeVisible();
  await page.getByRole('button', { name: /Send Test Email/i }).click();
  await expect(
    page.getByText('250 Ok 01070193example').first()
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  // 6. AWS Accounts & IAM Permissions Guide
  await page.getByRole('button', { name: /AWS Accounts/i }).click();
  await expect(page.getByText('prod-aws')).toBeVisible();
  await page.getByRole('button', { name: /Minimum IAM Permissions/i }).click();
  await expect(page.getByText('IAMScopedUsersOnly')).toBeVisible();
  await expect(page.getByText('arn:aws:iam::*:user/s3-bucket-users/*')).toBeVisible();
  await expect(page.getByText('arn:aws:iam::*:user/ses-smtp-users/*')).toBeVisible();
  await expect(page.getByText('ec2:DescribeInstances')).toBeVisible();
  await expect(page.getByText('ec2:RebootInstances')).toBeVisible();
  await expect(page.getByText('ec2:DescribeAddresses')).toBeVisible();
  await expect(page.getByText('ses:CreateEmailIdentity')).toBeVisible();
  const policyText = await page.locator('pre.code-block').innerText();
  expect(policyText.length).toBeLessThanOrEqual(2048);
  expect(policyText.replace(/\s+/g, '').length).toBeLessThanOrEqual(2048);
  await page.screenshot({ path: 'docs/desktop-accounts.png' });
});
