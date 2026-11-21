import React, { useState } from 'react';
import { Edit2, KeyRound, Lock, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { api, maskSecret } from '../api';
import type { AccountInput, AuthStatus, AwsProfile } from '../types';
import { IamPermissionsGuide } from './IamPermissionsGuide';

interface Props {
  profiles: AwsProfile[];
  authStatus: AuthStatus;
  onProfilesChanged: (profiles: AwsProfile[]) => void;
  onLockVault?: () => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

const EMPTY_FORM: AccountInput = {
  profile: '',
  region: 'us-east-1',
  accessKeyId: '',
  secretAccessKey: '',
  sessionToken: '',
};

export const AccountsView: React.FC<Props> = ({
  profiles,
  authStatus,
  onProfilesChanged,
  onLockVault,
  onError,
  onSuccess,
}) => {
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [editingOriginal, setEditingOriginal] = useState<string>('');
  const [form, setForm] = useState<AccountInput>(EMPTY_FORM);
  const [showPinSetupModal, setShowPinSetupModal] = useState<boolean>(false);
  const [setupPin, setSetupPin] = useState<string>('');
  const [setupPinConfirm, setSetupPinConfirm] = useState<string>('');
  const [pinSetupError, setPinSetupError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AwsProfile | null>(null);
  const [saving, setSaving] = useState(false);

  const openAdd = () => {
    setFormMode('add');
    setEditingOriginal('');
    setForm(EMPTY_FORM);
    setShowPinSetupModal(false);
    setSetupPin('');
    setSetupPinConfirm('');
    setPinSetupError(null);
  };

  const openEdit = (p: AwsProfile) => {
    setFormMode('edit');
    setEditingOriginal(p.profile);
    setForm({
      profile: p.profile,
      region: p.region,
      accessKeyId: p.accessKeyId,
      secretAccessKey: '',
      sessionToken: p.sessionToken,
    });
    setShowPinSetupModal(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // When creating the first account in the app (no PIN set yet), ask for a 6-digit PIN first
    if (formMode === 'add' && !authStatus.hasPin && profiles.length === 0) {
      setSetupPin('');
      setSetupPinConfirm('');
      setPinSetupError(null);
      setShowPinSetupModal(true);
      return;
    }

    setSaving(true);
    try {
      const updated =
        formMode === 'edit'
          ? await api.updateProfile(editingOriginal, form)
          : await api.addProfile(form);
      onProfilesChanged(updated);
      onSuccess(
        formMode === 'edit'
          ? `Updated profile "${form.profile}" in PIN-encrypted auth vault.`
          : `Added profile "${form.profile}" to PIN-encrypted auth vault.`
      );
      setFormMode(null);
    } catch (err) {
      onError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePinSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = setupPin.trim();
    const cleanConfirm = setupPinConfirm.trim();
    if (!/^\d{6}$/.test(cleanPin)) {
      setPinSetupError('PIN must be exactly 6 digits (0-9).');
      return;
    }
    if (cleanPin !== cleanConfirm) {
      setPinSetupError('6-digit PIN and confirmation PIN do not match.');
      return;
    }

    setSaving(true);
    setPinSetupError(null);
    try {
      const updated = await api.addProfile({
        ...form,
        pin: cleanPin,
      });
      onProfilesChanged(updated);
      onSuccess(
        `Created 6-digit PIN (salted hash) and encrypted profile "${form.profile}".`
      );
      setShowPinSetupModal(false);
      setFormMode(null);
      setSetupPin('');
      setSetupPinConfirm('');
    } catch (err) {
      setPinSetupError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const updated = await api.removeProfile(deleteTarget.profile);
      onProfilesChanged(updated);
      onSuccess(`Removed profile "${deleteTarget.profile}".`);
      setDeleteTarget(null);
    } catch (err) {
      onError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            <ShieldCheck size={15} color="var(--green)" />
            PIN-Encrypted Auth Vault (<code className="mono">{authStatus.vaultPath}</code>)
          </span>
          {authStatus.hasPin && (
            <span
              className="region-pill"
              style={{
                fontSize: 11.5,
                color: 'var(--green)',
                borderColor: 'rgba(52, 211, 153, 0.3)',
                background: 'rgba(52, 211, 153, 0.1)',
              }}
            >
              6-Digit PIN · Salted Hash ({authStatus.pinHashPreview || 'PBKDF2-SHA256'})
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {authStatus.hasPin && authStatus.unlocked && onLockVault && (
            <button className="btn" onClick={onLockVault}>
              <Lock size={14} /> Lock Vault
            </button>
          )}
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={14} /> Add AWS Account
          </button>
        </div>
      </div>

      <div className="card">
        {profiles.length === 0 ? (
          <div className="empty-state">
            <h3>No AWS profiles configured</h3>
            <p>
              Click "Add AWS Account" to create your first profile. You will be asked to set a
              6-digit PIN to encrypt all auth data with a salted PIN hash.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Profile</th>
                  <th>Region</th>
                  <th>Access Key ID</th>
                  <th>Secret Access Key</th>
                  <th style={{ width: 130 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.profile}>
                    <td style={{ fontWeight: 600 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <KeyRound size={14} color="var(--accent)" />
                        {p.profile}
                      </span>
                    </td>
                    <td>
                      <span className="region-pill">{p.region}</span>
                    </td>
                    <td className="mono">{maskSecret(p.accessKeyId)}</td>
                    <td className="mono" style={{ color: 'var(--text-muted)' }}>
                      {p.secretAccessKey ? '••••••••••••••••' : '(not set)'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm" onClick={() => openEdit(p)}>
                          <Edit2 size={13} />
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setDeleteTarget(p)}
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

      <div style={{ marginTop: 18 }}>
        <IamPermissionsGuide defaultExpanded={profiles.length === 0} />
      </div>

      {formMode && !showPinSetupModal && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={handleSubmit}>
            <div className="modal-header">
              <h3>
                {formMode === 'edit' ? `Edit AWS Account (${editingOriginal})` : 'Add AWS Account'}
              </h3>
            </div>
            <div className="modal-body">
              <div className="field-row">
                <div className="field">
                  <label>Profile Name</label>
                  <input
                    placeholder="default, prod, dev"
                    value={form.profile}
                    onChange={(e) => setForm((p) => ({ ...p, profile: e.target.value }))}
                    required
                  />
                </div>
                <div className="field">
                  <label>Region</label>
                  <input
                    placeholder="us-east-1"
                    value={form.region}
                    onChange={(e) => setForm((p) => ({ ...p, region: e.target.value }))}
                  />
                </div>
              </div>
              <div className="field">
                <label>Access Key ID</label>
                <input
                  placeholder="AKIA..."
                  value={form.accessKeyId}
                  onChange={(e) => setForm((p) => ({ ...p, accessKeyId: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label>
                  Secret Access Key {formMode === 'edit' && '(leave blank to keep current)'}
                </label>
                <input
                  type="password"
                  placeholder={formMode === 'edit' ? 'Unchanged' : 'Required'}
                  value={form.secretAccessKey}
                  onChange={(e) => setForm((p) => ({ ...p, secretAccessKey: e.target.value }))}
                  required={formMode === 'add'}
                />
              </div>
              <div className="field">
                <label>Session Token (optional)</label>
                <input
                  type="password"
                  placeholder="Optional"
                  value={form.sessionToken}
                  onChange={(e) => setForm((p) => ({ ...p, sessionToken: e.target.value }))}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn" onClick={() => setFormMode(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {formMode === 'edit'
                  ? 'Save Changes'
                  : !authStatus.hasPin && profiles.length === 0
                    ? 'Next: Set 6-Digit PIN'
                    : 'Add Account'}
              </button>
            </div>
          </form>
        </div>
      )}

      {formMode === 'add' && showPinSetupModal && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={handlePinSetupSubmit} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Lock size={16} color="var(--accent)" /> Set 6-Digit Encryption PIN
              </h3>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
                Auth data is only stored encrypted with your 6-digit PIN. A random cryptographic
                salt will be hashed with your PIN so the app can verify your PIN on every launch.
              </p>

              {pinSetupError && (
                <div className="banner banner-error" style={{ marginBottom: 12 }}>
                  <span>{pinSetupError}</span>
                </div>
              )}

              <div className="field">
                <label htmlFor="setup-pin-input">Create 6-Digit PIN</label>
                <input
                  id="setup-pin-input"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  aria-label="Create 6-Digit PIN"
                  value={setupPin}
                  onChange={(e) => {
                    setSetupPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setPinSetupError(null);
                  }}
                  style={{
                    fontSize: 18,
                    letterSpacing: '0.35em',
                    textAlign: 'center',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  }}
                  autoFocus
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="confirm-pin-input">Confirm 6-Digit PIN</label>
                <input
                  id="confirm-pin-input"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  aria-label="Confirm 6-Digit PIN"
                  value={setupPinConfirm}
                  onChange={(e) => {
                    setSetupPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setPinSetupError(null);
                  }}
                  style={{
                    fontSize: 18,
                    letterSpacing: '0.35em',
                    textAlign: 'center',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  }}
                  required
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn"
                onClick={() => setShowPinSetupModal(false)}
                disabled={saving}
              >
                Back
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving || setupPin.length !== 6 || setupPinConfirm.length !== 6}
              >
                <Lock size={14} /> Encrypt & Save Account
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Remove AWS Profile</h3>
            </div>
            <div className="modal-body">
              <p>
                Remove profile <strong>{deleteTarget.profile}</strong> from the PIN-encrypted auth
                vault (<code className="mono">{authStatus.vaultPath}</code>)?
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={saving}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
