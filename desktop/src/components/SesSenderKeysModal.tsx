import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { api, formatDate } from '../api';
import type { AwsProfile, CreatedSesSenderKey, SesSenderKeyUser } from '../types';

interface Props {
  account: AwsProfile;
  identityName: string;
  onClose: () => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

export const SesSenderKeysModal: React.FC<Props> = ({
  account,
  identityName,
  onClose,
  onError,
  onSuccess,
}) => {
  const defaultRegion = account.region || 'us-east-1';
  const defaultSmtpHost = `email-smtp.${defaultRegion}.amazonaws.com`;

  const [activeTab, setActiveTab] = useState<'keys' | 'tester'>('keys');
  const [users, setUsers] = useState<SesSenderKeyUser[]>([]);
  const [loading, setLoading] = useState(false);

  const [showAddKey, setShowAddKey] = useState(false);
  const [customUserName, setCustomUserName] = useState('');

  const [confirmAction, setConfirmAction] = useState<{
    type: 'revoke' | 'recreate';
    user: SesSenderKeyUser;
  } | null>(null);

  const [createdKeyModal, setCreatedKeyModal] = useState<{
    title: string;
    cred: CreatedSesSenderKey;
  } | null>(null);
  const [qrBackupReceiver, setQrBackupReceiver] = useState(identityName);
  const [qrReconciliationReceiver, setQrReconciliationReceiver] = useState(identityName);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const smtpQrPayloadObj = useMemo(() => {
    if (!createdKeyModal) return null;
    const c = createdKeyModal.cred;
    return {
      pos420settings: 1,
      smtphost: c.smtpHost,
      smtpport: String(c.smtpPort || 587),
      smtpuser: c.smtpUsername,
      smtppassword: c.smtpPassword,
      emailsender: c.identityName,
      backupemailreceiver: qrBackupReceiver.trim() || c.identityName,
      reconciliationemailreceiver: qrReconciliationReceiver.trim() || c.identityName,
    };
  }, [createdKeyModal, qrBackupReceiver, qrReconciliationReceiver]);

  const smtpQrPayloadCompact = useMemo(
    () => (smtpQrPayloadObj ? JSON.stringify(smtpQrPayloadObj) : ''),
    [smtpQrPayloadObj]
  );

  useEffect(() => {
    if (!smtpQrPayloadCompact) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(smtpQrPayloadCompact, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 240,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [smtpQrPayloadCompact]);

  // Remember SMTP passwords created/recreated in this session (in-memory only)
  const [sessionPasswords, setSessionPasswords] = useState<Record<string, string>>({});

  // Integrated SMTP Send Tester state
  const [smtpHost, setSmtpHost] = useState(defaultSmtpHost);
  const [smtpPort, setSmtpPort] = useState<number>(587);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [toEmail, setToEmail] = useState(identityName);
  const [subject, setSubject] = useState(`AWS SES SMTP Test — ${identityName}`);
  const [body, setBody] = useState(
    `Hello,\n\nThis is a test email sent from ${identityName} via Amazon SES SMTP (${defaultSmtpHost}:587).`
  );
  const [testingSend, setTestingSend] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const list = await api.listSesSenderKeys(account.profile, identityName);
      setUsers(list);
      // Pre-fill SMTP username if empty and at least one key exists
      if (!smtpUsername && list.length > 0 && list[0].accessKeys.length > 0) {
        const firstKeyId = list[0].accessKeys[0].accessKeyId;
        setSmtpHost(list[0].smtpHost || defaultSmtpHost);
        setSmtpUsername(firstKeyId);
        if (sessionPasswords[firstKeyId]) {
          setSmtpPassword(sessionPasswords[firstKeyId]);
        }
      }
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, [account.profile, identityName]);

  const copyText = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1600);
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const created = await api.createSesSenderKey(
        account.profile,
        identityName,
        customUserName
      );
      setCustomUserName('');
      setShowAddKey(false);
      setSessionPasswords((prev) => ({
        ...prev,
        [created.smtpUsername]: created.smtpPassword,
      }));
      setSmtpHost(created.smtpHost);
      setSmtpPort(created.smtpPort || 587);
      setSmtpUsername(created.smtpUsername);
      setSmtpPassword(created.smtpPassword);
      onSuccess(
        `Created SES SMTP sender key "${created.userName}" (AmazonSesSendingAccess) for "${identityName}".`
      );
      setQrBackupReceiver(created.identityName);
      setQrReconciliationReceiver(created.identityName);
      setCreatedKeyModal({
        title: `SMTP Sender Key Created — ${identityName}`,
        cred: created,
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
        await api.revokeSesSenderKey(account.profile, user.userName);
        onSuccess(`Revoked SES SMTP sender IAM user "${user.userName}".`);
        setConfirmAction(null);
        await loadKeys();
      } else {
        const recreated = await api.recreateSesSenderKey(
          account.profile,
          identityName,
          user.userName
        );
        setSessionPasswords((prev) => ({
          ...prev,
          [recreated.smtpUsername]: recreated.smtpPassword,
        }));
        setSmtpHost(recreated.smtpHost);
        setSmtpPort(recreated.smtpPort || 587);
        setSmtpUsername(recreated.smtpUsername);
        setSmtpPassword(recreated.smtpPassword);
        onSuccess(`Recreated SMTP credentials for "${user.userName}".`);
        setConfirmAction(null);
        setQrBackupReceiver(recreated.identityName);
        setQrReconciliationReceiver(recreated.identityName);
        setCreatedKeyModal({
          title: `SMTP Sender Key Recreated — ${user.userName}`,
          cred: recreated,
        });
        await loadKeys();
      }
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const openTesterForUser = (user: SesSenderKeyUser) => {
    const keyId = user.accessKeys[0]?.accessKeyId || '';
    setSmtpHost(user.smtpHost || defaultSmtpHost);
    setSmtpPort(user.smtpPort || 587);
    if (keyId) {
      setSmtpUsername(keyId);
      setSmtpPassword(sessionPasswords[keyId] || '');
    }
    setTestResult(null);
    setActiveTab('tester');
  };

  const openTesterForCreatedCred = (cred: CreatedSesSenderKey) => {
    setSmtpHost(cred.smtpHost);
    setSmtpPort(cred.smtpPort || 587);
    setSmtpUsername(cred.smtpUsername);
    setSmtpPassword(cred.smtpPassword);
    setCreatedKeyModal(null);
    setTestResult(null);
    setActiveTab('tester');
  };

  const handleTestSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestingSend(true);
    setTestResult(null);
    try {
      const msg = await api.testSesSmtpSend({
        smtpHost,
        smtpPort,
        smtpUsername,
        smtpPassword,
        fromEmail: identityName,
        toEmail,
        subject,
        body,
      });
      setTestResult({ ok: true, message: msg });
      onSuccess(msg);
    } catch (err) {
      setTestResult({ ok: false, message: String(err) });
    } finally {
      setTestingSend(false);
    }
  };

  const renderKeyIds = (u: SesSenderKeyUser) => {
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
              SMTP Sender Keys — <span className="mono">{identityName}</span>
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div className="tab-bar">
                <button
                  className={`tab-btn ${activeTab === 'keys' ? 'active' : ''}`}
                  onClick={() => setActiveTab('keys')}
                >
                  Sender Keys ({users.length})
                </button>
                <button
                  className={`tab-btn ${activeTab === 'tester' ? 'active' : ''}`}
                  onClick={() => setActiveTab('tester')}
                >
                  SMTP Send Tester
                </button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Endpoint:{' '}
                <code className="mono" style={{ color: 'var(--blue)' }}>
                  {defaultSmtpHost}:587
                </code>{' '}
                (STARTTLS)
              </div>
            </div>

            {activeTab === 'keys' ? (
              <div className="keys-section">
                <div className="keys-section-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong>IAM SMTP Sender Users</strong>
                    <span className="badge badge-blue">AmazonSesSendingAccess</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Scoped to <code className="mono">{identityName}</code> · multiple allowed
                    </span>
                  </div>
                  {!showAddKey && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => setShowAddKey(true)}
                      disabled={loading}
                    >
                      <Plus size={13} /> Add Sender Key
                    </button>
                  )}
                </div>

                {showAddKey && (
                  <form className="inline-key-form" onSubmit={handleCreateKey}>
                    <input
                      placeholder={`Custom IAM username (optional, e.g. ses-${identityName.split('@')[0]}-app)`}
                      value={customUserName}
                      onChange={(e) => setCustomUserName(e.target.value)}
                    />
                    <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
                      Create Key
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        setShowAddKey(false);
                        setCustomUserName('');
                      }}
                    >
                      Cancel
                    </button>
                  </form>
                )}

                {loading && users.length === 0 ? (
                  <div className="keys-empty">Loading SES SMTP sender keys...</div>
                ) : users.length === 0 ? (
                  <div className="keys-empty">
                    No SMTP sender IAM users configured for{' '}
                    <code className="mono">{identityName}</code> yet. Click{' '}
                    <strong>Add Sender Key</strong> to create one with{' '}
                    <code className="mono">AmazonSesSendingAccess</code>.
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table className="ses-table">
                      <thead>
                        <tr>
                          <th>IAM User</th>
                          <th>SMTP Username (Access Key ID)</th>
                          <th>Created</th>
                          <th>Last Used</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr key={u.userName}>
                            <td className="mono" style={{ fontWeight: 600 }}>
                              {u.userName}
                            </td>
                            <td>{renderKeyIds(u)}</td>
                            <td className="mono" style={{ color: 'var(--text-muted)' }}>
                              {formatDate(u.accessKeys[0]?.createDate || u.createdAt)}
                            </td>
                            <td className="mono" style={{ color: 'var(--text-muted)' }}>
                              {u.accessKeys[0]?.lastUsedDate &&
                              u.accessKeys[0].lastUsedDate !== 'Never' &&
                              u.accessKeys[0].lastUsedDate !== '-'
                                ? formatDate(u.accessKeys[0].lastUsedDate)
                                : u.lastUsedAt || 'Never'}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                                <button
                                  className="btn btn-sm"
                                  style={{
                                    borderColor: 'rgba(56, 189, 248, 0.4)',
                                    color: 'var(--blue)',
                                    background: 'rgba(56, 189, 248, 0.12)',
                                  }}
                                  onClick={() => openTesterForUser(u)}
                                  disabled={loading}
                                  title="Open SMTP Send Tester with this sender key"
                                >
                                  <Send size={12} /> Test
                                </button>
                                <button
                                  className="btn btn-sm"
                                  onClick={() => setConfirmAction({ type: 'recreate', user: u })}
                                  disabled={loading}
                                  title="Rotate access key and derive a new SMTP password"
                                >
                                  <RotateCcw size={12} /> Recreate
                                </button>
                                <button
                                  className="btn btn-danger btn-sm"
                                  onClick={() => setConfirmAction({ type: 'revoke', user: u })}
                                  disabled={loading}
                                  title="Revoke key and delete IAM user"
                                >
                                  <Trash2 size={12} /> Revoke
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
            ) : (
              <form
                onSubmit={handleTestSend}
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                {testResult && (
                  <div
                    className={`banner ${testResult.ok ? 'banner-success' : 'banner-error'}`}
                    style={{ marginBottom: 0 }}
                  >
                    <span>{testResult.message}</span>
                  </div>
                )}

                {users.length > 0 && (
                  <div className="field">
                    <label>Select Sender Key (pre-fills SMTP Username)</label>
                    <select
                      value={smtpUsername}
                      onChange={(e) => {
                        const keyId = e.target.value;
                        setSmtpUsername(keyId);
                        const match = users.find((u) =>
                          u.accessKeys.some((k) => k.accessKeyId === keyId)
                        );
                        if (match) {
                          setSmtpHost(match.smtpHost || defaultSmtpHost);
                        }
                        if (sessionPasswords[keyId]) {
                          setSmtpPassword(sessionPasswords[keyId]);
                        }
                      }}
                    >
                      <option value="">-- Enter SMTP credentials manually --</option>
                      {users.flatMap((u) =>
                        u.accessKeys.map((k) => (
                          <option key={k.accessKeyId} value={k.accessKeyId}>
                            {u.userName} ({k.accessKeyId})
                            {sessionPasswords[k.accessKeyId] ? ' — password cached in session' : ''}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}

                <div className="field-row">
                  <div className="field">
                    <label>SMTP Host</label>
                    <input
                      className="mono"
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      required
                    />
                  </div>
                  <div className="field">
                    <label>SMTP Port &amp; Security</label>
                    <select
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(Number(e.target.value))}
                    >
                      <option value={587}>587 (STARTTLS — Recommended)</option>
                      <option value={465}>465 (SMTPS / Implicit TLS)</option>
                      <option value={2587}>2587 (STARTTLS Alternate)</option>
                    </select>
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label>SMTP Username (IAM Access Key ID)</label>
                    <input
                      className="mono"
                      placeholder="AKIA..."
                      value={smtpUsername}
                      onChange={(e) => setSmtpUsername(e.target.value)}
                      required
                    />
                  </div>
                  <div className="field">
                    <label>SMTP Password (SigV4-derived)</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        className="mono"
                        style={{ flex: 1 }}
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Paste SMTP password (auto-filled for newly created keys)"
                        value={smtpPassword}
                        onChange={(e) => setSmtpPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setShowPassword((prev) => !prev)}
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label>From</label>
                    <input className="mono" value={identityName} disabled />
                  </div>
                  <div className="field">
                    <label>To (Recipient Email)</label>
                    <input
                      className="mono"
                      type="email"
                      placeholder="recipient@example.com"
                      value={toEmail}
                      onChange={(e) => setToEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="field">
                  <label>Subject</label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label>Message Body</label>
                  <textarea
                    rows={4}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={testingSend}
                  >
                    <Send size={14} /> {testingSend ? 'Sending via SMTP...' : 'Send Test Email'}
                  </button>
                </div>
              </form>
            )}
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
                  ? 'Revoke & Delete SMTP Sender User'
                  : 'Recreate SMTP Credentials'}
              </h3>
            </div>
            <div className="modal-body">
              {confirmAction.type === 'revoke' ? (
                <p>
                  Permanently revoke all access keys and delete IAM user{' '}
                  <code className="mono">{confirmAction.user.userName}</code>? Any mail client
                  using these SMTP credentials will immediately fail authentication.
                </p>
              ) : (
                <p>
                  Revoke current access key(s) for{' '}
                  <code className="mono">{confirmAction.user.userName}</code> and derive a
                  brand-new SMTP username &amp; password? Existing clients using the old password
                  will stop working immediately.
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

      {createdKeyModal && (
        <div className="modal-backdrop" style={{ zIndex: 120 }}>
          <div className="modal modal-wide">
            <div className="modal-header">
              <h3>{createdKeyModal.title}</h3>
              <button className="btn btn-sm" onClick={() => setCreatedKeyModal(null)}>
                <X size={14} />
              </button>
            </div>
            <div className="modal-body">
              <div className="banner banner-error" style={{ marginBottom: 0 }}>
                Save these SMTP credentials now — AWS will not show the SMTP password again.
              </div>

              <div className="cred-grid">
                <span className="cred-label">From Identity</span>
                <span className="cred-val">{createdKeyModal.cred.identityName}</span>
                <button
                  className="btn btn-sm"
                  onClick={() => copyText('from', createdKeyModal.cred.identityName)}
                >
                  {copiedField === 'from' ? <Check size={13} /> : <Copy size={13} />}
                </button>

                <span className="cred-label">IAM User</span>
                <span className="cred-val">
                  {createdKeyModal.cred.userName} (AmazonSesSendingAccess)
                </span>
                <button
                  className="btn btn-sm"
                  onClick={() => copyText('iam', createdKeyModal.cred.userName)}
                >
                  {copiedField === 'iam' ? <Check size={13} /> : <Copy size={13} />}
                </button>

                <span className="cred-label">SMTP Host</span>
                <span className="cred-val">{createdKeyModal.cred.smtpHost}</span>
                <button
                  className="btn btn-sm"
                  onClick={() => copyText('host', createdKeyModal.cred.smtpHost)}
                >
                  {copiedField === 'host' ? <Check size={13} /> : <Copy size={13} />}
                </button>

                <span className="cred-label">SMTP Port</span>
                <span className="cred-val">
                  {createdKeyModal.cred.smtpPort} (STARTTLS) / 465 (SMTPS)
                </span>
                <span />

                <span className="cred-label">SMTP Username</span>
                <span className="cred-val">{createdKeyModal.cred.smtpUsername}</span>
                <button
                  className="btn btn-sm"
                  onClick={() => copyText('user', createdKeyModal.cred.smtpUsername)}
                >
                  {copiedField === 'user' ? <Check size={13} /> : <Copy size={13} />}
                </button>

                <span className="cred-label">SMTP Password</span>
                <span className="cred-val">{createdKeyModal.cred.smtpPassword}</span>
                <button
                  className="btn btn-sm"
                  onClick={() => copyText('pass', createdKeyModal.cred.smtpPassword)}
                >
                  {copiedField === 'pass' ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>

              <div className="field-row">
                <div className="field">
                  <label>QR Backup Receiver</label>
                  <input
                    className="mono"
                    type="email"
                    value={qrBackupReceiver}
                    onChange={(e) => setQrBackupReceiver(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>QR Reconciliation Receiver</label>
                  <input
                    className="mono"
                    type="email"
                    value={qrReconciliationReceiver}
                    onChange={(e) => setQrReconciliationReceiver(e.target.value)}
                  />
                </div>
              </div>

              {qrDataUrl && (
                <div className="qr-box">
                  <img src={qrDataUrl} alt="SES SMTP Credentials QR Code" />
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  QR JSON (pos420settings): smtphost, smtpport, smtpuser, smtppassword,
                  emailsender, backupemailreceiver, reconciliationemailreceiver
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      const c = createdKeyModal.cred;
                      copyText(
                        'env',
                        `SMTP_HOST=${c.smtpHost}\nSMTP_PORT=${c.smtpPort}\nSMTP_USER=${c.smtpUsername}\nSMTP_PASS=${c.smtpPassword}\nSMTP_FROM=${c.identityName}`
                      );
                    }}
                  >
                    {copiedField === 'env' ? <Check size={13} /> : <Copy size={13} />} Copy .env
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      if (!smtpQrPayloadObj) return;
                      copyText('json', JSON.stringify(smtpQrPayloadObj, null, 2));
                    }}
                  >
                    {copiedField === 'json' ? <Check size={13} /> : <Copy size={13} />} Copy JSON
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn"
                onClick={() => openTesterForCreatedCred(createdKeyModal.cred)}
              >
                <Send size={14} /> Test SMTP Send
              </button>
              <button className="btn btn-primary" onClick={() => setCreatedKeyModal(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
