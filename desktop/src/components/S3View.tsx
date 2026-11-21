import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Database,
  Download,
  File as FileIcon,
  Folder,
  KeyRound,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { api, formatBytes, formatDate } from '../api';
import type { AwsProfile, CreatedIamUser, S3Bucket, S3Object } from '../types';
import { QrCredentialsModal } from './QrCredentialsModal';
import { BucketKeysModal } from './BucketKeysModal';

interface Props {
  account: AwsProfile;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

const IAM_OPTIONS = [
  { id: 'none', label: 'None (no separate IAM user)' },
  { id: 'put-only', label: 'Put Only (upload only, no read/delete)' },
  { id: 'read-only', label: 'Read Only (list & read only, no put/delete)' },
  { id: 'both', label: 'Both (separate Put-Only & Read-Only users)' },
];

export const S3View: React.FC<Props> = ({ account, onError, onSuccess }) => {
  const [buckets, setBuckets] = useState<S3Bucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [prefix, setPrefix] = useState('');
  const [objects, setObjects] = useState<S3Object[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [bucketName, setBucketName] = useState('');
  const [bucketRegion, setBucketRegion] = useState(account.region || 'us-east-1');
  const [iamAccess, setIamAccess] = useState('none');
  const [iamUserName, setIamUserName] = useState('');

  const [createdResult, setCreatedResult] = useState<{
    bucketName: string;
    region: string;
    users: CreatedIamUser[];
    isScopedIamUsers: boolean;
  } | null>(null);

  const [deleteBucketTarget, setDeleteBucketTarget] = useState<string | null>(null);
  const [deleteObjTarget, setDeleteObjTarget] = useState<S3Object | null>(null);
  const [keysBucketTarget, setKeysBucketTarget] = useState<string | null>(null);

  const loadBuckets = async () => {
    setLoading(true);
    try {
      const data = await api.listBuckets(account.profile);
      setBuckets(data);
    } catch (e) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const loadObjects = async (bucket: string, nextPrefix: string) => {
    setLoading(true);
    try {
      const data = await api.listBucketObjects(account.profile, bucket, nextPrefix);
      setObjects(data);
    } catch (e) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedBucket(null);
    setPrefix('');
    setObjects([]);
    setSearch('');
    setBucketRegion(account.region || 'us-east-1');
    loadBuckets();
  }, [account.profile]);

  const handleOpenBucket = (name: string) => {
    setSelectedBucket(name);
    setPrefix('');
    setSearch('');
    loadObjects(name, '');
  };

  const handleNavigatePrefix = (nextPrefix: string) => {
    if (!selectedBucket) return;
    setPrefix(nextPrefix);
    loadObjects(selectedBucket, nextPrefix);
  };

  const handleCreateBucket = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const targetRegion = bucketRegion.trim() || account.region || 'us-east-1';
      const createdName = await api.createBucket(account.profile, bucketName, targetRegion);

      let users: CreatedIamUser[] = [];
      let isScoped = false;

      if (iamAccess !== 'none') {
        users = await api.createBucketIamUsers(
          account.profile,
          createdName,
          iamAccess,
          iamUserName
        );
        isScoped = true;
      } else {
        users = [
          {
            bucketName: createdName,
            userName: account.profile,
            role: '',
            roleLabel: 'Account profile credentials',
            accessKeyId: account.accessKeyId,
            secretAccessKey: account.secretAccessKey,
          },
        ];
      }

      setShowCreate(false);
      setBucketName('');
      setIamAccess('none');
      setIamUserName('');
      setCreatedResult({
        bucketName: createdName,
        region: targetRegion,
        users,
        isScopedIamUsers: isScoped,
      });
      await loadBuckets();
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBucket = async () => {
    if (!deleteBucketTarget) return;
    setLoading(true);
    try {
      await api.deleteBucket(account.profile, deleteBucketTarget);
      onSuccess(`Deleted bucket "${deleteBucketTarget}".`);
      setDeleteBucketTarget(null);
      await loadBuckets();
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedBucket) return;
    const localPath = await api.pickUploadFile();
    if (!localPath) return;
    setLoading(true);
    try {
      const uploadedKey = await api.uploadObject(account.profile, selectedBucket, localPath, prefix);
      onSuccess(`Uploaded "${uploadedKey}".`);
      await loadObjects(selectedBucket, prefix);
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (obj: S3Object) => {
    if (!selectedBucket) return;
    const defaultName = obj.displayName.replace(/\/$/, '') || 'download';
    const dest = await api.pickDownloadPath(defaultName);
    if (!dest) return;
    setLoading(true);
    try {
      const savedPath = await api.downloadObject(account.profile, selectedBucket, obj.key, dest);
      onSuccess(`Downloaded to ${savedPath}.`);
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteObject = async () => {
    if (!selectedBucket || !deleteObjTarget) return;
    setLoading(true);
    try {
      await api.deleteObject(account.profile, selectedBucket, deleteObjTarget.key);
      onSuccess(`Deleted "${deleteObjTarget.key}".`);
      setDeleteObjTarget(null);
      await loadObjects(selectedBucket, prefix);
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const breadcrumbParts = prefix ? prefix.split('/').filter(Boolean) : [];

  if (!selectedBucket) {
    const filteredBuckets = buckets.filter((b) =>
      b.name.toLowerCase().includes(search.toLowerCase())
    );
    return (
      <div>
        <div className="toolbar">
          <input
            className="search-input"
            placeholder="Filter S3 buckets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="toolbar-group">
            <button className="btn" onClick={loadBuckets} disabled={loading}>
              <RefreshCw size={14} /> Refresh
            </button>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Create Bucket
            </button>
          </div>
        </div>

        <div className="card">
          {loading && buckets.length === 0 ? (
            <div className="empty-state">Loading S3 buckets...</div>
          ) : filteredBuckets.length === 0 ? (
            <div className="empty-state">
              <h3>No S3 buckets found</h3>
              <p>Create a new bucket with optional scoped Put-Only / Read-Only IAM credentials.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Bucket Name</th>
                    <th>Created</th>
                    <th style={{ width: 145 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBuckets.map((b) => (
                    <tr
                      key={b.name}
                      className="clickable-row"
                      onClick={() => handleOpenBucket(b.name)}
                    >
                      <td style={{ fontWeight: 600 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <Database size={14} color="var(--accent)" />
                          {b.name}
                        </span>
                      </td>
                      <td className="mono" style={{ color: 'var(--text-muted)' }}>
                        {formatDate(b.creationDate)}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-sm"
                            title="Manage IAM Keys"
                            onClick={() => setKeysBucketTarget(b.name)}
                          >
                            <KeyRound size={13} /> Keys
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            title="Delete Bucket"
                            onClick={() => setDeleteBucketTarget(b.name)}
                          >
                            <Trash2 size={13} />
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

        {showCreate && (
          <div className="modal-backdrop">
            <form className="modal" onSubmit={handleCreateBucket}>
              <div className="modal-header">
                <h3>Create S3 Bucket</h3>
              </div>
              <div className="modal-body">
                <div className="field">
                  <label>Bucket Name</label>
                  <input
                    placeholder="my-unique-bucket-name"
                    value={bucketName}
                    onChange={(e) => setBucketName(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label>Region</label>
                  <input
                    placeholder="us-east-1"
                    value={bucketRegion}
                    onChange={(e) => setBucketRegion(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Scoped IAM User (never granted delete)</label>
                  <select value={iamAccess} onChange={(e) => setIamAccess(e.target.value)}>
                    {IAM_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                {iamAccess !== 'none' && (
                  <div className="field">
                    <label>
                      {iamAccess === 'both' ? 'IAM Username Prefix' : 'IAM Username'} (optional)
                    </label>
                    <input
                      placeholder={
                        iamAccess === 'both'
                          ? `default: ${bucketName || 'bucket'}-put & -read`
                          : `default: ${bucketName || 'bucket'}-${iamAccess === 'put-only' ? 'put' : 'read'}`
                      }
                      value={iamUserName}
                      onChange={(e) => setIamUserName(e.target.value)}
                    />
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  Create Bucket
                </button>
              </div>
            </form>
          </div>
        )}

        {deleteBucketTarget && (
          <div className="modal-backdrop">
            <div className="modal">
              <div className="modal-header">
                <h3>Delete S3 Bucket</h3>
              </div>
              <div className="modal-body">
                <p>
                  Delete bucket <code className="mono">{deleteBucketTarget}</code>? The bucket must
                  be empty.
                </p>
              </div>
              <div className="modal-footer">
                <button className="btn" onClick={() => setDeleteBucketTarget(null)}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={handleDeleteBucket} disabled={loading}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {createdResult && (
          <QrCredentialsModal
            bucketName={createdResult.bucketName}
            region={createdResult.region}
            users={createdResult.users}
            isScopedIamUsers={createdResult.isScopedIamUsers}
            onClose={() => setCreatedResult(null)}
          />
        )}

        {keysBucketTarget && (
          <BucketKeysModal
            account={account}
            bucketName={keysBucketTarget}
            onClose={() => setKeysBucketTarget(null)}
            onError={onError}
            onSuccess={onSuccess}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-group">
          <button className="btn" onClick={() => setSelectedBucket(null)}>
            <ArrowLeft size={14} /> Buckets
          </button>
          <div className="breadcrumbs">
            <button className="crumb-btn" onClick={() => handleNavigatePrefix('')}>
              s3://{selectedBucket}
            </button>
            {breadcrumbParts.map((part, idx) => {
              const targetPrefix = breadcrumbParts.slice(0, idx + 1).join('/') + '/';
              return (
                <React.Fragment key={targetPrefix}>
                  <span>/</span>
                  <button
                    className="crumb-btn"
                    onClick={() => handleNavigatePrefix(targetPrefix)}
                  >
                    {part}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>
        <div className="toolbar-group">
          <button
            className="btn"
            onClick={() => setKeysBucketTarget(selectedBucket)}
            disabled={loading}
          >
            <KeyRound size={14} /> IAM Keys
          </button>
          <button
            className="btn"
            onClick={() => loadObjects(selectedBucket, prefix)}
            disabled={loading}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={handleUpload} disabled={loading}>
            <Upload size={14} /> Upload File
          </button>
        </div>
      </div>

      <div className="card">
        {loading && objects.length === 0 ? (
          <div className="empty-state">Loading objects...</div>
        ) : objects.length === 0 ? (
          <div className="empty-state">
            <h3>Empty folder</h3>
            <p>Upload a file to store it in this prefix.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Size</th>
                  <th>Last Modified</th>
                  <th style={{ width: 130 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {objects.map((obj) => (
                  <tr
                    key={obj.key}
                    className={obj.isFolder ? 'clickable-row' : undefined}
                    onClick={obj.isFolder ? () => handleNavigatePrefix(obj.key) : undefined}
                  >
                    <td style={{ fontWeight: obj.isFolder ? 600 : 400 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        {obj.isFolder ? (
                          <Folder size={14} color="var(--accent)" />
                        ) : (
                          <FileIcon size={14} color="var(--text-muted)" />
                        )}
                        <span className="mono">{obj.displayName}</span>
                      </span>
                    </td>
                    <td className="mono" style={{ color: 'var(--text-muted)' }}>
                      {obj.isFolder ? '<DIR>' : formatBytes(obj.size)}
                    </td>
                    <td className="mono" style={{ color: 'var(--text-muted)' }}>
                      {formatDate(obj.lastModified)}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {!obj.isFolder && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-sm"
                            title="Download"
                            onClick={() => handleDownload(obj)}
                          >
                            <Download size={13} />
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            title="Delete"
                            onClick={() => setDeleteObjTarget(obj)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteObjTarget && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Delete Object</h3>
            </div>
            <div className="modal-body">
              <p>
                Permanently delete <code className="mono">{deleteObjTarget.key}</code> from{' '}
                <strong>{selectedBucket}</strong>?
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setDeleteObjTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDeleteObject} disabled={loading}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {keysBucketTarget && (
        <BucketKeysModal
          account={account}
          bucketName={keysBucketTarget}
          onClose={() => setKeysBucketTarget(null)}
          onError={onError}
          onSuccess={onSuccess}
        />
      )}
    </div>
  );
};
