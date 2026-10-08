// Unit tests for the desktop shell's pure logic (node --test, compiled dist/).
// The full install flow (initdb → service → migrations → backup) is
// exercised separately against real PostgreSQL — see apps/desktop/README.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, utimesSync, readdirSync, readFileSync, existsSync, statSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createServer } = require('node:net');

const config = require('../dist/shared/config');
const { buildApiEnv } = require('../dist/shared/api-env');
const { dataPaths, resourcePaths } = require('../dist/shared/paths');
const { PgTools, rotateBackups, latestBackupTime, quoteIdent, quoteLiteral } = require('../dist/shared/postgres');

test('every install gets its own secrets', () => {
  const a = config.createInitialConfig({ version: '1.0.0', dbPort: 1, apiPort: 2 });
  const b = config.createInitialConfig({ version: '1.0.0', dbPort: 1, apiPort: 2 });
  assert.notEqual(a.database.password, b.database.password);
  assert.notEqual(a.secrets.jwtAccessSecret, b.secrets.jwtAccessSecret);
  assert.ok(a.secrets.jwtAccessSecret.length >= 48);
  assert.equal(Buffer.from(a.secrets.secretsEncryptionKey, 'base64').length, 32);
  assert.equal(a.api.lanAccess, false, 'network access is off until the owner turns it on');
});

test('database URL escapes credentials', () => {
  const c = config.createInitialConfig({ version: '1', dbPort: 5555, apiPort: 1 });
  c.database.password = 'p@ss/word';
  assert.equal(config.databaseUrl(c), 'postgresql://erp_app:p%40ss%2Fword@127.0.0.1:5555/erp_desktop');
});

test('config round-trips through an atomic write', () => {
  const root = mkdtempSync(join(tmpdir(), 'erp-cfg-'));
  const c = config.createInitialConfig({ version: '2.0.0', dbPort: 1, apiPort: 2 });
  config.saveConfig(root, c);
  assert.deepEqual(config.loadConfig(root), c);
  assert.equal(existsSync(`${config.configPath(root)}.tmp`), false);
  assert.equal(config.loadConfig(join(root, 'missing')), null);
});

test('findFreePort skips a busy port', async () => {
  const server = createServer().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const busy = server.address().port;
  assert.equal(await config.isPortFree(busy), false);
  const port = await config.findFreePort(busy);
  assert.notEqual(port, busy);
  server.close();
});

test('API env: desktop mode, local storage, LAN toggle controls the bind address', () => {
  const c = config.createInitialConfig({ version: '1', dbPort: 54329, apiPort: 47821 });
  const opts = { config: c, data: dataPaths('/data'), resources: resourcePaths('/res'), appVersion: '1.2.3' };
  const env = buildApiEnv(opts);
  assert.equal(env.DEPLOY_MODE, 'desktop');
  assert.equal(env.HOST, '127.0.0.1');
  assert.equal(env.COOKIE_SECURE, 'false');
  assert.equal(env.STORAGE_DRIVER, 'local');
  assert.equal(env.STORAGE_LOCAL_PATH, join('/data', 'files'));
  assert.equal(env.WEB_DIST_PATH, join('/res', 'web'));
  assert.equal(env.APP_VERSION, '1.2.3');
  c.api.lanAccess = true;
  assert.equal(buildApiEnv(opts).HOST, '0.0.0.0');
});

test('cluster settings are written once and included once', () => {
  const pgData = mkdtempSync(join(tmpdir(), 'erp-pg-'));
  writeFileSync(join(pgData, 'postgresql.conf'), '# stock\n');
  PgTools.writeClusterSettings(pgData, 54330);
  PgTools.writeClusterSettings(pgData, 54331);
  const main = readFileSync(join(pgData, 'postgresql.conf'), 'utf8');
  assert.equal(main.match(/include_if_exists/g).length, 1);
  const ours = readFileSync(join(pgData, 'erp-desktop.conf'), 'utf8');
  assert.match(ours, /port = 54331/);
  assert.match(ours, /listen_addresses = '127\.0\.0\.1'/);
});

test('backup rotation keeps the newest N of one kind only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'erp-bk-'));
  for (let i = 0; i < 5; i += 1) {
    const f = join(dir, `daily-2026010${i}-000000.dump`);
    writeFileSync(f, 'x');
    utimesSync(f, new Date(2026, 0, i + 1), new Date(2026, 0, i + 1));
  }
  writeFileSync(join(dir, 'pre-update-20260101-000000.dump'), 'x');
  const removed = rotateBackups(dir, 'daily', 2);
  assert.equal(removed.length, 3);
  const left = readdirSync(dir).sort();
  assert.deepEqual(left, ['daily-20260103-000000.dump', 'daily-20260104-000000.dump', 'pre-update-20260101-000000.dump']);
  assert.equal(latestBackupTime(dir, 'daily'), statSync(join(dir, 'daily-20260104-000000.dump')).mtimeMs);
  assert.equal(latestBackupTime(join(dir, 'none'), 'daily'), null);
});

test('SQL quoting', () => {
  assert.equal(quoteIdent('a"b'), '"a""b"');
  assert.equal(quoteLiteral("it's"), "'it''s'");
});
