import React, { useEffect, useState } from 'react';
import { Cloud, Cpu, Database, Globe, KeyRound, Mail, Shield, X } from 'lucide-react';
import { api } from './api';
import { AccountsView } from './components/AccountsView';
import { Ec2InstancesView } from './components/Ec2InstancesView';
import { Ec2View } from './components/Ec2View';
import { Route53View } from './components/Route53View';
import { S3View } from './components/S3View';
import { SesView } from './components/SesView';
import type { AwsProfile, NavSection } from './types';

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

export function App() {
  const [section, setSection] = useState<NavSection>('route53');
  const [profiles, setProfiles] = useState<AwsProfile[]>([]);
  const [selectedProfileName, setSelectedProfileName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadProfiles = async () => {
    try {
      const list = await api.listProfiles();
      setProfiles(list);
      if (list.length > 0) {
        setSelectedProfileName((prev) =>
          list.some((p) => p.profile === prev) ? prev : list[0].profile
        );
      } else {
        setSelectedProfileName('');
      }
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const showError = (msg: string) => {
    setSuccess(null);
    setError(msg);
  };

  const showSuccess = (msg: string) => {
    setError(null);
    setSuccess(msg);
  };

  const handleProfilesChanged = (updated: AwsProfile[]) => {
    setProfiles(updated);
    if (updated.length > 0 && !updated.some((p) => p.profile === selectedProfileName)) {
      setSelectedProfileName(updated[0].profile);
    } else if (updated.length === 0) {
      setSelectedProfileName('');
    }
  };

  const activeAccount = profiles.find((p) => p.profile === selectedProfileName) || null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Cloud size={18} />
          </div>
          <div>
            <div className="brand-title">AWS Domain Manager</div>
            <div className="brand-sub">Desktop v2.4.1</div>
          </div>
        </div>

        <nav className="nav-list">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${section === item.id ? 'active' : ''}`}
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

        <div className="sidebar-footer">
          {profiles.length} AWS profile{profiles.length === 1 ? '' : 's'} loaded
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <h1 className="topbar-title">{TITLES[section]}</h1>
          </div>

          {section !== 'accounts' && (
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
                  {activeAccount && <span className="region-pill">{activeAccount.region}</span>}
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

          {section === 'accounts' ? (
            <AccountsView
              profiles={profiles}
              onProfilesChanged={handleProfilesChanged}
              onError={showError}
              onSuccess={showSuccess}
            />
          ) : !activeAccount ? (
            <div className="card">
              <div className="empty-state">
                <h3>No AWS Account Selected</h3>
                <p style={{ marginBottom: 14 }}>
                  Add an AWS credential profile to manage Route53, EC2 Security Groups, and S3
                  buckets.
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
