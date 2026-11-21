import React, { useEffect, useState } from 'react';
import { Globe, Mail, Plus, RefreshCw, Trash2 } from 'lucide-react';
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
      const created = await api.createSesIdentity(account.profile, newIdentityName);
      setShowCreate(false);
      setNewIdentityName('');
      onSuccess(`Created SES identity "${created}".`);
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
                  <th style={{ width: 90 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const isDomain = item.identityType === 'DOMAIN';
                  return (
                    <tr key={item.identityName}>
                      <td style={{ fontWeight: 600 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          {isDomain ? (
                            <Globe size={14} color="var(--accent)" />
                          ) : (
                            <Mail size={14} color="var(--blue)" />
                          )}
                          <span className="mono">{item.identityName}</span>
                        </span>
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
                        <button
                          className="btn btn-danger btn-sm"
                          title="Delete Identity"
                          onClick={() => setDeleteTarget(item)}
                        >
                          <Trash2 size={13} />
                        </button>
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
