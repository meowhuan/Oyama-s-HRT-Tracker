import React, { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../contexts/AuthContext';
import { apiGetRecords, apiPostRecord } from '../utils/api';

const Account: React.FC = () => {
  const { token, login, register, logout, baseUrl, user, refreshUser } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginOtp, setLoginOtp] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [showEmailOnLogin, setShowEmailOnLogin] = useState(false);
  const [showAdminKeyOnLogin, setShowAdminKeyOnLogin] = useState(false);
  const [showOtpOnLogin, setShowOtpOnLogin] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [uploadController, setUploadController] = useState<AbortController | null>(null);
  const [downloadController, setDownloadController] = useState<AbortController | null>(null);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpUrl, setTotpUrl] = useState<string | null>(null);
  const [totpToken, setTotpToken] = useState('');
  const [totpDisableToken, setTotpDisableToken] = useState('');
  const [totpDisablePassword, setTotpDisablePassword] = useState('');
  const [totpBusy, setTotpBusy] = useState(false);

  const handleLogin = async () => {
    setStatus('');
    const res = await login(username, password, adminKey, loginOtp);
    if (!res.ok) setStatus(res.error || '登录失败');
    else setStatus('登录成功');
  };

  // 登录并在检测到服务器备份时提示合并或覆盖
  const handleLoginAndSync = async () => {
    setStatus('');
    const res = await login(username, password, adminKey, loginOtp);
    if (!res.ok) return setStatus(res.error || '登录失败');
    setStatus('登录成功');

    try {
      const recs: any = await apiGetRecords();
      const backups = (recs || []).filter((r: any) => r && r.data && r.data.__type === 'full_backup');
      if (!backups.length) return setStatus('未检测到服务器备份');
      const useOverwrite = window.confirm('检测到服务器上的备份，是否覆盖本地数据？(确定=覆盖，取消=合并)');
      if (useOverwrite) await handleDownloadFull('overwrite');
      else await handleDownloadFull('merge');
    } catch (e) {
      console.error(e);
      setStatus('同步失败');
    }
  };

  useEffect(() => {
    // fetch public config to see which verification methods are enabled
    (async () => {
      try {
        const res = await fetch(`${baseUrl}/auth/config`);
        if (res.ok) {
          const j: any = await res.json().catch(() => ({}));
          setShowEmailOnLogin(!!j.enableVerification);
          setShowAdminKeyOnLogin(!!j.noVerification);
          setShowOtpOnLogin(!!j.enable2FA);
        }
      } catch (e) { /* ignore */ }
    })();
  }, [baseUrl]);

  useEffect(() => {
    setTotpEnabled(!!user?.totp_enabled);
  }, [user?.totp_enabled]);

  const handleRegister = async () => {
    setStatus('');
    const res = await register(username, password, email);
    if (!res.ok) setStatus(res.error || '注册失败');
    else {
      if (showEmailOnLogin) setStatus('注册成功，已发送验证邮件（若已配置 SMTP）');
      else setStatus('注册成功，可直接登录');
    }
  };

  const handleLogout = () => {
    logout();
    setStatus('已登出');
  };

  const handleDeleteAccount = async () => {
    if (!confirm('确认要删除您的账户吗？此操作不可恢复。')) return;
    try {
      const res = await fetch(`${baseUrl}/auth/delete`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        logout();
        setStatus('账户已删除');
      } else {
        const j: any = await res.json().catch(() => ({}));
        setStatus(j.error || '删除失败');
      }
    } catch (e) {
      console.error(e);
      setStatus('网络错误');
    }
  };

  const handleUpload = async () => {
    setStatus('');
    // If server already has backups, ask whether to create new or overwrite
    try {
      const records: any = await apiGetRecords();
      const backups = (records || []).filter((r: any) => r && r.data && r.data.__type === 'full_backup');
      if (backups.length) {
        const choice = window.confirm('服务器上已存在备份。确定要覆盖服务器上的备份？(确定=覆盖并删除旧备份，取消=创建新的备份)');
        if (choice) {
          // delete all server records for this user then upload
          try {
            const delRes = await fetch(`${baseUrl}/api/records/all`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            if (!delRes.ok) { const j: any = await delRes.json().catch(() => ({})); setStatus(j.error || '无法删除服务器备份'); return; }
          } catch (e) { console.error(e); setStatus('网络错误'); return; }
        }
      }
      return await handleUploadFull();
    } catch (e) {
      console.error(e);
      return await handleUploadFull();
    }
  };

  const handleDeleteAllCloud = async () => {
    if (!token) return setStatus('请先登录');
    if (!confirm('确认删除所有云端记录？此操作不可恢复（仅删除你的云端备份）。')) return;
    try {
      const res = await fetch(`${baseUrl}/api/records/all`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setStatus('已删除所有云端记录'); else { const j: any = await res.json().catch(() => ({})); setStatus(j.error || '删除失败'); }
    } catch (e) { console.error(e); setStatus('网络错误'); }
  };

  const handleUploadFull = async () => {
    if (!token) return setStatus('请先登录');
    const controller = new AbortController();
    setUploadController(controller);
    setIsUploading(true);
    try {
      const eventsRaw = localStorage.getItem('hrt-events');
      const labsRaw = localStorage.getItem('hrt-lab-results');
      const weightRaw = localStorage.getItem('hrt-weight');
      const templatesRaw = localStorage.getItem('hrt-dose-templates');

      const payload = {
        meta: { exportedAt: new Date().toISOString() },
        weight: weightRaw ? Number(weightRaw) : null,
        events: eventsRaw ? JSON.parse(eventsRaw) : [],
        labResults: labsRaw ? JSON.parse(labsRaw) : [],
        doseTemplates: templatesRaw ? JSON.parse(templatesRaw) : []
      };

      const record = { __type: 'full_backup', payload };
      const resp = await fetch(`${baseUrl}/api/records`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ data: record }), signal: controller.signal });
      if (!resp.ok) {
        const j: any = await resp.json().catch(() => ({}));
        setStatus(j.error || '上传失败');
      } else {
        setStatus('上传备份完成');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') setStatus('上传已取消'); else { console.error(err); setStatus('上传失败'); }
    } finally {
      setIsUploading(false);
      setUploadController(null);
    }
  };

  const handleDownloadFull = async (mode: 'merge' | 'overwrite') => {
    if (!token) return setStatus('请先登录');
    const controller = new AbortController();
    setDownloadController(controller);
    setIsDownloading(true);
    try {
      const res = await fetch(`${baseUrl}/api/records`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: controller.signal });
      if (!res.ok) { setStatus('下载失败'); return; }
      const records: any = await res.json();
      const backups = (records || []).filter((r: any) => r && r.data && r.data.__type === 'full_backup');
      if (!backups.length) return setStatus('服务器无备份');
      const sorted = backups.sort((a: any, b: any) => {
        const ta = a.data.payload?.meta?.exportedAt || a.created_at || 0;
        const tb = b.data.payload?.meta?.exportedAt || b.created_at || 0;
        return new Date(tb).getTime() - new Date(ta).getTime();
      });
      const latest = sorted[0].data.payload;
      if (!latest) return setStatus('备份格式不正确');

      if (mode === 'overwrite') {
        localStorage.setItem('hrt-events', JSON.stringify(latest.events || []));
        localStorage.setItem('hrt-lab-results', JSON.stringify(latest.labResults || []));
        if (latest.weight !== null && latest.weight !== undefined) localStorage.setItem('hrt-weight', String(latest.weight));
        localStorage.setItem('hrt-dose-templates', JSON.stringify(latest.doseTemplates || []));
        window.dispatchEvent(new Event('hrt-data-updated'));
        setStatus('已覆盖本地数据');
        return;
      }

      // merge
      const localEvents = JSON.parse(localStorage.getItem('hrt-events') || '[]');
      const localLabs = JSON.parse(localStorage.getItem('hrt-lab-results') || '[]');
      const localTemplates = JSON.parse(localStorage.getItem('hrt-dose-templates') || '[]');

      const mapEv: Record<string, any> = {};
      localEvents.forEach((e: any) => { if (!e.id) e.id = uuidv4(); mapEv[e.id] = e; });
      (latest.events || []).forEach((e: any) => { if (!e.id) e.id = uuidv4(); if (!mapEv[e.id]) mapEv[e.id] = e; });
      const mergedEvents = Object.values(mapEv);

      const mapLab: Record<string, any> = {};
      localLabs.forEach((l: any) => { if (!l.id) l.id = uuidv4(); mapLab[l.id] = l; });
      (latest.labResults || []).forEach((l: any) => { if (!l.id) l.id = uuidv4(); if (!mapLab[l.id]) mapLab[l.id] = l; });
      const mergedLabs = Object.values(mapLab);

      const mapTpl: Record<string, any> = {};
      localTemplates.forEach((t: any) => { if (!t.id) t.id = uuidv4(); mapTpl[t.id] = t; });
      (latest.doseTemplates || []).forEach((t: any) => { if (!t.id) t.id = uuidv4(); if (!mapTpl[t.id]) mapTpl[t.id] = t; });
      const mergedTemplates = Object.values(mapTpl);

      const localWeight = localStorage.getItem('hrt-weight');
      const finalWeight = (localWeight && Number(localWeight) > 0) ? Number(localWeight) : (latest.weight || 70);

      localStorage.setItem('hrt-events', JSON.stringify(mergedEvents));
      localStorage.setItem('hrt-lab-results', JSON.stringify(mergedLabs));
      localStorage.setItem('hrt-dose-templates', JSON.stringify(mergedTemplates));
      localStorage.setItem('hrt-weight', String(finalWeight));
      window.dispatchEvent(new Event('hrt-data-updated'));
      setStatus('合并完成');
    } catch (err) {
      if ((err as any).name === 'AbortError') setStatus('下载已取消'); else { console.error(err); setStatus('下载失败'); }
    } finally {
      setIsDownloading(false);
      setDownloadController(null);
    }
  };

  const cancelUpload = () => {
    if (uploadController) uploadController.abort();
  };

  const cancelDownload = () => {
    if (downloadController) downloadController.abort();
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow p-6">
        <h2 className="text-xl font-bold mb-2">账户与云同步</h2>
        <p className="text-sm text-zinc-500 mb-4">登录后可将本地数据备份到服务器，或从服务器拉取并合并。</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <input placeholder="用户名" className="p-3 border rounded bg-transparent" value={username} onChange={e => setUsername(e.target.value)} />
          {showEmailOnLogin && <input placeholder="邮箱" className="p-3 border rounded bg-transparent" value={email} onChange={e => setEmail(e.target.value)} />}
          <input placeholder="密码" type="password" className="p-3 border rounded bg-transparent" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        {showAdminKeyOnLogin && (
          <div className="mb-3">
            <input placeholder="管理员密钥（仅管理员需要）" className="p-3 border rounded bg-transparent w-full" value={adminKey} onChange={e => setAdminKey(e.target.value)} />
          </div>
        )}
        {showOtpOnLogin && (
          <div className="mb-3">
            <input placeholder="2FA 验证码（已开启 2FA 时填写）" className="p-3 border rounded bg-transparent w-full" value={loginOtp} onChange={e => setLoginOtp(e.target.value)} />
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          <button className="py-2 px-4 rounded-full bg-zinc-900 text-white font-bold" onClick={handleLoginAndSync}>登录并同步</button>
          <button className="py-2 px-4 rounded-full bg-zinc-700 text-white" onClick={handleRegister}>注册</button>
          <button className="py-2 px-4 rounded-full bg-zinc-300 text-zinc-900" onClick={handleLogout}>登出</button>
          <button className="py-2 px-4 rounded-full bg-red-100 text-red-800" onClick={handleDeleteAccount}>删除账户</button>
        </div>

        {user && (
          <div className="mb-4 p-3 border rounded bg-zinc-50 dark:bg-zinc-800">
            已登录为 <strong>{user.username}</strong>
            <div className="text-sm text-zinc-500">{user.email} · {user.verified ? '已验证' : '未验证'}</div>
          </div>
        )}

        {user && showOtpOnLogin && (
          <div className="mb-4 p-3 border rounded bg-white/50 dark:bg-zinc-800">
            <h3 className="font-semibold mb-2">两步验证（2FA）</h3>
            <div className="text-sm text-zinc-500 mb-2">当前状态：{totpEnabled ? '已启用' : '未启用'}</div>

            {!totpEnabled && (
              <div className="space-y-3">
                <button
                  className="py-2 px-4 rounded-full bg-emerald-600 text-white"
                  disabled={totpBusy}
                  onClick={async () => {
                    setTotpBusy(true);
                    setStatus('');
                    try {
                      const resp = await fetch(`${baseUrl}/auth/totp/setup`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
                      const j: any = await resp.json().catch(() => ({}));
                      if (!resp.ok) return setStatus(j.error || '2FA 设置失败');
                      setTotpSecret(j.secret);
                      setTotpUrl(j.otpauthUrl);
                      setStatus('请扫描二维码并输入验证码完成绑定');
                    } catch (e) {
                      console.error(e);
                      setStatus('网络错误');
                    } finally {
                      setTotpBusy(false);
                    }
                  }}
                >开始绑定 2FA</button>

                {totpUrl && (
                  <div className="p-3 border rounded bg-white dark:bg-zinc-900">
                    <div className="mb-2 text-sm text-zinc-500">使用验证器扫描二维码：</div>
                    <QRCodeCanvas value={totpUrl} size={180} />
                    {totpSecret && <div className="mt-2 text-xs text-zinc-500">密钥：{totpSecret}</div>}
                    <div className="mt-3 flex gap-2">
                      <input placeholder="6 位验证码" className="p-2 border rounded flex-1" value={totpToken} onChange={e => setTotpToken(e.target.value)} />
                      <button
                        className="py-2 px-4 rounded-full bg-zinc-900 text-white"
                        disabled={totpBusy}
                        onClick={async () => {
                          setTotpBusy(true);
                          setStatus('');
                          try {
                            const resp = await fetch(`${baseUrl}/auth/totp/enable`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                              body: JSON.stringify({ token: totpToken })
                            });
                            const j: any = await resp.json().catch(() => ({}));
                            if (!resp.ok) return setStatus(j.error || '开启失败');
                            setTotpEnabled(true);
                            setTotpSecret(null);
                            setTotpUrl(null);
                            setTotpToken('');
                            await refreshUser();
                            setStatus('2FA 已启用');
                          } catch (e) {
                            console.error(e);
                            setStatus('网络错误');
                          } finally {
                            setTotpBusy(false);
                          }
                        }}
                      >确认启用</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {totpEnabled && (
              <div className="space-y-2">
                <div className="text-sm text-zinc-500">关闭 2FA 需要当前密码与验证码。</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input placeholder="当前密码" type="password" className="p-2 border rounded" value={totpDisablePassword} onChange={e => setTotpDisablePassword(e.target.value)} />
                  <input placeholder="6 位验证码" className="p-2 border rounded" value={totpDisableToken} onChange={e => setTotpDisableToken(e.target.value)} />
                </div>
                <button
                  className="py-2 px-4 rounded-full bg-red-600 text-white"
                  disabled={totpBusy}
                  onClick={async () => {
                    setTotpBusy(true);
                    setStatus('');
                    try {
                      const resp = await fetch(`${baseUrl}/auth/totp/disable`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ currentPassword: totpDisablePassword, token: totpDisableToken })
                      });
                      const j: any = await resp.json().catch(() => ({}));
                      if (!resp.ok) return setStatus(j.error || '关闭失败');
                      setTotpEnabled(false);
                      setTotpDisablePassword('');
                      setTotpDisableToken('');
                      await refreshUser();
                      setStatus('2FA 已关闭');
                    } catch (e) {
                      console.error(e);
                      setStatus('网络错误');
                    } finally {
                      setTotpBusy(false);
                    }
                  }}
                >关闭 2FA</button>
              </div>
            )}
          </div>
        )}

        {user && (
          <div className="mb-4 p-3 border rounded bg-white/50 dark:bg-zinc-800">
            <h3 className="font-semibold mb-2">修改密码</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
              <input placeholder="当前密码" type="password" className="p-2 border rounded" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
              <input placeholder="新密码" type="password" className="p-2 border rounded" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              <input placeholder="确认新密码" type="password" className="p-2 border rounded" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button className="py-2 px-4 rounded-full bg-emerald-600 text-white" onClick={async () => {
                if (!currentPassword || !newPassword) return setStatus('请输入当前密码和新密码');
                if (newPassword !== confirmNewPassword) return setStatus('两次新密码输入不一致');
                try {
                  const res = await fetch(`${baseUrl}/auth/change-password`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ currentPassword, newPassword }) });
                  if (res.ok) { setStatus('密码修改成功'); setCurrentPassword(''); setNewPassword(''); setConfirmNewPassword(''); }
                  else { const j: any = await res.json().catch(() => ({})); setStatus(j.error || '修改失败'); }
                } catch (e) { console.error(e); setStatus('网络错误'); }
              }}>提交修改</button>
              <div className="text-sm text-zinc-500">修改密码会立即生效。</div>
            </div>
          </div>
        )}

        {showEmailOnLogin && (
          <div className="mb-4">
            <button className="py-2 px-4 rounded-full bg-zinc-200" onClick={async () => {
              if (!email) return setStatus('请输入注册时使用的邮箱以重发验证邮件');
              try {
                const resp = await fetch(`${baseUrl}/auth/resend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
                if (resp.ok) setStatus('已重发验证邮件'); else setStatus('重发失败');
              } catch (e) { setStatus('网络错误'); }
            }}>重发验证邮件</button>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-2 mb-4">
          <div className="flex items-center gap-2">
            <button className="py-2 px-4 rounded-full bg-emerald-600 text-white" onClick={handleUpload} disabled={isUploading}>上传本地数据到服务器（备份）</button>
            {isUploading && <button className="py-2 px-4 rounded-full bg-zinc-200" onClick={cancelUpload}>取消上传</button>}
          </div>
          <div className="flex gap-2">
            <button className="py-2 px-4 rounded-full bg-sky-600 text-white" onClick={() => handleDownloadFull('merge')} disabled={isDownloading}>从服务器下载并合并</button>
            <button className="py-2 px-4 rounded-full bg-red-600 text-white" onClick={() => handleDownloadFull('overwrite')} disabled={isDownloading}>从服务器下载并覆盖</button>
            {isDownloading && <button className="py-2 px-4 rounded-full bg-zinc-200" onClick={cancelDownload}>取消下载</button>}
          </div>
          <div className="flex items-center">
            <button className="py-2 px-4 rounded-full bg-red-200 text-red-800" onClick={handleDeleteAllCloud}>删除所有云端记录</button>
          </div>
        </div>

        {status && <div className="text-sm text-zinc-600">{status}</div>}
      </div>
    </div>
  );
};

export default Account;
