import React, { useEffect, useState } from 'react';
import { ArrowLeft, Globe, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { AwsProfile, DnsRecord, HostedZone } from '../types';

interface Props {
  account: AwsProfile;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'];

export const Route53View: React.FC<Props> = ({ account, onError, onSuccess }) => {
  const [zones, setZones] = useState<HostedZone[]>([]);
  const [selectedZone, setSelectedZone] = useState<HostedZone | null>(null);
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [newRec, setNewRec] = useState<DnsRecord>({
    name: '',
    type: 'A',
    value: '',
    ttl: 300,
  });
  const [deleteTarget, setDeleteTarget] = useState<DnsRecord | null>(null);

  const loadZones = async () => {
    setLoading(true);
    try {
      const data = await api.listHostedZones(account.profile);
      setZones(data);
    } catch (e) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const loadRecords = async (zone: HostedZone) => {
    setLoading(true);
    try {
      const data = await api.listDnsRecords(account.profile, zone.id, zone.name);
      setRecords(data);
    } catch (e) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedZone(null);
    setRecords([]);
    setSearch('');
    loadZones();
  }, [account.profile]);

  const handleOpenZone = (zone: HostedZone) => {
    setSelectedZone(zone);
    setSearch('');
    loadRecords(zone);
  };

  const handleCreateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedZone) return;
    if (!newRec.value.trim()) {
      onError('Record value is required.');
      return;
    }
    setLoading(true);
    try {
      await api.createDnsRecord(account.profile, selectedZone.id, selectedZone.name, newRec);
      setShowAdd(false);
      setNewRec({ name: '', type: 'A', value: '', ttl: 300 });
      onSuccess(`Created ${newRec.type} record successfully.`);
      await loadRecords(selectedZone);
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRecord = async () => {
    if (!selectedZone || !deleteTarget) return;
    setLoading(true);
    try {
      await api.deleteDnsRecord(account.profile, selectedZone.id, selectedZone.name, deleteTarget);
      onSuccess(`Deleted ${deleteTarget.type} record "${deleteTarget.name}".`);
      setDeleteTarget(null);
      await loadRecords(selectedZone);
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  if (!selectedZone) {
    const filteredZones = zones.filter((z) =>
      z.name.toLowerCase().includes(search.toLowerCase())
    );
    return (
      <div>
        <div className="toolbar">
          <div className="toolbar-group">
            <input
              className="search-input"
              placeholder="Filter hosted zones..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="btn" onClick={loadZones} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        <div className="card">
          {loading && zones.length === 0 ? (
            <div className="empty-state">Loading hosted zones...</div>
          ) : filteredZones.length === 0 ? (
            <div className="empty-state">
              <h3>No hosted zones found</h3>
              <p>No Route53 hosted zones were returned for profile "{account.profile}".</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Domain Name</th>
                    <th>Zone ID</th>
                    <th>Records</th>
                    <th>Visibility</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredZones.map((zone) => (
                    <tr
                      key={zone.id}
                      className="clickable-row"
                      onClick={() => handleOpenZone(zone)}
                    >
                      <td style={{ fontWeight: 600 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <Globe size={14} color="var(--accent)" />
                          {zone.name}
                        </span>
                      </td>
                      <td className="mono">{zone.id}</td>
                      <td>{zone.recordCount}</td>
                      <td>
                        <span className={`badge ${zone.isPrivate ? 'badge-blue' : 'badge-green'}`}>
                          {zone.isPrivate ? 'Private' : 'Public'}
                        </span>
                      </td>
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

  const filteredRecords = records.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.type.toLowerCase().includes(search.toLowerCase()) ||
      r.value.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-group">
          <button className="btn" onClick={() => setSelectedZone(null)}>
            <ArrowLeft size={14} /> Zones
          </button>
          <span style={{ fontWeight: 600 }}>{selectedZone.name}</span>
          <input
            className="search-input"
            placeholder="Filter records..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="toolbar-group">
          <button className="btn" onClick={() => loadRecords(selectedZone)} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Add Record
          </button>
        </div>
      </div>

      <div className="card">
        {loading && records.length === 0 ? (
          <div className="empty-state">Loading DNS records...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="empty-state">
            <h3>No DNS records found</h3>
            <p>Add an A, AAAA, CNAME, MX, TXT, or NS record to get started.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Value</th>
                  <th>TTL</th>
                  <th style={{ width: 90 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((rec, idx) => (
                  <tr key={`${rec.name}-${rec.type}-${idx}`}>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {rec.name}
                    </td>
                    <td>
                      <span className="badge badge-type">{rec.type}</span>
                    </td>
                    <td className="mono" style={{ maxWidth: 420, wordBreak: 'break-all' }}>
                      {rec.value}
                    </td>
                    <td className="mono">{rec.ttl}</td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setDeleteTarget(rec)}
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
          <form className="modal" onSubmit={handleCreateRecord}>
            <div className="modal-header">
              <h3>Add DNS Record — {selectedZone.name}</h3>
            </div>
            <div className="modal-body">
              <div className="field-row">
                <div className="field">
                  <label>Record Type</label>
                  <select
                    value={newRec.type}
                    onChange={(e) => setNewRec((p) => ({ ...p, type: e.target.value }))}
                  >
                    {RECORD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>TTL (seconds)</label>
                  <input
                    type="number"
                    min={1}
                    value={newRec.ttl}
                    onChange={(e) =>
                      setNewRec((p) => ({ ...p, ttl: parseInt(e.target.value || '300', 10) }))
                    }
                  />
                </div>
              </div>
              <div className="field">
                <label>Name (leave blank or @ for zone apex)</label>
                <input
                  placeholder="www"
                  value={newRec.name}
                  onChange={(e) => setNewRec((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Value</label>
                <input
                  placeholder={
                    newRec.type === 'A'
                      ? '203.0.113.10'
                      : newRec.type === 'TXT'
                      ? '"v=spf1 include:_spf.example.com ~all"'
                      : 'target.example.com'
                  }
                  value={newRec.value}
                  onChange={(e) => setNewRec((p) => ({ ...p, value: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                Create Record
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Delete DNS Record</h3>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to delete the <strong>{deleteTarget.type}</strong> record{' '}
                <code className="mono">{deleteTarget.name}</code> ({deleteTarget.value})?
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDeleteRecord} disabled={loading}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
