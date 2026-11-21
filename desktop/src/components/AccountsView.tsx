import React, { useState } from 'react';
import { Edit2, KeyRound, Plus, Trash2 } from 'lucide-react';
import { api, maskSecret } from '../api';
import type { AccountInput, AwsProfile } from '../types';

interface Props {
  profiles: AwsProfile[];
  onProfilesChanged: (profiles: AwsProfile[]) => void;
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
  onProfilesChanged,
  onError,
  onSuccess,
}) => {
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [editingOriginal, setEditingOriginal] = useState<string>('');
  const [form, setForm] = useState<AccountInput>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<AwsProfile | null>(null);
  const [saving, setSaving] = useState(false);

  const openAdd = () => {
    setFormMode('add');
    setEditingOriginal('');
    setForm(EMPTY_FORM);
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated =
        formMode === 'edit'
          ? await api.updateProfile(editingOriginal, form)
          : await api.addProfile(form);
      onProfilesChanged(updated);
      onSuccess(
        formMode === 'edit'
          ? `Updated profile "${form.profile}".`
          : `Added profile "${form.profile}".`
      );
      setFormMode(null);
    } catch (err) {
      onError(String(err));
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
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Stored in <code className="mono">~/.aws/credentials</code> and{' '}
          <code className="mono">~/.aws/config</code>
        </span>
        <button className="btn btn-primary" onClick={openAdd}>
          <Plus size={14} /> Add AWS Account
        </button>
      </div>

      <div className="card">
        {profiles.length === 0 ? (
          <div className="empty-state">
            <h3>No AWS profiles configured</h3>
            <p>Click "Add AWS Account" to add your first profile.</p>
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

      {formMode && (
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
                {formMode === 'edit' ? 'Save Changes' : 'Add Account'}
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
                Remove profile <strong>{deleteTarget.profile}</strong> from{' '}
                <code className="mono">~/.aws/credentials</code> and{' '}
                <code className="mono">~/.aws/config</code>?
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
