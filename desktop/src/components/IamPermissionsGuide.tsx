import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, ShieldCheck } from 'lucide-react';

interface Props {
  defaultExpanded?: boolean;
}

export const IamPermissionsGuide: React.FC<Props> = ({ defaultExpanded = false }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [includeRoute53, setIncludeRoute53] = useState(true);
  const [includeEc2, setIncludeEc2] = useState(true);
  const [includeS3, setIncludeS3] = useState(true);
  const [includeIamBucketUsers, setIncludeIamBucketUsers] = useState(true);
  const [includeSes, setIncludeSes] = useState(true);
  const [includeSesSmtpUsers, setIncludeSesSmtpUsers] = useState(true);
  const [readOnly, setReadOnly] = useState(false);
  const [copied, setCopied] = useState(false);

  const policyJson = useMemo(() => {
    const statements: Record<string, unknown>[] = [];
    const wildcardActions: string[] = [];

    if (includeRoute53) {
      wildcardActions.push('route53:ListHostedZones');
    }

    if (includeEc2) {
      wildcardActions.push(
        ...(readOnly
          ? ['ec2:DescribeSecurityGroups', 'ec2:DescribeSecurityGroupRules']
          : [
              'ec2:DescribeSecurityGroups',
              'ec2:DescribeSecurityGroupRules',
              'ec2:AuthorizeSecurityGroupIngress',
              'ec2:RevokeSecurityGroupIngress',
            ])
      );
    }

    if (includeS3) {
      wildcardActions.push('s3:ListAllMyBuckets');
    }

    if ((includeIamBucketUsers || includeSesSmtpUsers) && !readOnly) {
      wildcardActions.push('iam:ListUsers');
    }

    if (includeSes) {
      wildcardActions.push(
        ...(readOnly
          ? ['ses:ListEmailIdentities', 'ses:GetEmailIdentity']
          : [
              'ses:ListEmailIdentities',
              'ses:GetEmailIdentity',
              'ses:CreateEmailIdentity',
              'ses:DeleteEmailIdentity',
            ])
      );
    }

    if (wildcardActions.length > 0) {
      statements.push({
        Sid: 'GlobalAndListActions',
        Effect: 'Allow',
        Action: wildcardActions,
        Resource: '*',
      });
    }

    if (includeRoute53) {
      statements.push({
        Sid: 'Route53Records',
        Effect: 'Allow',
        Action: readOnly
          ? ['route53:ListResourceRecordSets']
          : ['route53:ListResourceRecordSets', 'route53:ChangeResourceRecordSets'],
        Resource: 'arn:aws:route53:::hostedzone/*',
      });
    }

    if (includeS3) {
      statements.push({
        Sid: 'S3BucketsAndObjects',
        Effect: 'Allow',
        Action: readOnly
          ? ['s3:ListBucket', 's3:GetBucketLocation', 's3:GetObject']
          : [
              's3:CreateBucket',
              's3:DeleteBucket',
              's3:GetBucketLocation',
              's3:ListBucket',
              's3:GetObject',
              's3:PutObject',
              's3:DeleteObject',
            ],
        Resource: ['arn:aws:s3:::*', 'arn:aws:s3:::*/*'],
      });
    }

    const scopedIamResources: string[] = [];
    if (includeIamBucketUsers && !readOnly) {
      scopedIamResources.push('arn:aws:iam::*:user/s3-bucket-users/*');
    }
    if (includeSesSmtpUsers && !readOnly) {
      scopedIamResources.push('arn:aws:iam::*:user/ses-smtp-users/*');
    }

    if (scopedIamResources.length > 0) {
      statements.push({
        Sid: 'IAMScopedUsersOnly',
        Effect: 'Allow',
        Action: [
          'iam:GetUser',
          'iam:ListUserTags',
          'iam:CreateUser',
          'iam:DeleteUser',
          'iam:TagUser',
          'iam:PutUserPolicy',
          'iam:ListUserPolicies',
          'iam:DeleteUserPolicy',
          'iam:CreateAccessKey',
          'iam:ListAccessKeys',
          'iam:DeleteAccessKey',
          'iam:GetAccessKeyLastUsed',
        ],
        Resource: scopedIamResources.length === 1 ? scopedIamResources[0] : scopedIamResources,
      });
    }

    return JSON.stringify(
      {
        Version: '2012-10-17',
        Statement: statements,
      },
      null,
      2
    );
  }, [
    includeRoute53,
    includeEc2,
    includeS3,
    includeIamBucketUsers,
    includeSes,
    includeSesSmtpUsers,
    readOnly,
  ]);

  const inlinePolicyLength = useMemo(
    () => policyJson.replace(/\s+/g, '').length,
    [policyJson]
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(policyJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="card permissions-card">
      <button
        type="button"
        className="permissions-header"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="permissions-header-left">
          <ShieldCheck size={17} color="var(--green)" />
          <div>
            <div className="permissions-title">
              Minimum IAM Permissions (Least Privilege)
            </div>
            <div className="permissions-sub">
              Create a dedicated IAM user for this app instead of root or AdministratorAccess
            </div>
          </div>
        </div>
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      {expanded && (
        <div className="permissions-body">
          <p className="permissions-intro">
            Attach only the policy statements for the features you plan to use. Toggle features
            below to customize the IAM policy JSON before copying it into the AWS IAM Console.
          </p>

          <div className="permissions-toggles">
            <label className="perm-check">
              <input
                type="checkbox"
                checked={includeRoute53}
                onChange={(e) => setIncludeRoute53(e.target.checked)}
              />
              <span>Route53 DNS</span>
            </label>
            <label className="perm-check">
              <input
                type="checkbox"
                checked={includeEc2}
                onChange={(e) => setIncludeEc2(e.target.checked)}
              />
              <span>EC2 Security Groups</span>
            </label>
            <label className="perm-check">
              <input
                type="checkbox"
                checked={includeS3}
                onChange={(e) => setIncludeS3(e.target.checked)}
              />
              <span>S3 Buckets &amp; Objects</span>
            </label>
            <label className="perm-check">
              <input
                type="checkbox"
                checked={includeIamBucketUsers && !readOnly}
                disabled={readOnly}
                onChange={(e) => setIncludeIamBucketUsers(e.target.checked)}
              />
              <span>Per-Bucket IAM Users</span>
            </label>
            <label className="perm-check">
              <input
                type="checkbox"
                checked={includeSes}
                onChange={(e) => setIncludeSes(e.target.checked)}
              />
              <span>Amazon SES Identities</span>
            </label>
            <label className="perm-check">
              <input
                type="checkbox"
                checked={includeSesSmtpUsers && !readOnly}
                disabled={readOnly}
                onChange={(e) => setIncludeSesSmtpUsers(e.target.checked)}
              />
              <span>SES SMTP Sender Keys</span>
            </label>
            <label className="perm-check perm-check-readonly">
              <input
                type="checkbox"
                checked={readOnly}
                onChange={(e) => setReadOnly(e.target.checked)}
              />
              <span>Read-Only Mode</span>
            </label>
          </div>

          <div className="code-block-wrap">
            <div className="code-block-header">
              <span>
                IAM Inline / Managed Policy JSON ({inlinePolicyLength.toLocaleString()} / 2,048
                non-whitespace chars · {policyJson.length.toLocaleString()} total)
              </span>
              <button type="button" className="btn btn-sm" onClick={handleCopy}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy JSON'}
              </button>
            </div>
            <pre className="code-block mono">{policyJson}</pre>
          </div>

          <div className="permissions-notes">
            <div>
              <strong>IAM user isolation:</strong> Per-bucket S3 users are placed under{' '}
              <code className="mono">/s3-bucket-users/</code> and per-email SES SMTP sender users
              under <code className="mono">/ses-smtp-users/</code>, so this management account
              cannot modify any other IAM users.
            </div>
            <div>
              <strong>Further scoping:</strong> Replace{' '}
              <code className="mono">arn:aws:route53:::hostedzone/*</code> with specific hosted
              zone IDs, or <code className="mono">arn:aws:s3:::*</code> with specific bucket name
              patterns (e.g. <code className="mono">arn:aws:s3:::my-prefix-*</code>).
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
