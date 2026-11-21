import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, X } from 'lucide-react';
import type { CreatedIamUser } from '../types';

interface Props {
  bucketName: string;
  region: string;
  users: CreatedIamUser[];
  isScopedIamUsers: boolean;
  title?: string;
  onClose: () => void;
}

export const QrCredentialsModal: React.FC<Props> = ({
  bucketName,
  region,
  users,
  isScopedIamUsers,
  title,
  onClose,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const activeUser = users[activeIndex] || users[0];

  const payload = activeUser
    ? JSON.stringify({
        bucket: bucketName,
        region,
        ...(activeUser.role ? { role: activeUser.role } : {}),
        accessKeyId: activeUser.accessKeyId,
        secretAccessKey: activeUser.secretAccessKey,
      })
    : '';

  useEffect(() => {
    if (!payload) return;
    QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 240,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [payload]);

  if (!activeUser) return null;

  const copyText = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1600);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide">
        <div className="modal-header">
          <h3>
            {title || `Bucket "${bucketName}" (${region}) Created`}
          </h3>
          <button className="btn btn-sm" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="modal-body">
          {isScopedIamUsers ? (
            <div className="banner banner-error" style={{ marginBottom: 0 }}>
              Save these credentials now — AWS will not display the Secret Access Key again.
            </div>
          ) : (
            <div className="banner banner-success" style={{ marginBottom: 0 }}>
              Using profile "{activeUser.userName}" credentials (no separate bucket IAM user created).
            </div>
          )}

          {users.length > 1 && (
            <div className="tab-bar">
              {users.map((u, idx) => (
                <button
                  key={u.userName}
                  className={`tab-btn ${idx === activeIndex ? 'active' : ''}`}
                  onClick={() => setActiveIndex(idx)}
                >
                  {u.userName} ({u.role})
                </button>
              ))}
            </div>
          )}

          <div className="cred-grid">
            <span className="cred-label">Bucket</span>
            <span className="cred-val">
              {bucketName} ({region})
            </span>
            <button
              className="btn btn-sm"
              onClick={() => copyText('bucket', bucketName)}
            >
              {copiedField === 'bucket' ? <Check size={13} /> : <Copy size={13} />}
            </button>

            {isScopedIamUsers && (
              <>
                <span className="cred-label">IAM User</span>
                <span className="cred-val">{activeUser.userName}</span>
                <button
                  className="btn btn-sm"
                  onClick={() => copyText('user', activeUser.userName)}
                >
                  {copiedField === 'user' ? <Check size={13} /> : <Copy size={13} />}
                </button>

                <span className="cred-label">Access Level</span>
                <span className="cred-val">{activeUser.roleLabel}</span>
                <span />
              </>
            )}

            <span className="cred-label">Access Key ID</span>
            <span className="cred-val">{activeUser.accessKeyId}</span>
            <button
              className="btn btn-sm"
              onClick={() => copyText('key', activeUser.accessKeyId)}
            >
              {copiedField === 'key' ? <Check size={13} /> : <Copy size={13} />}
            </button>

            <span className="cred-label">Secret Access Key</span>
            <span className="cred-val">{activeUser.secretAccessKey}</span>
            <button
              className="btn btn-sm"
              onClick={() => copyText('secret', activeUser.secretAccessKey)}
            >
              {copiedField === 'secret' ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>

          {qrDataUrl && (
            <div className="qr-box">
              <img src={qrDataUrl} alt="S3 Bucket Credentials QR Code" />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              QR payload format: Compact JSON (bucket, region
              {activeUser.role ? ', role' : ''}, accessKeyId, secretAccessKey)
            </span>
            <button
              className="btn btn-sm"
              onClick={() => copyText('json', payload)}
            >
              {copiedField === 'json' ? <Check size={13} /> : <Copy size={13} />}
              Copy JSON
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
