import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ResultChart from '../components/ResultChart';
import { runSimulation, createCalibrationInterpolator } from '../../logic';

const Admin: React.FC = () => {
  const { token, baseUrl, user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [cfg, setCfg] = useState<any>({});
  const [authCfg, setAuthCfg] = useState<any>({});
  const [status, setStatus] = useState<string>('');
  const [visibleRecords, setVisibleRecords] = useState<Record<string, boolean>>({});
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletedUsers, setDeletedUsers] = useState<any[]>([]);

  const fetchUsers = async () => {
    if (!token) return;
    const res = await fetch(`${baseUrl}/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      setUsers(await res.json() as any);
    } else if (res.status === 401 || res.status === 403) {
      // not admin or not authorized
      setUsers([]);
    }
  };

  const resetPassword = async (id: number) => {
    if (!token) return setStatus('请先登录');
    try {
      const res = await fetch(`${baseUrl}/admin/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ userId: id }) });
      if (res.ok) {
        const j: any = await res.json();
        setStatus(`已重置，临时密码: ${j.password}`);
      } else {
        const j: any = await res.json().catch(() => ({}));
        setStatus(j.error || '重置失败');
      }
    } catch (e) { console.error(e); setStatus('网络错误'); }
  };

  const viewRecords = async (id: number) => {
    if (!token) return setStatus('请先登录');
    try {
      const res = await fetch(`${baseUrl}/admin/user-records/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
          const rows = await res.json() as any;
          // attach records to user object for simple inline display
          setUsers(prev => prev.map(u => u.id === id ? { ...u, _records: rows || [] } : u));
      } else setStatus('无法获取记录');
    } catch (e) { console.error(e); setStatus('网络错误'); }
  };

  const fetchCfg = async () => {
    if (!token) return;
    const res = await fetch(`${baseUrl}/admin/email-config`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setCfg(await res.json() as any);
  };

  const fetchAuthCfg = async () => {
    if (!token) return;
    const res = await fetch(`${baseUrl}/admin/auth-config`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setAuthCfg(await res.json() as any);
  };

  useEffect(() => { fetchUsers(); fetchCfg(); fetchAuthCfg(); }, []);

  const promoteUser = async (id: number) => {
    if (!token) return setStatus('请先登录');
    if (!confirm('确认把该用户提权为管理员？')) return;
    try {
      const res = await fetch(`${baseUrl}/admin/promote-user`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ userId: id }) });
      if (res.ok) { setStatus('已提权为管理员'); fetchUsers(); } else { const j: any = await res.json().catch(() => ({})); setStatus(j.error || '提权失败'); }
    } catch (e) { console.error(e); setStatus('网络错误'); }
  };

  const deleteUser = async (id: number) => {
    if (!token) return setStatus('请先登录');
    if (!confirm('确认要删除该用户及其所有记录？(软删除)')) return;
    try {
      const res = await fetch(`${baseUrl}/admin/delete-user`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ userId: id }) });
      if (res.ok) {
        setStatus('已删除用户（软删除）');
        fetchUsers();
      } else {
        const j: any = await res.json().catch(() => ({}));
        setStatus(j.error || '删除失败');
      }
    } catch (e) { console.error(e); setStatus('网络错误'); }
  };

  const fetchDeletedUsers = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${baseUrl}/admin/deleted-users`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setDeletedUsers(await res.json() as any);
    } catch (e) { console.error(e); }
  };

  const restoreUser = async (id: number) => {
    if (!token) return setStatus('请先登录');
    try {
      const res = await fetch(`${baseUrl}/admin/restore-user`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ userId: id }) });
      if (res.ok) { setStatus('已恢复用户'); fetchUsers(); fetchDeletedUsers(); } else { const j: any = await res.json().catch(() => ({})); setStatus(j.error || '恢复失败'); }
    } catch (e) { console.error(e); setStatus('网络错误'); }
  };

  const hardDeleteUser = async (id: number) => {
    if (!token) return setStatus('请先登录');
    if (!confirm('确认永久删除该用户及其所有记录？此操作不可恢复。')) return;
    try {
      const res = await fetch(`${baseUrl}/admin/delete-user`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ userId: id, hard: true }) });
      if (res.ok) { setStatus('已永久删除用户'); fetchUsers(); fetchDeletedUsers(); } else { const j: any = await res.json().catch(() => ({})); setStatus(j.error || '删除失败'); }
    } catch (e) { console.error(e); setStatus('网络错误'); }
  };

  const exportUserData = async (id: number) => {
    if (!token) return setStatus('请先登录');
    try {
      const res = await fetch(`${baseUrl}/admin/delete-user`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ userId: id, exportBefore: true }) });
      if (res.ok) {
        const j: any = await res.json();
        const dataStr = JSON.stringify(j, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `user-${id}-export.json`; a.click(); URL.revokeObjectURL(url);
        setStatus('已导出用户数据');
      } else { const j: any = await res.json().catch(() => ({})); setStatus(j.error || '导出失败'); }
    } catch (e) { console.error(e); setStatus('网络错误'); }
  };

  const saveCfg = async () => {
    const res = await fetch(`${baseUrl}/admin/email-config`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(cfg) });
    if (res.ok) setStatus('Saved'); else setStatus('Failed');
  };

  const saveAuthCfg = async () => {
    const res = await fetch(`${baseUrl}/admin/auth-config`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(authCfg) });
    if (res.ok) setStatus('Saved'); else setStatus('Failed');
  };

  const canEnable2FA = !!user?.totp_enabled;

  return (
    <div className="p-6 max-w-4xl">
      <h2 className="text-xl font-bold mb-4">Admin</h2>
      {users.length === 0 && (
        <div className="mb-4 p-4 rounded bg-yellow-50 dark:bg-yellow-900">
          <div className="font-semibold">未检测到管理员</div>
          <div className="text-sm text-zinc-600">未检测到管理员，请手动在数据库中创建或使用 bootstrap 管理员。</div>
        </div>
      )}
      <section className="mb-6">
        <h3 className="font-semibold mb-2">Users</h3>
        <div className="bg-white dark:bg-zinc-900 p-3 rounded">
          <div className="mb-3 flex items-center gap-3">
            <label className="flex items-center gap-2"><input type="checkbox" checked={showDeleted} onChange={e => { setShowDeleted(e.target.checked); if (e.target.checked) fetchDeletedUsers(); }} /> <span className="text-sm">显示已删除账户</span></label>
          </div>
          {users.map(u => (
            <div key={u.id} className="border-b last:border-b-0 py-2">
              <div className="flex justify-between items-center">
                <div>{u.username} ({u.email})</div>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-zinc-500">{u.verified ? 'verified' : 'unverified'} {u.is_admin ? '· admin' : ''}</div>
                  <button className="py-1 px-2 text-sm bg-zinc-100 rounded" onClick={() => resetPassword(u.id)}>重置密码</button>
                  <button className="py-1 px-2 text-sm bg-zinc-100 rounded" onClick={() => viewRecords(u.id)}>查看记录</button>
                  {user?.is_admin && !u.is_admin && <button className="py-1 px-2 text-sm bg-emerald-100 rounded" onClick={() => promoteUser(u.id)}>提权为管理员</button>}
                  {user?.is_admin && u.is_admin && !u.is_root && <button className="py-1 px-2 text-sm bg-gray-100 rounded" onClick={async () => {
                    if (!confirm('确认将该用户降权为普通用户？')) return;
                    try {
                      const res = await fetch(`${baseUrl}/admin/demote-user`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ userId: u.id }) });
                      if (res.ok) { setStatus('已降权'); fetchUsers(); } else { const j: any = await res.json().catch(() => ({})); setStatus(j.error || '降权失败'); }
                    } catch (e) { console.error(e); setStatus('网络错误'); }
                  }}>降权为普通用户</button>}
                  <button className="py-1 px-2 text-sm bg-yellow-100 rounded" onClick={() => exportUserData(u.id)}>导出数据</button>
                  <button className="py-1 px-2 text-sm bg-red-100 rounded" onClick={() => deleteUser(u.id)}>删除用户</button>
                  <button className="py-1 px-2 text-sm bg-red-200 rounded" onClick={() => hardDeleteUser(u.id)}>永久删除</button>
                </div>
              </div>
              {u._records && (
                <div className="mt-2 text-xs text-zinc-600">
                  <div className="font-medium">最近记录：</div>
                  <div className="space-y-3">
                    {u._records.map((r: any) => {
                      const key = `${u.id}_${r.id}`;
                      const visible = !!visibleRecords[key];
                      return (
                        <div key={r.id} className="p-2 border rounded bg-white/50 dark:bg-zinc-800">
                          <div className="flex justify-between items-center">
                            <div className="text-sm">{r.created_at} · {r.updated_at}</div>
                            <div className="flex gap-2">
                              <button className="py-1 px-2 text-sm bg-zinc-100 rounded" onClick={() => setVisibleRecords(prev => ({ ...prev, [key]: !prev[key] }))}>{visible ? '隐藏' : '显示'}</button>
                            </div>
                          </div>
                          {visible && (
                            <div className="mt-2">
                              {/* If full_backup style record, attempt to simulate and show chart */}
                              {r.data && r.data.__type === 'full_backup' ? (
                                (() => {
                                  const payload = r.data.payload || {};
                                  const events = payload.events || [];
                                  const labResults = payload.labResults || [];
                                  const weight = (payload.weight && Number(payload.weight)) ? Number(payload.weight) : 70;
                                  const sim = runSimulation(events, weight);
                                  const calib = createCalibrationInterpolator(sim, labResults || []);
                                  return sim ? (
                                    <ResultChart sim={sim as any} events={events} labResults={labResults} calibrationFn={calib as any} onPointClick={() => {}} />
                                  ) : (
                                    <div className="text-sm text-zinc-500">无法生成模拟图表（缺少事件）</div>
                                  );
                                })()
                              ) : (
                                <pre className="text-xs overflow-auto max-h-48 p-2 bg-white/80 dark:bg-zinc-900 rounded">{JSON.stringify(r.data, null, 2)}</pre>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {showDeleted && (
        <section className="mb-6">
          <h3 className="font-semibold mb-2">已删除账户</h3>
          <div className="bg-white dark:bg-zinc-900 p-3 rounded">
            {deletedUsers.map(d => (
              <div key={d.id} className="flex justify-between items-center border-b py-2">
                <div>{d.username} ({d.email})</div>
                <div className="flex gap-2">
                  <button className="py-1 px-2 text-sm bg-emerald-100 rounded" onClick={() => restoreUser(d.id)}>恢复</button>
                  <button className="py-1 px-2 text-sm bg-red-200 rounded" onClick={() => hardDeleteUser(d.id)}>永久删除</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-6">
        <h3 className="font-semibold mb-2">验证方式管理</h3>
        <div className="bg-white dark:bg-zinc-900 p-3 rounded space-y-3">
          <div className="text-sm text-zinc-500">可多选启用验证方式；若选择“无验证”，其它验证方式将自动关闭。</div>
          <div className="flex flex-col gap-2">
            <label className={`flex items-center gap-2 ${authCfg.noVerification ? 'opacity-50' : ''}`}>
              <input
                type="checkbox"
                checked={!!authCfg.enableVerification}
                onChange={e => setAuthCfg({ ...authCfg, enableVerification: e.target.checked })}
                disabled={!!authCfg.noVerification}
              />
              <span className="text-sm">邮箱验证</span>
            </label>
            <label className={`flex items-center gap-2 ${authCfg.noVerification ? 'opacity-50' : ''} ${(!canEnable2FA && !authCfg.enable2FA) ? 'opacity-50' : ''}`}>
              <input
                type="checkbox"
                checked={!!authCfg.enable2FA}
                onChange={e => setAuthCfg({ ...authCfg, enable2FA: e.target.checked })}
                disabled={!!authCfg.noVerification || (!canEnable2FA && !authCfg.enable2FA)}
              />
              <span className="text-sm">2FA（TOTP）</span>
            </label>
            {!canEnable2FA && !authCfg.enable2FA && (
              <div className="text-xs text-amber-600">启用 2FA 前，请先在「账户与云同步」里绑定 2FA。</div>
            )}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!authCfg.noVerification}
                onChange={e => {
                  const checked = e.target.checked;
                  setAuthCfg({
                    ...authCfg,
                    noVerification: checked,
                    enableVerification: checked ? false : !!authCfg.enableVerification,
                    enable2FA: checked ? false : !!authCfg.enable2FA,
                  });
                }}
              />
              <span className="text-sm">无验证（管理员登录需环境密钥）</span>
            </label>
          </div>
          {authCfg.noVerification && (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              已启用“无验证”。管理员登录需要环境变量 <code>ADMIN_LOGIN_KEY</code>。
              <div className="mt-2">Windows：在系统环境变量中新增 <code>ADMIN_LOGIN_KEY</code>，重启服务生效。</div>
              <div className="mt-2">Linux（systemd）：服务文件加入 <code>Environment=ADMIN_LOGIN_KEY=你的密钥</code>，然后 <code>systemctl daemon-reload</code> 并重启服务。</div>
            </div>
          )}
          {authCfg.enable2FA && (
            <div className="text-sm text-zinc-500">
              开启 2FA 后，管理员必须先在「账户与云同步」里绑定 2FA 才能登录。
            </div>
          )}
          <div className="flex gap-2 items-center">
            <button className="btn" onClick={saveAuthCfg}>保存</button>
            <div className="text-sm text-zinc-500">{status}</div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="font-semibold mb-2">Email config</h3>
        <div className="bg-white dark:bg-zinc-900 p-3 rounded space-y-2">
          <input className="w-full p-2 border rounded" placeholder="SMTP host" value={cfg.host || ''} onChange={e => setCfg({ ...cfg, host: e.target.value })} />
          <input className="w-full p-2 border rounded" placeholder="SMTP port" value={cfg.port || ''} onChange={e => setCfg({ ...cfg, port: Number(e.target.value) })} />
          <input className="w-full p-2 border rounded" placeholder="SMTP user" value={cfg.auth?.user || ''} onChange={e => setCfg({ ...cfg, auth: { ...(cfg.auth || {}), user: e.target.value } })} />
          <input className="w-full p-2 border rounded" placeholder="SMTP pass" value={cfg.auth?.pass || ''} onChange={e => setCfg({ ...cfg, auth: { ...(cfg.auth || {}), pass: e.target.value } })} />
          <input className="w-full p-2 border rounded" placeholder="from email" value={cfg.from || ''} onChange={e => setCfg({ ...cfg, from: e.target.value })} />
          <div className="flex gap-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!cfg.enableVerification} onChange={e => setCfg({ ...cfg, enableVerification: e.target.checked })} />
              <span className="text-sm">启用邮箱验证</span>
            </label>
            <button className="btn" onClick={saveCfg}>保存</button>
            <div className="text-sm text-zinc-500">{status}</div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Admin;
