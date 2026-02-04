import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const Setup: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const { mode, setMode, dbType, setDbType } = useAuth();

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

      <div className="flex gap-2">
        <button className="btn" onClick={() => onClose && onClose()}>完成</button>
      </div>
    </div>
  );
};

export default Setup;
