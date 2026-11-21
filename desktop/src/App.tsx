import React, { useEffect, useState } from 'react';
import { Cloud, Cpu, Database, Globe, KeyRound, Lock, Mail, Shield, Unlock, X } from 'lucide-react';
import { api } from './api';
import { AccountsView } from './components/AccountsView';
import { Ec2InstancesView } from './components/Ec2InstancesView';
import { Ec2View } from './components/Ec2View';
import { Route53View } from './components/Route53View';
import { S3View } from './components/S3View';
import { SesView } from './components/SesView';
import type { AuthStatus, AwsProfile, NavSection } from './types';

const NAV_ITEMS: { id: NavSection; label: string; icon: React.ReactNode }[] = [
  { id: 'route53', label: 'Route53 DNS', icon: <Globe size={16} /> },
  { id: 'ec2-instances', label: 'EC2 Instances & EIPs', icon: <Cpu size={16} /> },
  { id: 'ec2', label: 'EC2 Security Groups', icon: <Shield size={16} /> },
  { id: 's3', label: 'S3 Buckets', icon: <Database size={16} /> },
  { id: 'ses', label: 'Amazon SES', icon: <Mail size={16} /> },
  { id: 'accounts', label: 'AWS Accounts', icon: <KeyRound size={16} /> },
];

const TITLES: Record<NavSection, string> = {
  route53: 'Route53 Hosted Zones & DNS Records',
  'ec2-instances': 'EC2 Instances & Elastic IPs',
  ec2: 'EC2 Security Groups',
  s3: 'S3 Buckets & Objects',
  ses: 'Amazon SES Identities (Domains & Email Addresses)',
  accounts: 'AWS Credential Profiles',
};

const DEFAULT_AUTH_STATUS: AuthStatus = {
  hasPin: false,
  unlocked: true,
  vaultPath: '~/.aws-domain-manager/auth.enc.json',
  saltPreview: null,
  pinHashPreview: null,
};

const AWS_REGIONS = [
  'eu-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-north-1',
  'eu-south-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-south-1',
  'ca-central-1',
  'sa-east-1',
];

export function App() {
  const [section, setSection] = useState<NavSection>('route53');
  const [authStatus, setAuthStatus] = useState<AuthStatus>(DEFAULT_AUTH_STATUS);
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState<boolean>(false);
  const [profiles, setProfiles] = useState<AwsProfile[]>([]);
  const [selectedProfileName, setSelectedProfileName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const applyProfiles = (list: AwsProfile[]) => {
    setProfiles(list);
    if (list.length > 0) {
      setSelectedProfileName((prev) =>
        list.some((p) => p.profile === prev) ? prev : list[0].profile
      );
    } else {
      setSelectedProfileName('');
    }
  };

  const refreshAuthAndProfiles = async () => {
    try {
      const statusResp = await api.getAuthStatus();
      const status: AuthStatus =
        statusResp && typeof statusResp === 'object' && 'hasPin' in statusResp
          ? statusResp
          : DEFAULT_AUTH_STATUS;
      setAuthStatus(status);
      if (!status.hasPin || status.unlocked) {
        const list = await api.listProfiles();
        applyProfiles(Array.isArray(list) ? list : []);
      } else {
        setProfiles([]);
        setSelectedProfileName('');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setAuthChecked(true);
    }
  };

  useEffect(() => {
    refreshAuthAndProfiles();
  }, []);

  const showError = (msg: string) => {
    setSuccess(null);
    setError(msg);
  };

  const showSuccess = (msg: string) => {
    setError(null);
    setSuccess(msg);
  };

  const handleProfilesChanged = async (updated: AwsProfile[]) => {
    applyProfiles(updated);
    try {
      const statusResp = await api.getAuthStatus();
      if (statusResp && typeof statusResp === 'object' && 'hasPin' in statusResp) {
        setAuthStatus(statusResp);
      }
    } catch {
      // ignore status refresh error
    }
  };

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = pinInput.trim();
    if (!/^\d{6}$/.test(cleaned)) {
      setPinError('PIN must be exactly 6 digits (0-9).');
      return;
    }
    setUnlocking(true);
    setPinError(null);
    try {
      const unlockedProfiles = await api.unlockWithPin(cleaned);
      const list = Array.isArray(unlockedProfiles) ? unlockedProfiles : [];
      applyProfiles(list);
      setAuthStatus((prev) => ({
        ...prev,
        hasPin: true,
        unlocked: true,
      }));
      setPinInput('');
    } catch (err) {
      setPinError(String(err));
    } finally {
      setUnlocking(false);
    }
  };

  const handleQuickRegionChange = async (nextRegion: string) => {
    if (!activeAccount || !nextRegion || nextRegion === activeAccount.region) return;
    try {
      const updated = await api.updateProfile(activeAccount.profile, {
        profile: activeAccount.profile,
        region: nextRegion,
        accessKeyId: activeAccount.accessKeyId,
        secretAccessKey: '',
        sessionToken: activeAccount.sessionToken,
      });
      applyProfiles(updated);
      showSuccess(`Switched region for "${activeAccount.profile}" to ${nextRegion}.`);
    } catch (err) {
      showError(String(err));
    }
  };

  const handleLockVault = async () => {
    try {
      const nextStatus = await api.lockAuthSession();
      if (nextStatus && typeof nextStatus === 'object' && 'hasPin' in nextStatus) {
        setAuthStatus(nextStatus);
      } else {
        setAuthStatus((prev) => ({ ...prev, unlocked: false }));
      }
      setProfiles([]);
      setSelectedProfileName('');
      setPinInput('');
      setPinError(null);
      setError(null);
      setSuccess(null);
    } catch (err) {
      showError(String(err));
    }
  };

  const activeAccount = profiles.find((p) => p.profile === selectedProfileName) || null;
  const isLocked = authChecked && authStatus.hasPin && !authStatus.unlocked;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Cloud size={18} />
          </div>
          <div>
            <div className="brand-title">AWS Domain Manager</div>
            <div className="brand-sub">Desktop v2.5.0</div>
          </div>
        </div>

        <nav className="nav-list">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${section === item.id ? 'active' : ''}`}
              disabled={isLocked}
              onClick={() => {
                setSection(item.id);
                setError(null);
                setSuccess(null);
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>
              {profiles.length} AWS profile{profiles.length === 1 ? '' : 's'} loaded
            </span>
            {authStatus.hasPin && (
              <span
                className="region-pill"
                style={{
                  fontSize: 10.5,
                  padding: '2px 7px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  color: authStatus.unlocked ? 'var(--green)' : 'var(--accent)',
                  borderColor: authStatus.unlocked
                    ? 'rgba(52, 211, 153, 0.35)'
                    : 'rgba(245, 158, 11, 0.35)',
                  background: authStatus.unlocked
                    ? 'rgba(52, 211, 153, 0.12)'
                    : 'rgba(245, 158, 11, 0.12)',
                }}
              >
                {authStatus.unlocked ? <Unlock size={10} /> : <Lock size={10} />}
                {authStatus.unlocked ? 'PIN Unlocked' : 'PIN Locked'}
              </span>
            )}
          </div>
          {authStatus.hasPin && authStatus.unlocked && (
            <button
              className="btn btn-sm"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={handleLockVault}
            >
              <Lock size={12} /> Lock Auth Vault
            </button>
          )}
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <h1 className="topbar-title">{TITLES[section]}</h1>
          </div>

          {section !== 'accounts' && !isLocked && (
            <div className="account-bar">
              {profiles.length > 0 ? (
                <>
                  <select
                    className="account-select"
                    value={selectedProfileName}
                    onChange={(e) => {
                      setSelectedProfileName(e.target.value);
                      setError(null);
                      setSuccess(null);
                    }}
                  >
                    {profiles.map((p) => (
                      <option key={p.profile} value={p.profile}>
                        {p.profile} ({p.region})
                      </option>
                    ))}
                  </select>
                  {activeAccount && (
                    <select
                      className="account-select"
                      aria-label="AWS Region"
                      style={{ minWidth: 135 }}
                      value={activeAccount.region}
                      onChange={(e) => handleQuickRegionChange(e.target.value)}
                    >
                      {Array.from(new Set([activeAccount.region, ...AWS_REGIONS])).map((reg) => (
                        <option key={reg} value={reg}>
                          {reg}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={() => setSection('accounts')}>
                  Add AWS Account
                </button>
              )}
            </div>
          )}
        </header>

        <div className="content">
          {error && (
            <div className="banner banner-error">
              <span>{error}</span>
              <button className="btn btn-sm" onClick={() => setError(null)}>
                <X size={13} />
              </button>
            </div>
          )}

          {success && (
            <div className="banner banner-success">
              <span>{success}</span>
              <button className="btn btn-sm" onClick={() => setSuccess(null)}>
                <X size={13} />
              </button>
            </div>
          )}

          {isLocked ? (
            <div className="modal-backdrop">
              <form className="modal" onSubmit={handleUnlockSubmit} style={{ maxWidth: 440 }}>
                <div className="modal-header">
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Lock size={17} color="var(--accent)" /> Unlock PIN-Encrypted Auth Vault
                  </h3>
                </div>
                <div className="modal-body">
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
                    AWS account credentials are encrypted on disk with your 6-digit PIN. Enter your
                    PIN to verify the salted hash and unlock your accounts for this session.
                  </p>
                  <div
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '8px 10px',
                      marginBottom: 14,
                      fontSize: 12,
                      color: 'var(--text-muted)',
                    }}
                  >
                    <div>
                      Vault: <code className="mono">{authStatus.vaultPath}</code>
                    </div>
                    {(authStatus.saltPreview || authStatus.pinHashPreview) && (
                      <div style={{ marginTop: 4 }}>
                        Salted Hash:{' '}
                        <code className="mono">{authStatus.pinHashPreview || 'configured'}</code>{' '}
                        (Salt: <code className="mono">{authStatus.saltPreview || '16B'}</code>)
                      </div>
                    )}
                  </div>

                  {pinError && (
                    <div className="banner banner-error" style={{ marginBottom: 12 }}>
                      <span>{pinError}</span>
                    </div>
                  )}

                  <div className="field">
                    <label htmlFor="launch-pin-input">6-Digit Security PIN</label>
                    <input
                      id="launch-pin-input"
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="••••••"
                      aria-label="6-Digit Security PIN"
                      value={pinInput}
                      onChange={(e) => {
                        const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setPinInput(digitsOnly);
                        setPinError(null);
                      }}
                      style={{
                        fontSize: 20,
                        letterSpacing: '0.35em',
                        textAlign: 'center',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      }}
                      autoFocus
                      required
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={unlocking || pinInput.length !== 6}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    <Unlock size={14} /> {unlocking ? 'Verifying Salted PIN Hash...' : 'Unlock Vault'}
                  </button>
                </div>
              </form>
            </div>
          ) : section === 'accounts' ? (
            <AccountsView
              profiles={profiles}
              authStatus={authStatus}
              onProfilesChanged={handleProfilesChanged}
              onLockVault={handleLockVault}
              onError={showError}
              onSuccess={showSuccess}
            />
          ) : !activeAccount ? (
            <div className="card">
              <div className="empty-state">
                <h3>No AWS Account Selected</h3>
                <p style={{ marginBottom: 14 }}>
                  Add an AWS credential profile (encrypted with a 6-digit PIN) to manage Route53,
                  EC2, S3, and SES.
                </p>
                <button className="btn btn-primary" onClick={() => setSection('accounts')}>
                  Manage AWS Accounts
                </button>
              </div>
            </div>
          ) : section === 'route53' ? (
            <Route53View account={activeAccount} onError={showError} onSuccess={showSuccess} />
          ) : section === 'ec2-instances' ? (
            <Ec2InstancesView account={activeAccount} onError={showError} onSuccess={showSuccess} />
          ) : section === 'ec2' ? (
            <Ec2View account={activeAccount} onError={showError} onSuccess={showSuccess} />
          ) : section === 'ses' ? (
            <SesView account={activeAccount} onError={showError} onSuccess={showSuccess} />
          ) : (
            <S3View account={activeAccount} onError={showError} onSuccess={showSuccess} />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
