const Database = require('better-sqlite3');
const path = require('path');
const { loadSetupConfig } = require('./setup_config');

const cfg = loadSetupConfig();
const dbType = (cfg.dbType || 'sqlite').toLowerCase();

let sqliteDb = null;
let pgPool = null;
let mysqlPool = null;

const normalizeParams = (params) => Array.isArray(params) ? params : [];

const toPgSql = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

const ensureSqlite = () => {
  if (!sqliteDb) {
    const dbPath = cfg.dbPath || path.join(__dirname, '..', 'data.db');
    sqliteDb = new Database(dbPath);
  }
};

const ensurePg = () => {
  if (!pgPool) {
    const { Pool } = require('pg');
    pgPool = new Pool({
      host: cfg.dbHost || '127.0.0.1',
      port: cfg.dbPort ? Number(cfg.dbPort) : 5432,
      user: cfg.dbUser || 'postgres',
      password: cfg.dbPassword || '',
      database: cfg.dbName || 'hrt_tracker',
    });
  }
};

const ensureMysql = () => {
  if (!mysqlPool) {
    const mysql = require('mysql2/promise');
    mysqlPool = mysql.createPool({
      host: cfg.dbHost || '127.0.0.1',
      port: cfg.dbPort ? Number(cfg.dbPort) : 3306,
      user: cfg.dbUser || 'root',
      password: cfg.dbPassword || '',
      database: cfg.dbName || 'hrt_tracker',
      waitForConnections: true,
      connectionLimit: 5,
    });
  }
};

const ensureInsertReturningId = (sql) => {
  if (/^\s*insert/i.test(sql) && !/returning\s+id/i.test(sql)) {
    return `${sql} RETURNING id`;
  }
  return sql;
};

const run = async (sql, params = []) => {
  const p = normalizeParams(params);
  if (dbType === 'postgres') {
    ensurePg();
    const text = ensureInsertReturningId(toPgSql(sql));
    const res = await pgPool.query(text, p);
    return {
      changes: res.rowCount || 0,
      lastInsertRowid: res.rows && res.rows[0] ? res.rows[0].id : undefined,
    };
  }
  if (dbType === 'mysql') {
    ensureMysql();
    const [res] = await mysqlPool.execute(sql, p);
    return {
      changes: res.affectedRows || 0,
      lastInsertRowid: res.insertId,
    };
  }
  ensureSqlite();
  const info = sqliteDb.prepare(sql).run(p);
  return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
};

const get = async (sql, params = []) => {
  const p = normalizeParams(params);
  if (dbType === 'postgres') {
    ensurePg();
    const res = await pgPool.query(toPgSql(sql), p);
    return res.rows && res.rows[0] ? res.rows[0] : undefined;
  }
  if (dbType === 'mysql') {
    ensureMysql();
    const [rows] = await mysqlPool.execute(sql, p);
    return rows && rows[0] ? rows[0] : undefined;
  }
  ensureSqlite();
  return sqliteDb.prepare(sql).get(p);
};

const all = async (sql, params = []) => {
  const p = normalizeParams(params);
  if (dbType === 'postgres') {
    ensurePg();
    const res = await pgPool.query(toPgSql(sql), p);
    return res.rows || [];
  }
  if (dbType === 'mysql') {
    ensureMysql();
    const [rows] = await mysqlPool.execute(sql, p);
    return rows || [];
  }
  ensureSqlite();
  return sqliteDb.prepare(sql).all(p);
};

const exec = async (sql) => {
  if (dbType === 'postgres') {
    ensurePg();
    await pgPool.query(sql);
    return;
  }
  if (dbType === 'mysql') {
    ensureMysql();
    await mysqlPool.query(sql);
    return;
  }
  ensureSqlite();
  sqliteDb.exec(sql);
};

module.exports = {
  type: dbType,
  run,
  get,
  all,
  exec,
};
