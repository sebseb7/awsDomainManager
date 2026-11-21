import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Cpu,
  Globe,
  Info,
  Link2,
  Lock,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Server,
  Square,
  Trash2,
  Unlink,
  Unlock,
} from 'lucide-react';
import { api, formatDate } from '../api';
import type { AwsProfile, Ec2Instance, ElasticIp } from '../types';

interface Props {
  account: AwsProfile;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

export const Ec2InstancesView: React.FC<Props> = ({ account, onError, onSuccess }) => {
  const [instances, setInstances] = useState<Ec2Instance[]>([]);
  const [elasticIps, setElasticIps] = useState<ElasticIp[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [detailsInstance, setDetailsInstance] = useState<Ec2Instance | null>(null);
  const [rebootTarget, setRebootTarget] = useState<Ec2Instance | null>(null);
  const [stopTarget, setStopTarget] = useState<Ec2Instance | null>(null);

  const [showAllocateEip, setShowAllocateEip] = useState(false);
  const [newEipName, setNewEipName] = useState('');
  const [associateTarget, setAssociateTarget] = useState<ElasticIp | null>(null);
  const [associateInstanceId, setAssociateInstanceId] = useState('');
  const [disassociateTarget, setDisassociateTarget] = useState<ElasticIp | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<ElasticIp | null>(null);
  const [ptrTarget, setPtrTarget] = useState<ElasticIp | null>(null);
  const [ptrInput, setPtrInput] = useState('');

  const loadAll = async () => {
    setLoading(true);
    try {
      const [instList, eipList] = await Promise.all([
        api.listEc2Instances(account.profile),
        api.listElasticIps(account.profile),
      ]);
      setInstances(instList);
      setElasticIps(eipList);
    } catch (e) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSearch('');
    setDetailsInstance(null);
    setRebootTarget(null);
    setStopTarget(null);
    setAssociateTarget(null);
    setDisassociateTarget(null);
    setReleaseTarget(null);
    setPtrTarget(null);
    setPtrInput('');
    loadAll();
  }, [account.profile]);

  const handleToggleRebootLock = async (inst: Ec2Instance) => {
    setLoading(true);
    try {
      const nextLock = !inst.rebootLock;
      const msg = await api.setEc2RebootLock(account.profile, inst.instanceId, nextLock);
      onSuccess(msg);
      await loadAll();
    } catch (e) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReboot = async () => {
    if (!rebootTarget) return;
    setLoading(true);
    try {
      const msg = await api.rebootEc2Instance(account.profile, rebootTarget.instanceId);
      setRebootTarget(null);
      onSuccess(msg);
      await loadAll();
    } catch (e) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleStartInstance = async (inst: Ec2Instance) => {
    setLoading(true);
    try {
      const msg = await api.startEc2Instance(account.profile, inst.instanceId);
      onSuccess(msg);
      await loadAll();
    } catch (e) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmStop = async () => {
    if (!stopTarget) return;
    setLoading(true);
    try {
      const msg = await api.stopEc2Instance(account.profile, stopTarget.instanceId);
      setStopTarget(null);
      onSuccess(msg);
      await loadAll();
    } catch (e) {
      onError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleAllocateEip = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const created = await api.allocateElasticIp(account.profile, newEipName);
      setShowAllocateEip(false);
      setNewEipName('');
      onSuccess(
        `Allocated Elastic IP ${created.publicIp} (${created.allocationId})${
          created.name && created.name !== '-' ? ` — "${created.name}"` : ''
        }.`
      );
      await loadAll();
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const openAssociateModal = (eip: ElasticIp) => {
    setAssociateTarget(eip);
    const defaultInst =
      eip.instanceId || (instances.length > 0 ? instances[0].instanceId : '');
    setAssociateInstanceId(defaultInst);
  };

  const handleConfirmAssociate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!associateTarget || !associateInstanceId) return;
    setLoading(true);
    try {
      const msg = await api.associateElasticIp(
        account.profile,
        associateTarget.allocationId,
        associateInstanceId
      );
      setAssociateTarget(null);
      onSuccess(msg);
      await loadAll();
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDisassociate = async () => {
    if (!disassociateTarget?.associationId) return;
    setLoading(true);
    try {
      const msg = await api.disassociateElasticIp(
        account.profile,
        disassociateTarget.associationId
      );
      setDisassociateTarget(null);
      onSuccess(msg);
      await loadAll();
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmRelease = async () => {
    if (!releaseTarget) return;
    setLoading(true);
    try {
      const msg = await api.releaseElasticIp(account.profile, releaseTarget.allocationId);
      setReleaseTarget(null);
      onSuccess(msg);
      await loadAll();
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const openPtrModal = (eip: ElasticIp) => {
    setPtrTarget(eip);
    setPtrInput(eip.ptrRecord ? eip.ptrRecord.replace(/\.$/, '') : '');
  };

  const handleSavePtr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ptrTarget) return;
    setLoading(true);
    try {
      const trimmed = ptrInput.trim();
      const msg = trimmed
        ? await api.updateElasticIpReverseDns(account.profile, ptrTarget.allocationId, trimmed)
        : await api.resetElasticIpReverseDns(account.profile, ptrTarget.allocationId);
      setPtrTarget(null);
      setPtrInput('');
      onSuccess(msg);
      await loadAll();
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClearPtr = async () => {
    if (!ptrTarget) return;
    setLoading(true);
    try {
      const msg = await api.resetElasticIpReverseDns(account.profile, ptrTarget.allocationId);
      setPtrTarget(null);
      setPtrInput('');
      onSuccess(msg);
      await loadAll();
    } catch (err) {
      onError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const q = search.trim().toLowerCase();
  const filteredInstances = instances.filter(
    (i) =>
      !q ||
      i.name.toLowerCase().includes(q) ||
      i.instanceId.toLowerCase().includes(q) ||
      i.state.toLowerCase().includes(q) ||
      i.instanceType.toLowerCase().includes(q) ||
      i.publicIp.toLowerCase().includes(q) ||
      i.privateIp.toLowerCase().includes(q) ||
      i.availabilityZone.toLowerCase().includes(q)
  );

  const filteredEips = elasticIps.filter(
    (eip) =>
      !q ||
      eip.publicIp.toLowerCase().includes(q) ||
      eip.allocationId.toLowerCase().includes(q) ||
      eip.name.toLowerCase().includes(q) ||
      (eip.instanceId || '').toLowerCase().includes(q) ||
      (eip.instanceName || '').toLowerCase().includes(q) ||
      (eip.ptrRecord || '').toLowerCase().includes(q) ||
      eip.privateIp.toLowerCase().includes(q)
  );

  const runningCount = instances.filter((i) => i.state === 'running').length;
  const stoppedCount = instances.filter((i) => i.state === 'stopped').length;
  const lockedCount = instances.filter((i) => i.rebootLock).length;
  const associatedEipCount = elasticIps.filter((e) => Boolean(e.associationId)).length;
  const unassociatedEipCount = elasticIps.length - associatedEipCount;

  const getStateBadgeClass = (state: string) => {
    if (state === 'running') return 'badge badge-green';
    if (state === 'stopped' || state === 'terminated') return 'badge badge-red';
    return 'badge badge-type';
  };

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="toolbar-group">
          <input
            className="search-input"
            style={{ width: 205 }}
            placeholder="Filter instances or Elastic IPs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="badge badge-green">Running: {runningCount}</span>
          <span className="badge badge-red">Stopped: {stoppedCount}</span>
          <span className="badge badge-type">Locked: {lockedCount}</span>
          <span className="badge badge-blue">
            EIPs: {associatedEipCount}/{elasticIps.length}
          </span>
        </div>
        <div className="toolbar-group">
          <button className="btn btn-sm" onClick={loadAll} disabled={loading}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAllocateEip(true)}>
            <Plus size={13} /> Allocate Elastic IP
          </button>
        </div>
      </div>

      {/* Section 1: EC2 Instances */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="keys-section-header" style={{ padding: '8px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Cpu size={15} color="var(--accent)" />
            <span style={{ fontWeight: 600 }}>
              EC2 Instances ({filteredInstances.length})
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              State, Public/Private/Elastic IPs, Instance Type, AZ, Reboot &amp; Reboot Lock
            </span>
          </div>
        </div>

        {loading && instances.length === 0 ? (
          <div className="empty-state">Loading EC2 instances...</div>
        ) : filteredInstances.length === 0 ? (
          <div className="empty-state">
            <h3>No EC2 instances found</h3>
            <p>Region: {account.region}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="ses-table">
              <thead>
                <tr>
                  <th>Instance</th>
                  <th>State</th>
                  <th>Type &amp; AZ</th>
                  <th>Public / Private IP</th>
                  <th>SG &amp; Key</th>
                  <th>Reboot Lock</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInstances.map((inst) => {
                  const isRunning = inst.state === 'running';
                  const isStopped = inst.state === 'stopped';
                  const sgNames =
                    inst.securityGroups.length > 0
                      ? inst.securityGroups.map((sg) => sg.split(' (')[0]).join(', ')
                      : '-';
                  return (
                    <tr key={inst.instanceId}>
                      <td style={{ whiteSpace: 'nowrap', padding: '8px 6px 8px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Server size={13} color="var(--accent)" />
                          <div>
                            <div
                              style={{
                                fontWeight: 600,
                                lineHeight: 1.25,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 5,
                              }}
                            >
                              <span>{inst.name !== '-' ? inst.name : '(unnamed)'}</span>
                              <button
                                type="button"
                                className="crumb-btn"
                                style={{ padding: '0 2px', lineHeight: 1 }}
                                onClick={() => setDetailsInstance(inst)}
                                title="View full instance details"
                                aria-label="Details"
                              >
                                <Info size={12} />
                              </button>
                            </div>
                            <div className="mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                              {inst.instanceId}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', padding: '8px 5px' }}>
                        <span className={getStateBadgeClass(inst.state)}>
                          {inst.state.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', padding: '8px 5px' }}>
                        <div className="mono" style={{ fontWeight: 600, lineHeight: 1.25 }}>
                          {inst.instanceType}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                          {inst.availabilityZone} · {inst.architecture}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', padding: '8px 5px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, lineHeight: 1.25 }}>
                          <span className="mono">
                            {inst.publicIp !== '-' ? inst.publicIp : 'No Public IP'}
                          </span>
                          {inst.elasticIp && (
                            <span
                              className="badge badge-blue"
                              title={`Elastic IP (${inst.elasticIpAllocationId || 'allocated'})`}
                            >
                              EIP
                            </span>
                          )}
                        </div>
                        <div className="mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                          priv: {inst.privateIp}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', padding: '8px 5px' }}>
                        <div style={{ fontSize: 12, lineHeight: 1.25 }}>{sgNames}</div>
                        <div className="mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                          {inst.keyName}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', padding: '8px 5px' }}>
                        {inst.rebootLock ? (
                          <span
                            className="badge badge-type"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            title="Reboot Lock enabled (Tag RebootLock=true) — prevents accidental reboot or stop"
                          >
                            <Lock size={11} /> Locked
                          </span>
                        ) : (
                          <span
                            className="badge"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              color: 'var(--text-muted)',
                            }}
                          >
                            <Unlock size={11} /> Unlocked
                          </span>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', padding: '8px 10px 8px 5px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => handleToggleRebootLock(inst)}
                            disabled={loading}
                            title={
                              inst.rebootLock
                                ? 'Unlock instance to allow reboot/stop'
                                : 'Enable Reboot Lock to prevent accidental reboot/stop'
                            }
                          >
                            {inst.rebootLock ? <Unlock size={11} /> : <Lock size={11} />}
                            {inst.rebootLock ? 'Unlock' : 'Lock'}
                          </button>

                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => setRebootTarget(inst)}
                            disabled={loading || inst.rebootLock || !isRunning}
                            title={
                              inst.rebootLock
                                ? 'Reboot Lock is enabled — unlock before rebooting'
                                : !isRunning
                                  ? 'Instance must be running to reboot'
                                  : 'Reboot EC2 instance'
                            }
                          >
                            <RotateCw size={11} /> Reboot
                          </button>

                          {isStopped ? (
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => handleStartInstance(inst)}
                              disabled={loading}
                              title="Start stopped EC2 instance"
                            >
                              <Play size={11} /> Start
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => setStopTarget(inst)}
                              disabled={loading || inst.rebootLock || !isRunning}
                              title={
                                inst.rebootLock
                                  ? 'Reboot Lock is enabled — unlock before stopping'
                                  : 'Stop running EC2 instance'
                              }
                            >
                              <Square size={11} /> Stop
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 2: Elastic IPs */}
      <div className="card">
        <div className="keys-section-header" style={{ padding: '8px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Globe size={15} color="var(--blue)" />
            <span style={{ fontWeight: 600 }}>
              Elastic IPs ({filteredEips.length})
            </span>
            <span className="badge badge-green">Associated: {associatedEipCount}</span>
            {unassociatedEipCount > 0 && (
              <span className="badge badge-type">
                Unassociated (Idle): {unassociatedEipCount}
              </span>
            )}
          </div>
        </div>

        {loading && elasticIps.length === 0 ? (
          <div className="empty-state">Loading Elastic IPs...</div>
        ) : filteredEips.length === 0 ? (
          <div className="empty-state">
            <h3>No Elastic IPs allocated</h3>
            <p>Click &quot;Allocate Elastic IP&quot; to reserve a static public IPv4 address.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="ses-table">
              <thead>
                <tr>
                  <th>Public IP</th>
                  <th>Allocation ID</th>
                  <th>Status</th>
                  <th>Attached Instance</th>
                  <th>Reverse DNS (PTR)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEips.map((eip) => {
                  const isAssociated = Boolean(eip.associationId);
                  return (
                    <tr key={eip.allocationId}>
                      <td style={{ whiteSpace: 'nowrap', padding: '8px 6px 8px 12px' }}>
                        <div className="mono" style={{ fontWeight: 600, lineHeight: 1.25 }}>
                          {eip.publicIp}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                          {eip.name !== '-' ? eip.name : '(no Name tag)'}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', padding: '8px 5px' }}>
                        <div className="mono" style={{ lineHeight: 1.25, fontSize: 11 }}>
                          {eip.allocationId}
                        </div>
                        {eip.associationId && (
                          <div className="mono" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                            {eip.associationId}
                          </div>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', padding: '8px 5px' }}>
                        {isAssociated ? (
                          <span className="badge badge-green">ASSOCIATED</span>
                        ) : (
                          <span className="badge badge-type">UNASSOCIATED</span>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', padding: '8px 5px' }}>
                        {eip.instanceId ? (
                          <div title={`${eip.instanceId} · ${eip.privateIp}`}>
                            <div style={{ fontWeight: 600, lineHeight: 1.25 }}>
                              {eip.instanceName || eip.instanceId}
                            </div>
                            <div className="mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                              {eip.privateIp}
                            </div>
                          </div>
                        ) : eip.networkInterfaceId !== '-' ? (
                          <div>
                            <div className="mono" style={{ fontSize: 11 }}>{eip.networkInterfaceId}</div>
                            <div className="mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                              {eip.privateIp}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>— (Idle)</span>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', padding: '8px 5px' }}>
                        {eip.ptrRecord ? (
                          <div
                            className="mono"
                            style={{
                              lineHeight: 1.25,
                              fontSize: 11.5,
                              color: 'var(--blue)',
                              fontWeight: 600,
                            }}
                            title={
                              eip.ptrUpdateStatus
                                ? `Reverse DNS (PTR) — Status: ${eip.ptrUpdateStatus}`
                                : 'Reverse DNS (PTR) record'
                            }
                          >
                            {eip.ptrRecord}
                          </div>
                        ) : (
                          <div style={{ lineHeight: 1.25, fontSize: 11.5, color: 'var(--text-muted)' }}>
                            —
                          </div>
                        )}
                        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                          {eip.networkBorderGroup} · {eip.domain}
                          {eip.ptrUpdateStatus && eip.ptrUpdateStatus !== 'complete'
                            ? ` · ${eip.ptrUpdateStatus}`
                            : ''}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', padding: '8px 10px 8px 5px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => openAssociateModal(eip)}
                            disabled={loading || instances.length === 0}
                            title={
                              isAssociated
                                ? 'Reassociate Elastic IP with another instance'
                                : 'Associate Elastic IP with an instance'
                            }
                          >
                            <Link2 size={11} /> {isAssociated ? 'Reassociate' : 'Associate'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => openPtrModal(eip)}
                            disabled={loading}
                            title={
                              eip.ptrRecord
                                ? `Update or clear Reverse DNS (${eip.ptrRecord})`
                                : 'Configure Reverse DNS (PTR) record'
                            }
                          >
                            <Globe size={11} /> PTR
                          </button>
                          {isAssociated ? (
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => setDisassociateTarget(eip)}
                              disabled={loading}
                              title="Disassociate Elastic IP from instance"
                            >
                              <Unlink size={11} /> Detach
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => setReleaseTarget(eip)}
                              disabled={loading}
                              title={
                                eip.ptrRecord
                                  ? `Release Elastic IP (will automatically clear Reverse DNS ${eip.ptrRecord} first)`
                                  : 'Release unassociated Elastic IP'
                              }
                            >
                              <Trash2 size={11} /> Release
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Instance Details Modal */}
      {detailsInstance && (
        <div className="modal-backdrop">
          <div className="modal modal-wide">
            <div className="modal-header">
              <h3>
                EC2 Instance Details —{' '}
                {detailsInstance.name !== '-' ? detailsInstance.name : detailsInstance.instanceId}
              </h3>
            </div>
            <div className="modal-body">
              <div className="cred-grid" style={{ gridTemplateColumns: '160px 1fr' }}>
                <div className="cred-label">Instance ID</div>
                <div className="cred-val">{detailsInstance.instanceId}</div>

                <div className="cred-label">Name Tag</div>
                <div className="cred-val">{detailsInstance.name}</div>

                <div className="cred-label">State</div>
                <div>
                  <span className={getStateBadgeClass(detailsInstance.state)}>
                    {detailsInstance.state.toUpperCase()}
                  </span>
                </div>

                <div className="cred-label">Reboot Lock</div>
                <div>
                  {detailsInstance.rebootLock ? (
                    <span className="badge badge-type">Locked (Tag RebootLock=true)</span>
                  ) : (
                    <span className="badge">Unlocked</span>
                  )}
                </div>

                <div className="cred-label">Instance Type &amp; Arch</div>
                <div className="cred-val">
                  {detailsInstance.instanceType} ({detailsInstance.architecture} ·{' '}
                  {detailsInstance.platform})
                </div>

                <div className="cred-label">Availability Zone</div>
                <div className="cred-val">{detailsInstance.availabilityZone}</div>

                <div className="cred-label">Public IPv4</div>
                <div className="cred-val">
                  {detailsInstance.publicIp}{' '}
                  {detailsInstance.elasticIp
                    ? `(Elastic IP: ${detailsInstance.elasticIpAllocationId || 'attached'})`
                    : ''}
                </div>

                <div className="cred-label">Private IPv4</div>
                <div className="cred-val">{detailsInstance.privateIp}</div>

                <div className="cred-label">IPv6 Address</div>
                <div className="cred-val">{detailsInstance.ipv6Address}</div>

                <div className="cred-label">VPC / Subnet</div>
                <div className="cred-val">
                  {detailsInstance.vpcId} / {detailsInstance.subnetId}
                </div>

                <div className="cred-label">SSH Key Pair</div>
                <div className="cred-val">{detailsInstance.keyName}</div>

                <div className="cred-label">Security Groups</div>
                <div className="cred-val">
                  {detailsInstance.securityGroups.join(', ') || '-'}
                </div>

                <div className="cred-label">Launch Time</div>
                <div className="cred-val">{formatDate(detailsInstance.launchTime)}</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setDetailsInstance(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reboot Confirmation Modal */}
      {rebootTarget && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Reboot EC2 Instance</h3>
            </div>
            <div className="modal-body">
              <p>
                Reboot instance{' '}
                <strong>
                  {rebootTarget.name !== '-' ? rebootTarget.name : rebootTarget.instanceId}
                </strong>{' '}
                (<code className="mono">{rebootTarget.instanceId}</code> ·{' '}
                <code className="mono">{rebootTarget.publicIp}</code>)?
              </p>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                The instance will remain on the same host hardware and retain its public/private IP
                addresses.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setRebootTarget(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleConfirmReboot}
                disabled={loading}
              >
                Reboot Instance
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stop Confirmation Modal */}
      {stopTarget && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Stop EC2 Instance</h3>
            </div>
            <div className="modal-body">
              <p>
                Stop running instance{' '}
                <strong>
                  {stopTarget.name !== '-' ? stopTarget.name : stopTarget.instanceId}
                </strong>{' '}
                (<code className="mono">{stopTarget.instanceId}</code>)?
              </p>
              {!stopTarget.elasticIp && stopTarget.publicIp !== '-' && (
                <p style={{ fontSize: 12.5, color: 'var(--accent)' }}>
                  Note: This instance uses an auto-assigned public IP ({stopTarget.publicIp}), not
                  an Elastic IP. Stopping and starting it will assign a new public IPv4 address.
                </p>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setStopTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleConfirmStop} disabled={loading}>
                Stop Instance
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Allocate Elastic IP Modal */}
      {showAllocateEip && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={handleAllocateEip}>
            <div className="modal-header">
              <h3>Allocate New Elastic IP</h3>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Name Tag (optional)</label>
                <input
                  value={newEipName}
                  onChange={(e) => setNewEipName(e.target.value)}
                  placeholder="prod-web-eip"
                />
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                Allocates a static VPC public IPv4 address in <strong>{account.region}</strong>.
                Remember to associate it with an instance or release it when unused to avoid idle
                Elastic IP charges.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn" onClick={() => setShowAllocateEip(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                Allocate Elastic IP
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Associate Elastic IP Modal */}
      {associateTarget && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={handleConfirmAssociate}>
            <div className="modal-header">
              <h3>Associate Elastic IP — {associateTarget.publicIp}</h3>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Target EC2 Instance</label>
                <select
                  value={associateInstanceId}
                  onChange={(e) => setAssociateInstanceId(e.target.value)}
                  required
                >
                  {instances.map((inst) => (
                    <option key={inst.instanceId} value={inst.instanceId}>
                      {inst.name !== '-' ? `${inst.name} (${inst.instanceId})` : inst.instanceId} —{' '}
                      {inst.state} · {inst.privateIp}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn" onClick={() => setAssociateTarget(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                Associate Elastic IP
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Disassociate Elastic IP Confirmation Modal */}
      {disassociateTarget && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Disassociate Elastic IP</h3>
            </div>
            <div className="modal-body">
              <p>
                Disassociate Elastic IP <code className="mono">{disassociateTarget.publicIp}</code>{' '}
                from{' '}
                <strong>
                  {disassociateTarget.instanceName ||
                    disassociateTarget.instanceId ||
                    disassociateTarget.networkInterfaceId}
                </strong>
                ?
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setDisassociateTarget(null)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleConfirmDisassociate}
                disabled={loading}
              >
                Disassociate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Release Elastic IP Confirmation Modal */}
      {releaseTarget && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Release Elastic IP</h3>
            </div>
            <div className="modal-body">
              <p>
                Release Elastic IP <code className="mono">{releaseTarget.publicIp}</code> (
                <code className="mono">{releaseTarget.allocationId}</code>) back to Amazon&apos;s
                IPv4 pool?
              </p>
              {releaseTarget.ptrRecord && (
                <div
                  className="banner banner-warning"
                  style={{ marginBottom: 0, alignItems: 'flex-start' }}
                >
                  <div className="ses-action-banner-body">
                    <div className="ses-action-banner-title">
                      <AlertTriangle size={14} /> Reverse DNS record will be cleared first
                    </div>
                    <div className="ses-action-banner-desc">
                      AWS blocks releasing Elastic IPs with Reverse DNS (PTR) records (
                      <code className="mono">{releaseTarget.ptrRecord}</code>). Confirming will
                      automatically clear the PTR record via{' '}
                      <code className="mono">ResetAddressAttribute</code> and then release this
                      Elastic IP.
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setReleaseTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleConfirmRelease} disabled={loading}>
                {releaseTarget.ptrRecord ? 'Clear PTR & Release' : 'Release Elastic IP'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Reverse DNS (PTR) Modal */}
      {ptrTarget && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={handleSavePtr}>
            <div className="modal-header">
              <h3>Reverse DNS (PTR) — {ptrTarget.publicIp}</h3>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Reverse DNS Domain Name</label>
                <input
                  value={ptrInput}
                  onChange={(e) => setPtrInput(e.target.value)}
                  placeholder="mail.example.com"
                  autoFocus
                />
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                Sets or updates the PTR record for{' '}
                <code className="mono">{ptrTarget.allocationId}</code> via{' '}
                <code className="mono">ModifyAddressAttribute</code>. AWS requires a matching
                forward DNS <code className="mono">A</code> record pointing to{' '}
                <code className="mono">{ptrTarget.publicIp}</code>. Leave blank or click{' '}
                <strong>Clear Reverse DNS</strong> to remove it.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setPtrTarget(null);
                  setPtrInput('');
                }}
              >
                Cancel
              </button>
              {ptrTarget.ptrRecord && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleClearPtr}
                  disabled={loading}
                >
                  Clear Reverse DNS
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={loading}>
                Save Reverse DNS
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
