import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiCompleteSetup, apiGetSetupStatus, apiTestSetupConnection, SetupStatus } from '../utils/api';

type SetupProps = {
  onClose?: () => void;
  required?: boolean;
  onCompleted?: () => void;
};

const Setup: React.FC<SetupProps> = ({ onClose, required = false, onCompleted }) => {
  const { mode, setMode, dbType, setDbType, baseUrl, setBaseUrl } = useAuth();
  const [inputUrl, setInputUrl] = useState<string>(baseUrl || '');
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null);
  const [storedUrl, setStoredUrl] = useState<string>('');
  const [currentOrigin, setCurrentOrigin] = useState<string>('');
  const [dbPath, setDbPath] = useState<string>('');
  const [dbHost, setDbHost] = useState<string>('');
  const [dbPort, setDbPort] = useState<string>('');
  const [dbUser, setDbUser] = useState<string>('');
  const [dbPassword, setDbPassword] = useState<string>('');
  const [dbName, setDbName] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => { setInputUrl(baseUrl || ''); }, [baseUrl]);

  useEffect(() => {
    try {
      setStoredUrl(localStorage.getItem('hrt-backend-url') || '');
      setCurrentOrigin(window.location.origin || '');
    } catch (e) {
      setStoredUrl('');
      setCurrentOrigin('');
    }
  }, []);

  // Auto-detect a sensible backend address based on current location
  useEffect(() => {
    try {
      const { protocol, host } = window.location;
      let guess = `${protocol}//${host}`;
      if (!/:(\d+)$/.test(host)) guess = `${protocol}//${window.location.hostname}:4000`;
      setDetectedUrl(guess);
    } catch (e) { setDetectedUrl(null); }
  }, []);

  const applyDetected = () => { if (detectedUrl) setInputUrl(detectedUrl); };
  const applyCurrentOrigin = () => { if (currentOrigin) setInputUrl(currentOrigin); };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const status: SetupStatus = await apiGetSetupStatus(inputUrl || baseUrl);
        if (!mounted) return;
        if (status?.dbType) setDbType(status.dbType);
        if (status?.dbPath) setDbPath(status.dbPath);
        if (status?.dbHost) setDbHost(status.dbHost);
        if (status?.dbPort) setDbPort(String(status.dbPort));
        if (status?.dbUser) setDbUser(status.dbUser);
        if (status?.dbName) setDbName(status.dbName);
      } catch (e) {
        if (mounted) setError('无法连接后端，稍后再试。');
      }
    })();
    return () => { mounted = false; };
  }, [baseUrl]);

  const isStoredLocalhost = useMemo(() => /localhost|127\.0\.0\.1/i.test(storedUrl || ''), [storedUrl]);
  const isCurrentLocalhost = useMemo(() => /localhost|127\.0\.0\.1/i.test(currentOrigin || ''), [currentOrigin]);
  const shouldWarnBaseUrl = useMemo(() => !!storedUrl && isStoredLocalhost && !isCurrentLocalhost, [storedUrl, isStoredLocalhost, isCurrentLocalhost]);

  const canEditBaseUrl = useMemo(() => mode === 'remote', [mode]);

  const handleComplete = async () => {
    setSaving(true);
    setError(null);
    setTestResult(null);
    try {
      const url = inputUrl.trim();
      if (url) setBaseUrl(url);
      await apiCompleteSetup({
        dbType,
        dbPath: dbPath || undefined,
        dbHost: dbHost || undefined,
        dbPort: dbPort ? Number(dbPort) : undefined,
        dbUser: dbUser || undefined,
        dbPassword: dbPassword || undefined,
        dbName: dbName || undefined
      }, url || baseUrl);
      onCompleted && onCompleted();
      if (onClose) onClose();
    } catch (e: any) {
      setError(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      const url = inputUrl.trim();
      await apiTestSetupConnection({
        dbType,
        dbPath: dbPath || undefined,
        dbHost: dbHost || undefined,
        dbPort: dbPort ? Number(dbPort) : undefined,
        dbUser: dbUser || undefined,
        dbPassword: dbPassword || undefined,
        dbName: dbName || undefined
      }, url || baseUrl);
      setTestResult('连接成功');
    } catch (e: any) {
      setTestResult(e?.message || '连接失败');
    } finally {
      setTesting(false);
    }
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
          <button className={`px-3 py-2 border rounded ${dbType === 'postgres' ? 'bg-zinc-900 text-white' : ''}`} onClick={() => setDbType('postgres')}>Postgres</button>
          <button className={`px-3 py-2 border rounded ${dbType === 'mysql' ? 'bg-zinc-900 text-white' : ''}`} onClick={() => setDbType('mysql')}>MySQL</button>
        </div>
        <p className="text-sm text-zinc-500 mt-2">可选择本地 SQLite，或配置远程数据库（Postgres / MySQL）。</p>
      </div>

      {dbType === 'sqlite' && (
        <div className="mb-4">
          <label className="block font-semibold mb-2">数据库文件路径（SQLite）</label>
          <input
            className="w-full px-3 py-2 border rounded"
            value={dbPath}
            onChange={e => setDbPath(e.target.value)}
            placeholder="例如：C:\\data\\hrt\\data.db"
          />
          <p className="text-sm text-zinc-500 mt-2">留空将使用后端默认路径。</p>
        </div>
      )}

      {(dbType === 'postgres' || dbType === 'mysql') && (
        <div className="mb-4 space-y-3">
          <div>
            <label className="block font-semibold mb-2">数据库主机</label>
            <input className="w-full px-3 py-2 border rounded" value={dbHost} onChange={e => setDbHost(e.target.value)} placeholder="例如：127.0.0.1" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-2">端口</label>
              <input className="w-full px-3 py-2 border rounded" value={dbPort} onChange={e => setDbPort(e.target.value)} placeholder={dbType === 'postgres' ? '5432' : '3306'} />
            </div>
            <div>
              <label className="block font-semibold mb-2">数据库名</label>
              <input className="w-full px-3 py-2 border rounded" value={dbName} onChange={e => setDbName(e.target.value)} placeholder="例如：hrt_tracker" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-2">用户名</label>
              <input className="w-full px-3 py-2 border rounded" value={dbUser} onChange={e => setDbUser(e.target.value)} placeholder={dbType === 'postgres' ? 'postgres' : 'root'} />
            </div>
            <div>
              <label className="block font-semibold mb-2">密码</label>
              <input type="password" className="w-full px-3 py-2 border rounded" value={dbPassword} onChange={e => setDbPassword(e.target.value)} placeholder="可选" />
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <label className="block font-semibold mb-2">后端地址</label>
        <div className="flex gap-2 items-center">
          <input className="flex-1 px-3 py-2 border rounded" value={inputUrl} onChange={e => setInputUrl(e.target.value)} disabled={!canEditBaseUrl} />
          <button className="px-3 py-2 border rounded" onClick={applyDetected} type="button">使用检测地址</button>
        </div>
        {detectedUrl && <p className="text-sm text-zinc-500 mt-2">检测到：{detectedUrl}</p>}
        {shouldWarnBaseUrl && currentOrigin && (
          <div className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 flex items-center justify-between gap-2">
            <span>检测到已保存的后端地址为本机 {storedUrl}，但当前域名是 {currentOrigin}。这会导致无法连接后端。</span>
            <button className="px-2 py-1 border rounded" onClick={applyCurrentOrigin} type="button">改用当前域名</button>
          </div>
        )}
        {!canEditBaseUrl && <p className="text-sm text-amber-600 mt-2">内置模式下后端地址不可修改。</p>}
      </div>

      {error && (
        <div className="mb-4 text-sm text-amber-600">{error}</div>
      )}
      {testResult && (
        <div className="mb-4 text-sm text-zinc-600">{testResult}</div>
      )}

      <div className="flex gap-2">
        {!required && <button className="btn" onClick={() => onClose && onClose()} disabled={saving}>取消</button>}
        <button className="btn" onClick={handleTestConnection} disabled={testing || saving}>{testing ? '测试中...' : '连接测试'}</button>
        <button className="btn" onClick={handleComplete} disabled={saving || testing}>{saving ? '保存中...' : '完成并保存'}</button>
      </div>
    </div>
  );
};

export default Setup;
