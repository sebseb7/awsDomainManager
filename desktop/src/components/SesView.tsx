import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  Globe,
  Inbox,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { api } from '../api';
import type { AwsProfile, SesIdentity } from '../types';
import { SesSenderKeysModal } from './SesSenderKeysModal';

interface Props {
  account: AwsProfile;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

const getIdentityDomain = (item: SesIdentity): string => {
  if (item.domain) return item.domain;
  const trimmed = item.identityName.trim().replace(/\.$/, '');
  const atIdx = trimmed.lastIndexOf('@');
  return atIdx >= 0 ? trimmed.slice(atIdx + 1) : trimmed;
};

const needsEmailVerification = (item: SesIdentity): boolean =>
  item.identityType === 'EMAIL_ADDRESS' && item.verificationStatus !== 'SUCCESS';

const getSesInboundMxValue = (item: SesIdentity, region?: string): string => {
  if (item.mxRecordValue) return item.mxRecordValue;
  const cleanRegion = (region || '').trim() || 'us-east-1';
  return `10 inbound-smtp.${cleanRegion}.amazonaws.com`;
};

export const SesView: React.FC<Props> = ({ account, onError, onSuccess }) => {
  const [identities, setIdentities] = useState<SesIdentity[]>([]);
  const [loading, setLoading] = useState(false);
  const [resendingIdentity, setResendingIdentity] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'DOMAIN' | 'EMAIL_ADDRESS'>('ALL');

  const [showCreate, setShowCreate] = useState(false);
  const [newIdentityName, setNewIdentityName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SesIdentity | null>(null);
  const [mxConfirmTarget, setMxConfirmTarget] = useState<SesIdentity | null>(null);
  const [dnsModalTarget, setDnsModalTarget] = useState<SesIdentity | null>(null);
  const [senderKeysTarget, setSenderKeysTarget] = useState<SesIdentity | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadIdentities = async () => {
    setLoading(true);
    try {
      const data = await api.listSesIdentities(account.profile);
      setIdentities(data);
    } catch (e) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSearch('');
    setTypeFilter('ALL');
    loadIdentities();
  }, [account.profile, account.region]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const message = await api.createSesIdentity(account.profile, newIdentityName);
      setShowCreate(false);
      setNewIdentityName('');
      onSuccess(message);
      await loadIdentities();
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePublishDns = async (item: SesIdentity) => {
    setLoading(true);
    try {
      const msg = await api.publishSesDkimRecords(
        account.profile,
        item.identityName,
        item.dkimTokens || []
      );
      onSuccess(msg);
      await loadIdentities();
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const executePublishMx = async (item: SesIdentity) => {
    setLoading(true);
    try {
      const msg = await api.publishSesMxRecord(account.profile, item.identityName);
      setMxConfirmTarget(null);
      onSuccess(msg);
      await loadIdentities();
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePublishMx = async (item: SesIdentity) => {
    if (item.mxExistingValue && !item.mxRecordPublished) {
      setMxConfirmTarget(item);
      return;
    }
    await executePublishMx(item);
  };

  const handleResendVerification = async (item: SesIdentity) => {
    setLoading(true);
    setResendingIdentity(item.identityName);
    try {
      const msg = await api.resendSesVerificationEmail(account.profile, item.identityName);
      onSuccess(msg);
      await loadIdentities();
    } catch (err) {
      onError(String(err));
    } finally {
      setResendingIdentity(null);
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setLoading(true);
    try {
      await api.deleteSesIdentity(account.profile, deleteTarget.identityName);
      onSuccess(`Deleted SES identity "${deleteTarget.identityName}".`);
      setDeleteTarget(null);
      await loadIdentities();
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (key: string, val: string) => {
    await navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const renderStatusBadge = (status: string) => {
    if (status === 'SUCCESS') {
      return <span className="badge badge-green">Verified</span>;
    }
    if (status === 'PENDING') {
      return <span className="badge badge-type">Pending</span>;
    }
    if (status === 'FAILED') {
      return <span className="badge badge-red">Failed</span>;
    }
    if (status === 'TEMPORARY_FAILURE') {
      return <span className="badge badge-red">Temp. Failure</span>;
    }
    if (status === 'NOT_STARTED') {
      return <span className="badge badge-type">Not Started</span>;
    }
    if (status === '-') {
      return <span style={{ color: 'var(--text-muted)' }}>-</span>;
    }
    return <span className="badge">{status}</span>;
  };

  const isAllDnsPublished = (item: SesIdentity): boolean => {
    if (typeof item.dnsRecordsPublished === 'boolean') {
      return item.dnsRecordsPublished;
    }
    if (item.identityType === 'DOMAIN') {
      return Boolean(item.dkimRecordsPublished) && Boolean(item.dmarcRecordPublished);
    }
    return Boolean(item.dmarcRecordPublished);
  };

  const domainCount = identities.filter((i) => i.identityType === 'DOMAIN').length;
  const emailCount = identities.filter((i) => i.identityType === 'EMAIL_ADDRESS').length;

  const filtered = identities.filter((item) => {
    if (typeFilter !== 'ALL' && item.identityType !== typeFilter) return false;
    return item.identityName.toLowerCase().includes(search.toLowerCase());
  });

  const unverifiedEmails = filtered.filter(needsEmailVerification);

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-group">
          <input
            className="search-input"
            placeholder="Filter domains or emails..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="tab-bar">
            <button
              className={`tab-btn ${typeFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setTypeFilter('ALL')}
            >
              All ({identities.length})
            </button>
            <button
              className={`tab-btn ${typeFilter === 'DOMAIN' ? 'active' : ''}`}
              onClick={() => setTypeFilter('DOMAIN')}
            >
              Domains ({domainCount})
            </button>
            <button
              className={`tab-btn ${typeFilter === 'EMAIL_ADDRESS' ? 'active' : ''}`}
              onClick={() => setTypeFilter('EMAIL_ADDRESS')}
            >
              Email Addresses ({emailCount})
            </button>
          </div>
        </div>
        <div className="toolbar-group">
          <button className="btn" onClick={loadIdentities} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Add Identity
          </button>
        </div>
      </div>

      {unverifiedEmails.length > 0 && (
        <div className="banner banner-warning ses-action-banner" role="alert">
          <div className="ses-action-banner-body">
            <div className="ses-action-banner-title">
              <AlertTriangle size={16} color="var(--accent)" />
              <span>Action required</span>
            </div>
            <p className="ses-action-banner-desc">
              To verify ownership of{' '}
              {unverifiedEmails.length === 1 ? (
                <code className="mono">{unverifiedEmails[0].identityName}</code>
              ) : (
                <>
                  {unverifiedEmails.length} email identities (
                  {unverifiedEmails.map((item, idx) => (
                    <React.Fragment key={item.identityName}>
                      {idx > 0 && ', '}
                      <code className="mono">{item.identityName}</code>
                    </React.Fragment>
                  ))}
                  )
                </>
              )}
              , check your inbox for a verification request email from Amazon SES and click the
              provided link.
            </p>
          </div>
          {unverifiedEmails.length === 1 && (
            <button
              className="btn btn-primary btn-sm"
              style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
              onClick={() => handleResendVerification(unverifiedEmails[0])}
              disabled={loading}
            >
              <Send size={13} />{' '}
              {resendingIdentity === unverifiedEmails[0].identityName ? 'Sending...' : 'Resend'}
            </button>
          )}
        </div>
      )}

      <div className="card">
        {loading && identities.length === 0 ? (
          <div className="empty-state">Loading SES identities...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>No SES identities found</h3>
            <p>Add a domain or email address identity in {account.region || 'us-east-1'}.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="ses-table">
              <thead>
                <tr>
                  <th>Identity (Domain / Email)</th>
                  <th>Type</th>
                  <th>Verification</th>
                  <th>DKIM</th>
                  <th>DMARC</th>
                  <th>Sending</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const isDomain = item.identityType === 'DOMAIN';
                  const alreadyPublished = isAllDnsPublished(item);
                  const pendingEmail = needsEmailVerification(item);
                  return (
                    <tr key={item.identityName}>
                      <td style={{ fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                            {isDomain ? (
                              <Globe size={14} color="var(--accent)" style={{ flexShrink: 0 }} />
                            ) : (
                              <Mail size={14} color="var(--blue)" style={{ flexShrink: 0 }} />
                            )}
                            <span className="mono">{item.identityName}</span>
                          </span>
                          {item.matchedZoneName && (
                            <span
                              className={`badge ${alreadyPublished ? 'badge-green' : 'badge-blue'}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
                              title={
                                alreadyPublished
                                  ? `DKIM/DMARC DNS records published in Route53 zone ${item.matchedZoneName} (${item.matchedZoneProfile || account.profile})`
                                  : `Managed in Route53 zone ${item.matchedZoneName} (${item.matchedZoneProfile || account.profile})`
                              }
                            >
                              {alreadyPublished && <Check size={11} />}
                              {alreadyPublished ? 'R53 Published' : 'Route53'}
                            </span>
                          )}
                          {isDomain && item.mxRecordPublished && (
                            <span
                              className="badge badge-green"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}
                              title={`Inbound MX record published: ${getSesInboundMxValue(item, account.region)}`}
                            >
                              <Check size={11} /> MX
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${isDomain ? 'badge-type' : 'badge-blue'}`}>
                          {item.typeLabel}
                        </span>
                      </td>
                      <td>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2,
                            alignItems: 'flex-start',
                          }}
                        >
                          {renderStatusBadge(item.verificationStatus)}
                          {pendingEmail && (
                            <span
                              style={{ fontSize: 11, color: 'var(--accent)', whiteSpace: 'nowrap' }}
                              title="Check your inbox for a verification request email from Amazon SES and click the provided link"
                            >
                              Check inbox
                            </span>
                          )}
                        </div>
                      </td>
                      <td>{renderStatusBadge(item.dkimStatus)}</td>
                      <td>
                        {item.dmarcRecordPublished ? (
                          <span className="badge badge-green">Published</span>
                        ) : (
                          <span className="badge badge-type">Missing</span>
                        )}
                      </td>
                      <td>
                        {item.sendingEnabled ? (
                          <span style={{ color: 'var(--green)', fontWeight: 500 }}>Enabled</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Disabled</span>
                        )}
                      </td>
                      <td>
                        <div
                          style={{
                            display: 'flex',
                            gap: 4,
                            justifyContent: 'flex-end',
                            flexWrap: 'wrap',
                          }}
                        >
                          {pendingEmail && (
                            <button
                              className="btn btn-sm"
                              style={{
                                borderColor: 'rgba(245, 158, 11, 0.45)',
                                color: 'var(--accent)',
                                background: 'var(--accent-soft)',
                                whiteSpace: 'nowrap',
                              }}
                              title={`Resend verification email to ${item.identityName}`}
                              onClick={() => handleResendVerification(item)}
                              disabled={loading}
                            >
                              <Send size={13} />{' '}
                              {resendingIdentity === item.identityName ? 'Sending...' : 'Resend'}
                            </button>
                          )}
                          {!isDomain && (
                            <button
                              className="btn btn-sm"
                              style={{ whiteSpace: 'nowrap' }}
                              title="Manage SMTP Sender Keys (AmazonSesSendingAccess) & Test Send"
                              onClick={() => setSenderKeysTarget(item)}
                            >
                              <KeyRound size={13} /> Keys
                            </button>
                          )}
                          <button
                            className="btn btn-sm"
                            style={{ whiteSpace: 'nowrap' }}
                            title={
                              isDomain
                                ? 'View DKIM, DMARC & Inbound MX DNS Records'
                                : 'View DKIM & DMARC DNS Records'
                            }
                            onClick={() => setDnsModalTarget(item)}
                          >
                            <Eye size={13} /> DNS
                          </button>
                          {isDomain && item.matchedZoneId && !item.mxRecordPublished && (
                            <button
                              className="btn btn-sm"
                              style={{
                                borderColor: 'rgba(56, 189, 248, 0.4)',
                                color: 'var(--blue)',
                                background: 'rgba(56, 189, 248, 0.12)',
                                whiteSpace: 'nowrap',
                              }}
                              title={`Publish inbound MX record (${getSesInboundMxValue(item, account.region)}) to Route53 zone ${item.matchedZoneName || ''}`}
                              onClick={() => handlePublishMx(item)}
                              disabled={loading}
                            >
                              <Inbox size={13} /> Publish MX
                            </button>
                          )}
                          {!alreadyPublished && item.matchedZoneId && (
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ whiteSpace: 'nowrap' }}
                              title={
                                item.matchedZoneName
                                  ? `Publish missing DKIM/DMARC records to Route53 zone ${item.matchedZoneName}`
                                  : 'Publish DKIM/DMARC records to Route53'
                              }
                              onClick={() => handlePublishDns(item)}
                              disabled={loading}
                            >
                              <UploadCloud size={13} /> Publish R53
                            </button>
                          )}
                          <button
                            className="btn btn-danger btn-sm"
                            title="Delete Identity"
                            onClick={() => setDeleteTarget(item)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={handleCreate}>
            <div className="modal-header">
              <h3>Add Amazon SES Identity</h3>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Domain or Email Address</label>
                <input
                  placeholder="example.com or noreply@example.com"
                  value={newIdentityName}
                  onChange={(e) => setNewIdentityName(e.target.value)}
                  required
                />
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                If the domain matches a Route53 hosted zone in your configured AWS accounts, its
                Easy DKIM <code className="mono">CNAME</code> and DMARC{' '}
                <code className="mono">TXT</code> (<code className="mono">_dmarc.&lt;domain&gt;</code>)
                records will be published to Route53 automatically.
              </p>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                For <strong style={{ color: 'var(--text)' }}>email address</strong> identities,
                Amazon SES sends a verification email to the inbox — click the provided link to
                verify ownership.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                Add Identity
              </button>
            </div>
          </form>
        </div>
      )}

      {dnsModalTarget && (
        <div className="modal-backdrop">
          <div className="modal modal-xl">
            <div className="modal-header">
              <h3>
                SES DNS Records (
                {dnsModalTarget.identityType === 'DOMAIN'
                  ? 'DKIM, DMARC & Inbound MX'
                  : 'DKIM & DMARC'}
                ) — <span className="mono">{dnsModalTarget.identityName}</span>
              </h3>
              <button className="btn btn-sm" onClick={() => setDnsModalTarget(null)}>
                <X size={14} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                DNS records for domain{' '}
                <strong style={{ color: 'var(--text)' }}>
                  {getIdentityDomain(dnsModalTarget)}
                </strong>
                {dnsModalTarget.matchedZoneName
                  ? ` (Route53 zone ${dnsModalTarget.matchedZoneName} on profile "${dnsModalTarget.matchedZoneProfile}"):`
                  : ':'}
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 105 }}>Purpose</th>
                      <th style={{ width: 70 }}>Type</th>
                      <th>Name</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dnsModalTarget.dkimTokens || []).map((token) => {
                      const cleanDom = getIdentityDomain(dnsModalTarget);
                      const recName = `${token}._domainkey.${cleanDom}`;
                      const recVal = `${token}.dkim.amazonses.com`;
                      return (
                        <tr key={token}>
                          <td>
                            <span className="badge badge-blue">DKIM</span>
                          </td>
                          <td>
                            <span className="badge badge-type">CNAME</span>
                          </td>
                          <td className="mono" style={{ fontSize: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ wordBreak: 'break-all' }}>{recName}</span>
                              <button
                                className="btn btn-sm"
                                onClick={() => copyText(`name-${token}`, recName)}
                              >
                                {copiedKey === `name-${token}` ? (
                                  <Check size={12} />
                                ) : (
                                  <Copy size={12} />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="mono" style={{ fontSize: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ wordBreak: 'break-all' }}>{recVal}</span>
                              <button
                                className="btn btn-sm"
                                onClick={() => copyText(`val-${token}`, recVal)}
                              >
                                {copiedKey === `val-${token}` ? (
                                  <Check size={12} />
                                ) : (
                                  <Copy size={12} />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {(() => {
                      const cleanDom = getIdentityDomain(dnsModalTarget);
                      const dmarcName = `_dmarc.${cleanDom}`;
                      const dmarcVal = '"v=DMARC1; p=none;"';
                      return (
                        <tr>
                          <td>
                            <span className="badge badge-green">DMARC</span>
                          </td>
                          <td>
                            <span className="badge badge-type">TXT</span>
                          </td>
                          <td className="mono" style={{ fontSize: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ wordBreak: 'break-all' }}>{dmarcName}</span>
                              <button
                                className="btn btn-sm"
                                onClick={() => copyText('dmarc-name', dmarcName)}
                              >
                                {copiedKey === 'dmarc-name' ? (
                                  <Check size={12} />
                                ) : (
                                  <Copy size={12} />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="mono" style={{ fontSize: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ wordBreak: 'break-all' }}>{dmarcVal}</span>
                              <button
                                className="btn btn-sm"
                                onClick={() => copyText('dmarc-val', dmarcVal)}
                              >
                                {copiedKey === 'dmarc-val' ? (
                                  <Check size={12} />
                                ) : (
                                  <Copy size={12} />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })()}
                    {dnsModalTarget.identityType === 'DOMAIN' &&
                      (() => {
                        const cleanDom = getIdentityDomain(dnsModalTarget);
                        const mxVal = getSesInboundMxValue(dnsModalTarget, account.region);
                        return (
                          <tr>
                            <td>
                              <span
                                className={`badge ${dnsModalTarget.mxRecordPublished ? 'badge-green' : 'badge-blue'}`}
                              >
                                Inbound MX
                              </span>
                            </td>
                            <td>
                              <span className="badge badge-type">MX</span>
                            </td>
                            <td className="mono" style={{ fontSize: 12 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ wordBreak: 'break-all' }}>{cleanDom}</span>
                                <button
                                  className="btn btn-sm"
                                  onClick={() => copyText('mx-name', cleanDom)}
                                >
                                  {copiedKey === 'mx-name' ? (
                                    <Check size={12} />
                                  ) : (
                                    <Copy size={12} />
                                  )}
                                </button>
                              </div>
                            </td>
                            <td className="mono" style={{ fontSize: 12 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ wordBreak: 'break-all' }}>{mxVal}</span>
                                <button
                                  className="btn btn-sm"
                                  onClick={() => copyText('mx-val', mxVal)}
                                >
                                  {copiedKey === 'mx-val' ? (
                                    <Check size={12} />
                                  ) : (
                                    <Copy size={12} />
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })()}
                  </tbody>
                </table>
              </div>
              {dnsModalTarget.identityType === 'DOMAIN' &&
                dnsModalTarget.mxExistingValue &&
                !dnsModalTarget.mxRecordPublished && (
                  <p style={{ fontSize: 12.5, color: 'var(--accent)' }}>
                    Note: <code className="mono">{getIdentityDomain(dnsModalTarget)}</code>{' '}
                    currently has an MX record (
                    <code className="mono">{dnsModalTarget.mxExistingValue}</code>). Publishing
                    the SES inbound MX record will replace it.
                  </p>
                )}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setDnsModalTarget(null)}>
                Close
              </button>
              {dnsModalTarget.identityType === 'DOMAIN' &&
                dnsModalTarget.matchedZoneId &&
                !dnsModalTarget.mxRecordPublished && (
                  <button
                    className="btn"
                    style={{
                      borderColor: 'rgba(56, 189, 248, 0.45)',
                      color: 'var(--blue)',
                      background: 'rgba(56, 189, 248, 0.12)',
                    }}
                    onClick={async () => {
                      const target = dnsModalTarget;
                      setDnsModalTarget(null);
                      await handlePublishMx(target);
                    }}
                    disabled={loading}
                  >
                    <Inbox size={14} /> Publish MX to Route53
                  </button>
                )}
              {!isAllDnsPublished(dnsModalTarget) && (
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    const target = dnsModalTarget;
                    setDnsModalTarget(null);
                    await handlePublishDns(target);
                  }}
                  disabled={loading}
                >
                  <UploadCloud size={14} /> Publish Records to Route53
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {mxConfirmTarget && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Replace Existing MX Record?</h3>
            </div>
            <div className="modal-body">
              <p>
                Domain <code className="mono">{getIdentityDomain(mxConfirmTarget)}</code> already
                has an MX record configured in Route53:
              </p>
              <p>
                <code className="mono">{mxConfirmTarget.mxExistingValue}</code>
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Publishing the Amazon SES inbound MX record will replace it with{' '}
                <code className="mono" style={{ color: 'var(--text)' }}>
                  {getSesInboundMxValue(mxConfirmTarget, account.region)}
                </code>
                .
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setMxConfirmTarget(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => executePublishMx(mxConfirmTarget)}
                disabled={loading}
              >
                <Inbox size={14} /> Replace with SES MX
              </button>
            </div>
          </div>
        </div>
      )}

      {senderKeysTarget && (
        <SesSenderKeysModal
          account={account}
          identityName={senderKeysTarget.identityName}
          onClose={() => setSenderKeysTarget(null)}
          onError={onError}
          onSuccess={onSuccess}
        />
      )}

      {deleteTarget && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Delete SES Identity</h3>
            </div>
            <div className="modal-body">
              <p>
                Delete {deleteTarget.typeLabel.toLowerCase()} identity{' '}
                <code className="mono">{deleteTarget.identityName}</code> from Amazon SES?
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={loading}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
