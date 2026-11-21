import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, RefreshCw, Shield, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { AwsProfile, InboundRule, SecurityGroup } from '../types';

interface Props {
  account: AwsProfile;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

export const Ec2View: React.FC<Props> = ({ account, onError, onSuccess }) => {
  const [groups, setGroups] = useState<SecurityGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<SecurityGroup | null>(null);
  const [rules, setRules] = useState<InboundRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [protocol, setProtocol] = useState('tcp');
  const [fromPort, setFromPort] = useState('443');
  const [toPort, setToPort] = useState('443');
  const [source, setSource] = useState('0.0.0.0/0');
  const [description, setDescription] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<InboundRule | null>(null);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const data = await api.listSecurityGroups(account.profile);
      setGroups(data);
    } catch (e) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const loadRules = async (group: SecurityGroup) => {
    setLoading(true);
    try {
      const data = await api.listInboundRules(account.profile, group.groupId);
      setRules(data);
    } catch (e) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedGroup(null);
    setRules([]);
    setSearch('');
    loadGroups();
  }, [account.profile]);

  const handleOpenGroup = (group: SecurityGroup) => {
    setSelectedGroup(group);
    setSearch('');
    loadRules(group);
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup) return;
    setLoading(true);
    try {
      await api.addInboundRule(account.profile, selectedGroup.groupId, {
        protocol,
        fromPort: protocol === '-1' || fromPort.trim() === '' ? null : parseInt(fromPort, 10),
        toPort: protocol === '-1' || toPort.trim() === '' ? null : parseInt(toPort, 10),
        source: source.trim() || '0.0.0.0/0',
        description: description.trim(),
      });
      setShowAdd(false);
      setDescription('');
      onSuccess('Added inbound security group rule.');
      await loadRules(selectedGroup);
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRule = async () => {
    if (!selectedGroup || !deleteTarget) return;
    setLoading(true);
    try {
      await api.deleteInboundRule(account.profile, selectedGroup.groupId, deleteTarget.id);
      onSuccess(`Deleted inbound rule ${deleteTarget.id}.`);
      setDeleteTarget(null);
      await loadRules(selectedGroup);
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  if (!selectedGroup) {
    const filtered = groups.filter(
      (g) =>
        g.groupName.toLowerCase().includes(search.toLowerCase()) ||
        g.groupId.toLowerCase().includes(search.toLowerCase()) ||
        g.description.toLowerCase().includes(search.toLowerCase())
    );
    return (
      <div>
        <div className="toolbar">
          <input
            className="search-input"
            placeholder="Filter security groups..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn" onClick={loadGroups} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        <div className="card">
          {loading && groups.length === 0 ? (
            <div className="empty-state">Loading security groups...</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <h3>No security groups found</h3>
              <p>Region: {account.region}</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Group Name</th>
                    <th>Group ID</th>
                    <th>VPC ID</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((g) => (
                    <tr
                      key={g.groupId}
                      className="clickable-row"
                      onClick={() => handleOpenGroup(g)}
                    >
                      <td style={{ fontWeight: 600 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <Shield size={14} color="var(--accent)" />
                          {g.groupName}
                        </span>
                      </td>
                      <td className="mono">{g.groupId}</td>
                      <td className="mono">{g.vpcId}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{g.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-group">
          <button className="btn" onClick={() => setSelectedGroup(null)}>
            <ArrowLeft size={14} /> Security Groups
          </button>
          <span style={{ fontWeight: 600 }}>{selectedGroup.groupName}</span>
          <span className="mono" style={{ color: 'var(--text-muted)' }}>
            ({selectedGroup.groupId})
          </span>
        </div>
        <div className="toolbar-group">
          <button className="btn" onClick={() => loadRules(selectedGroup)} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Add Inbound Rule
          </button>
        </div>
      </div>

      <div className="card">
        {loading && rules.length === 0 ? (
          <div className="empty-state">Loading inbound rules...</div>
        ) : rules.length === 0 ? (
          <div className="empty-state">
            <h3>No inbound rules</h3>
            <p>Click "Add Inbound Rule" to authorize ingress traffic.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Protocol</th>
                  <th>Port Range</th>
                  <th>Source</th>
                  <th>Description</th>
                  <th style={{ width: 90 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <span className="badge badge-type">{rule.type}</span>
                    </td>
                    <td className="mono">{rule.port}</td>
                    <td className="mono">{rule.source}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{rule.description}</td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setDeleteTarget(rule)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={handleAddRule}>
            <div className="modal-header">
              <h3>Add Inbound Rule — {selectedGroup.groupName}</h3>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Protocol</label>
                <select value={protocol} onChange={(e) => setProtocol(e.target.value)}>
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                  <option value="icmp">ICMP</option>
                  <option value="-1">All Traffic (-1)</option>
                </select>
              </div>
              {protocol !== '-1' && (
                <div className="field-row">
                  <div className="field">
                    <label>From Port</label>
                    <input
                      type="number"
                      value={fromPort}
                      onChange={(e) => setFromPort(e.target.value)}
                      placeholder="443"
                    />
                  </div>
                  <div className="field">
                    <label>To Port</label>
                    <input
                      type="number"
                      value={toPort}
                      onChange={(e) => setToPort(e.target.value)}
                      placeholder="443"
                    />
                  </div>
                </div>
              )}
              <div className="field">
                <label>Source CIDR</label>
                <input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="0.0.0.0/0"
                  required
                />
              </div>
              <div className="field">
                <label>Description (optional)</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="HTTPS access"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                Add Rule
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Delete Inbound Rule</h3>
            </div>
            <div className="modal-body">
              <p>
                Revoke inbound rule <strong>{deleteTarget.type}</strong> port{' '}
                <code className="mono">{deleteTarget.port}</code> from{' '}
                <code className="mono">{deleteTarget.source}</code>?
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDeleteRule} disabled={loading}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
