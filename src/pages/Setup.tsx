import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const Setup: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { mode, setMode, dbType, setDbType, baseUrl, setBaseUrl, user } = useAuth();
  const [inputUrl, setInputUrl] = useState<string>(baseUrl || '');
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null);

  useEffect(() => { setInputUrl(baseUrl || ''); }, [baseUrl]);

  // Auto-detect a sensible backend address based on current location
  useEffect(() => {
    try {
      const { protocol, hostname } = window.location;
      // prefer same host with default backend port 4000
      let guess = `${protocol}//${hostname}`;
      if (!/:(\d+)$/.test(window.location.host)) guess = `${guess}:4000`;
      setDetectedUrl(guess);
    } catch (e) { setDetectedUrl(null); }
  }, []);

  const applyDetected = () => { if (detectedUrl) setInputUrl(detectedUrl); };

  const saveBaseUrl = () => {
    // only allow admins to change base URL
    if (user && (user as any).is_admin !== true) return;
    setBaseUrl(inputUrl.trim());
  };

  return (
    <div className="p-6 max-w-3xl">
      <h2 className="text-xl font-bold mb-4">安装向导</h2>
      <div className="mb-4">
        <label className="block font-semibold mb-2">后端模式</label>
        <div className="flex gap-3">
          <button className={`px-3 py-2 border rounded ${mode === 'embedded' ? 'bg-zinc-900 text-white' : ''}`} onClick={() => setMode('embedded')}>内置（同机运行）</button>
          <button className={`px-3 py-2 border rounded ${mode === 'remote' ? 'bg-zinc-900 text-white' : ''}`} onClick={() => setMode('remote')}>远程（使用服务器）</button>
        </div>
        <p className="text-sm text-zinc-500 mt-2">内置模式假设你会在本地或同一主机运行后端；远程模式允许连接自定义后端。</p>
      </div>

      <div className="mb-4">
        <label className="block font-semibold mb-2">数据库类型</label>
        <div className="flex gap-3">
          <button className={`px-3 py-2 border rounded ${dbType === 'sqlite' ? 'bg-zinc-900 text-white' : ''}`} onClick={() => setDbType('sqlite')}>SQLite（单文件）</button>
          <button className={`px-3 py-2 border rounded ${dbType === 'postgres' ? 'bg-zinc-900 text-white' : ''}`} onClick={() => setDbType('postgres')}>Postgres（网络 DB）</button>
        </div>
        <p className="text-sm text-zinc-500 mt-2">SQLite 简单易用；Postgres 适合远程/多用户部署。</p>
      </div>

      {mode === 'remote' && (
        <div className="mb-4">
          <label className="block font-semibold mb-2">后端地址</label>
          <div className="flex gap-2 items-center">
            <input className="flex-1 px-3 py-2 border rounded" value={inputUrl} onChange={e => setInputUrl(e.target.value)} disabled={!!user && (user as any).is_admin !== true} />
            <button className="px-3 py-2 border rounded" onClick={applyDetected} type="button">使用检测地址</button>
            <button className="px-3 py-2 bg-zinc-900 text-white rounded" onClick={saveBaseUrl} disabled={!!user && (user as any).is_admin !== true}>保存</button>
          </div>
          {detectedUrl && <p className="text-sm text-zinc-500 mt-2">检测到：{detectedUrl}</p>}
          {user && (user as any).is_admin !== true && <p className="text-sm text-amber-600 mt-2">仅管理员可以修改后端地址。</p>}
        </div>
      )}

      <div className="flex gap-2">
        <button className="btn" onClick={() => onClose && onClose()}>完成</button>
      </div>
    </div>
  );
};

export default Setup;
