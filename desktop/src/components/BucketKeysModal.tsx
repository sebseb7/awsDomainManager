import React, { useEffect, useState } from 'react';
import { KeyRound, Plus, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react';
import { api, formatDate } from '../api';
import type { AwsProfile, BucketIamUser, CreatedIamUser } from '../types';
import { QrCredentialsModal } from './QrCredentialsModal';

interface Props {
  account: AwsProfile;
  bucketName: string;
  onClose: () => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

export const BucketKeysModal: React.FC<Props> = ({
  account,
  bucketName,
  onClose,
  onError,
  onSuccess,
}) => {
  const [users, setUsers] = useState<BucketIamUser[]>([]);
  const [bucketRegion, setBucketRegion] = useState<string>(account.region || 'us-east-1');
  const [loading, setLoading] = useState(false);

  const [writeCustomName, setWriteCustomName] = useState('');
  const [readCustomName, setReadCustomName] = useState('');
  const [showAddWrite, setShowAddWrite] = useState(false);
  const [showAddRead, setShowAddRead] = useState(false);

  const [confirmAction, setConfirmAction] = useState<{
    type: 'revoke' | 'recreate';
    user: BucketIamUser;
  } | null>(null);

  const [credentialModal, setCredentialModal] = useState<{
    title: string;
    user: CreatedIamUser;
  } | null>(null);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const [list, region] = await Promise.all([
        api.listBucketIamUsers(account.profile, bucketName),
        api.getBucketRegion(account.profile, bucketName),
      ]);
      setUsers(list);
      setBucketRegion(region || account.region || 'us-east-1');
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, [account.profile, bucketName]);

  const writeUsers = users.filter((u) => u.role === 'put-only');
  const readUsers = users.filter((u) => u.role === 'read-only');
  const hasWriteKey = writeUsers.length > 0;

  const handleCreateKey = async (role: 'put-only' | 'read-only', e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const customName = role === 'put-only' ? writeCustomName : readCustomName;
      const created = await api.createBucketIamUser(
        account.profile,
        bucketName,
        role,
        customName
      );
      if (role === 'put-only') {
        setWriteCustomName('');
        setShowAddWrite(false);
      } else {
        setReadCustomName('');
        setShowAddRead(false);
      }
      onSuccess(
        `Created ${role === 'put-only' ? 'write (put-only)' : 'read (read-only)'} IAM user "${created.userName}".`
      );
      setCredentialModal({
        title: `${role === 'put-only' ? 'Write' : 'Read'} Key Created — "${bucketName}" (${bucketRegion})`,
        user: created,
      });
      await loadKeys();
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, user } = confirmAction;
    setLoading(true);
    try {
      if (type === 'revoke') {
        await api.revokeBucketIamUser(account.profile, user.userName);
        onSuccess(`Revoked IAM user "${user.userName}".`);
        setConfirmAction(null);
        await loadKeys();
      } else {
        const recreated = await api.recreateBucketIamUser(
          account.profile,
          bucketName,
          user.userName,
          user.role
        );
        onSuccess(`Recreated access key for "${user.userName}".`);
        setConfirmAction(null);
        setCredentialModal({
          title: `Key Recreated — "${user.userName}" (${bucketName})`,
          user: recreated,
        });
        await loadKeys();
      }
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const renderCreatedDates = (u: BucketIamUser) => {
    if (u.accessKeys.length === 0) {
      return formatDate(u.createdAt);
    }
    return u.accessKeys.map((k) => (
      <div key={k.accessKeyId} className="mono" style={{ fontSize: 12 }}>
        {formatDate(k.createDate || u.createdAt)}
      </div>
    ));
  };

  const renderLastUsedDates = (u: BucketIamUser) => {
    if (u.accessKeys.length === 0) {
      return <span style={{ color: 'var(--text-muted)' }}>-</span>;
    }
    return u.accessKeys.map((k) => {
      const raw = k.lastUsedDate || u.lastUsedAt || 'Never';
      const isNever = raw === 'Never' || raw === '-';
      return (
        <div
          key={k.accessKeyId}
          className="mono"
          style={{ fontSize: 12, color: isNever ? 'var(--text-muted)' : 'var(--text)' }}
        >
          {isNever ? raw : formatDate(raw)}
        </div>
      );
    });
  };

  const renderKeyIds = (u: BucketIamUser) => {
    if (u.accessKeys.length === 0) {
      return <span style={{ color: 'var(--text-muted)' }}>No active keys</span>;
    }
    return u.accessKeys.map((k) => (
      <div key={k.accessKeyId} className="mono" style={{ fontSize: 12 }}>
        {k.accessKeyId}{' '}
        <span style={{ color: k.status === 'Active' ? 'var(--green)' : 'var(--text-muted)' }}>
          ({k.status})
        </span>
      </div>
    ));
  };

  return (
    <>
      <div className="modal-backdrop">
        <div className="modal modal-xl">
          <div className="modal-header">
            <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <KeyRound size={16} color="var(--accent)" />
              IAM Keys — <span className="mono">{bucketName}</span>
            </h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" onClick={loadKeys} disabled={loading}>
                <RefreshCw size={13} /> Refresh
              </button>
              <button className="btn btn-sm" onClick={onClose}>
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="modal-body">
            {/* Write Key Section (Max 1) */}
            <div className="keys-section">
              <div className="keys-section-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong>Write Key (Put-Only)</strong>
                  <span className="badge badge-type">{writeUsers.length} / 1</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Upload only (no read/delete) · max 1 per bucket
                  </span>
                </div>
                {!hasWriteKey && !showAddWrite && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowAddWrite(true)}
                    disabled={loading}
                  >
                    <Plus size={13} /> Create Write Key
                  </button>
                )}
              </div>

              {showAddWrite && !hasWriteKey && (
                <form
                  className="inline-key-form"
                  onSubmit={(e) => handleCreateKey('put-only', e)}
                >
                  <input
                    placeholder={`Custom IAM username (default: ${bucketName}-put)`}
                    value={writeCustomName}
                    onChange={(e) => setWriteCustomName(e.target.value)}
                  />
                  <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
                    Create
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      setShowAddWrite(false);
                      setWriteCustomName('');
                    }}
                  >
                    Cancel
                  </button>
                </form>
              )}

              {loading && users.length === 0 ? (
                <div className="keys-empty">Loading IAM keys...</div>
              ) : writeUsers.length === 0 ? (
                <div className="keys-empty">No write (put-only) IAM user configured for this bucket.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>IAM User</th>
                        <th>Access Key ID</th>
                        <th>Created</th>
                        <th>Last Used</th>
                        <th style={{ width: 190 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {writeUsers.map((u) => (
                        <tr key={u.userName}>
                          <td className="mono" style={{ fontWeight: 600 }}>
                            {u.userName}
                          </td>
                          <td>{renderKeyIds(u)}</td>
                          <td className="mono" style={{ color: 'var(--text-muted)' }}>
                            {renderCreatedDates(u)}
                          </td>
                          <td>{renderLastUsedDates(u)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                className="btn btn-sm"
                                onClick={() => setConfirmAction({ type: 'recreate', user: u })}
                                disabled={loading}
                                title="Revoke current key and issue a new key"
                              >
                                <RotateCcw size={13} /> Recreate
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => setConfirmAction({ type: 'revoke', user: u })}
                                disabled={loading}
                                title="Revoke key and delete IAM user"
                              >
                                <Trash2 size={13} /> Revoke
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Read Keys Section (Multiple Allowed) */}
            <div className="keys-section">
              <div className="keys-section-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong>Read Keys (Read-Only)</strong>
                  <span className="badge badge-blue">
                    {readUsers.length} {readUsers.length === 1 ? 'key' : 'keys'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    List &amp; get only (no put/delete) · multiple allowed
                  </span>
                </div>
                {!showAddRead && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowAddRead(true)}
                    disabled={loading}
                  >
                    <Plus size={13} /> Add Read Key
                  </button>
                )}
              </div>

              {showAddRead && (
                <form
                  className="inline-key-form"
                  onSubmit={(e) => handleCreateKey('read-only', e)}
                >
                  <input
                    placeholder={`Custom IAM username (default: ${bucketName}-read${readUsers.length > 0 ? `-${readUsers.length + 1}` : ''})`}
                    value={readCustomName}
                    onChange={(e) => setReadCustomName(e.target.value)}
                  />
                  <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
                    Create
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      setShowAddRead(false);
                      setReadCustomName('');
                    }}
                  >
                    Cancel
                  </button>
                </form>
              )}

              {loading && users.length === 0 ? (
                <div className="keys-empty">Loading IAM keys...</div>
              ) : readUsers.length === 0 ? (
                <div className="keys-empty">No read-only IAM users configured for this bucket.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>IAM User</th>
                        <th>Access Key ID</th>
                        <th>Created</th>
                        <th>Last Used</th>
                        <th style={{ width: 190 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {readUsers.map((u) => (
                        <tr key={u.userName}>
                          <td className="mono" style={{ fontWeight: 600 }}>
                            {u.userName}
                          </td>
                          <td>{renderKeyIds(u)}</td>
                          <td className="mono" style={{ color: 'var(--text-muted)' }}>
                            {renderCreatedDates(u)}
                          </td>
                          <td>{renderLastUsedDates(u)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                className="btn btn-sm"
                                onClick={() => setConfirmAction({ type: 'recreate', user: u })}
                                disabled={loading}
                                title="Revoke current key and issue a new key"
                              >
                                <RotateCcw size={13} /> Recreate
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => setConfirmAction({ type: 'revoke', user: u })}
                                disabled={loading}
                                title="Revoke key and delete IAM user"
                              >
                                <Trash2 size={13} /> Revoke
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>

      {confirmAction && (
        <div className="modal-backdrop" style={{ zIndex: 110 }}>
          <div className="modal">
            <div className="modal-header">
              <h3>
                {confirmAction.type === 'revoke'
                  ? 'Revoke & Delete IAM User'
                  : 'Recreate Access Key'}
              </h3>
            </div>
            <div className="modal-body">
              {confirmAction.type === 'revoke' ? (
                <p>
                  Permanently revoke all access keys and delete IAM user{' '}
                  <code className="mono">{confirmAction.user.userName}</code> (
                  {confirmAction.user.role})? Any clients using this key will immediately lose
                  access.
                </p>
              ) : (
                <p>
                  Revoke the current access key(s) for{' '}
                  <code className="mono">{confirmAction.user.userName}</code> (
                  {confirmAction.user.role}) and generate a brand-new key? Existing clients using
                  the old key will immediately lose access.
                </p>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn"
                onClick={() => setConfirmAction(null)}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                className={confirmAction.type === 'revoke' ? 'btn btn-danger' : 'btn btn-primary'}
                onClick={handleConfirmAction}
                disabled={loading}
              >
                {confirmAction.type === 'revoke' ? 'Revoke & Delete' : 'Recreate Key'}
              </button>
            </div>
          </div>
        </div>
      )}

      {credentialModal && (
        <div style={{ position: 'relative', zIndex: 120 }}>
          <QrCredentialsModal
            bucketName={bucketName}
            region={bucketRegion}
            users={[credentialModal.user]}
            isScopedIamUsers={true}
            title={credentialModal.title}
            onClose={() => setCredentialModal(null)}
          />
        </div>
      )}
    </>
  );
};
