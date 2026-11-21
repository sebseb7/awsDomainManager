import React, { useEffect, useState } from 'react';
import { Check, Copy, Eye, Globe, Mail, Plus, RefreshCw, Trash2, UploadCloud, X } from 'lucide-react';
import { api } from '../api';
import type { AwsProfile, SesIdentity } from '../types';

interface Props {
  account: AwsProfile;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

export const SesView: React.FC<Props> = ({ account, onError, onSuccess }) => {
  const [identities, setIdentities] = useState<SesIdentity[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'DOMAIN' | 'EMAIL_ADDRESS'>('ALL');

  const [showCreate, setShowCreate] = useState(false);
  const [newIdentityName, setNewIdentityName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SesIdentity | null>(null);
  const [dkimModalTarget, setDkimModalTarget] = useState<SesIdentity | null>(null);
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
  }, [account.profile]);

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

  const handlePublishDkim = async (item: SesIdentity) => {
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
    if (status === '-') {
      return <span style={{ color: 'var(--text-muted)' }}>-</span>;
    }
    return <span className="badge">{status}</span>;
  };

  const domainCount = identities.filter((i) => i.identityType === 'DOMAIN').length;
  const emailCount = identities.filter((i) => i.identityType === 'EMAIL_ADDRESS').length;

  const filtered = identities.filter((item) => {
    if (typeFilter !== 'ALL' && item.identityType !== typeFilter) return false;
    return item.identityName.toLowerCase().includes(search.toLowerCase());
  });

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
            <table>
              <thead>
                <tr>
                  <th>Identity (Domain / Email)</th>
                  <th>Type</th>
                  <th>Verification</th>
                  <th>DKIM</th>
                  <th>Sending</th>
                  <th style={{ width: 250 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const isDomain = item.identityType === 'DOMAIN';
                  const hasTokens = (item.dkimTokens?.length || 0) > 0;
                  const alreadyPublished =
                    Boolean(item.dkimRecordsPublished) || item.dkimStatus === 'SUCCESS';
                  return (
                    <tr key={item.identityName}>
                      <td style={{ fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {isDomain ? (
                            <Globe size={14} color="var(--accent)" />
                          ) : (
                            <Mail size={14} color="var(--blue)" />
                          )}
                          <span className="mono">{item.identityName}</span>
                          {item.matchedZoneName && (
                            <span
                              className={`badge ${alreadyPublished ? 'badge-green' : 'badge-blue'}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              title={
                                alreadyPublished
                                  ? `DKIM CNAME records published in Route53 zone ${item.matchedZoneName} (${item.matchedZoneProfile || account.profile})`
                                  : `Managed in Route53 zone ${item.matchedZoneName} (${item.matchedZoneProfile || account.profile})`
                              }
                            >
                              {alreadyPublished && <Check size={11} />}
                              {alreadyPublished ? 'R53 Published' : 'Route53'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${isDomain ? 'badge-type' : 'badge-blue'}`}>
                          {item.typeLabel}
                        </span>
                      </td>
                      <td>{renderStatusBadge(item.verificationStatus)}</td>
                      <td>{renderStatusBadge(item.dkimStatus)}</td>
                      <td>
                        {item.sendingEnabled ? (
                          <span style={{ color: 'var(--green)', fontWeight: 500 }}>Enabled</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Disabled</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {isDomain && hasTokens && (
                            <button
                              className="btn btn-sm"
                              title="View Easy DKIM CNAME Records"
                              onClick={() => setDkimModalTarget(item)}
                            >
                              <Eye size={13} /> DNS
                            </button>
                          )}
                          {isDomain && !alreadyPublished && (hasTokens || item.matchedZoneId) && (
                            <button
                              className="btn btn-primary btn-sm"
                              title={
                                item.matchedZoneName
                                  ? `Publish 3 Easy DKIM CNAME records to Route53 zone ${item.matchedZoneName}`
                                  : 'Publish Easy DKIM CNAME records to Route53'
                              }
                              onClick={() => handlePublishDkim(item)}
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
                If you add a domain that matches a Route53 hosted zone in your configured AWS
                accounts, its 3 Easy DKIM <code className="mono">CNAME</code> records will be
                published to Route53 automatically.
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

      {dkimModalTarget && (
        <div className="modal-backdrop">
          <div className="modal modal-xl">
            <div className="modal-header">
              <h3>
                Easy DKIM DNS Records — <span className="mono">{dkimModalTarget.identityName}</span>
              </h3>
              <button className="btn btn-sm" onClick={() => setDkimModalTarget(null)}>
                <X size={14} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Publish these 3 <code className="mono">CNAME</code> records to verify Easy DKIM for{' '}
                <strong style={{ color: 'var(--text)' }}>{dkimModalTarget.identityName}</strong>
                {dkimModalTarget.matchedZoneName
                  ? ` (detected in Route53 zone ${dkimModalTarget.matchedZoneName} on profile "${dkimModalTarget.matchedZoneProfile}"):`
                  : ':'}
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 70 }}>Type</th>
                      <th>Name</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dkimModalTarget.dkimTokens || []).map((token) => {
                      const cleanDom = dkimModalTarget.identityName.replace(/\.$/, '');
                      const recName = `${token}._domainkey.${cleanDom}`;
                      const recVal = `${token}.dkim.amazonses.com`;
                      return (
                        <tr key={token}>
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
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setDkimModalTarget(null)}>
                Close
              </button>
              {!dkimModalTarget.dkimRecordsPublished &&
                dkimModalTarget.dkimStatus !== 'SUCCESS' && (
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      const target = dkimModalTarget;
                      setDkimModalTarget(null);
                      await handlePublishDkim(target);
                    }}
                    disabled={loading}
                  >
                    <UploadCloud size={14} /> Publish CNAME Records to Route53
                  </button>
                )}
            </div>
          </div>
        </div>
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
