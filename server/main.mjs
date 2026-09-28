import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { loadConfig } from './config.mjs';
import { openDatabase } from './db.mjs';
import { createApp } from './app.mjs';
import { sweepExpired } from './auth.mjs';

function fail(message) {
  console.error(`Crumb cannot start: ${message}`);
  process.exit(1);
}

let config;
let db;
try {
  config = loadConfig(process.env);
  mkdirSync(config.dataDir, { recursive: true });
  // Migrations run here, before the port opens.
  db = openDatabase(config.dbPath);
} catch (error) {
  fail(error.message);
}

const clock = () => Date.now();
const server = createServer(createApp({ db, config, clock }));
server.listen(config.port, config.host, () => {
  console.log(`Crumb is listening on ${config.host}:${config.port} and serving ${config.publicOrigin}`);
});
server.on('error', error => fail(error.message));

const sweep = setInterval(() => {
  try {
    sweepExpired(db, clock);
  } catch (error) {
    console.error(`[crumb] cleanup skipped: ${error.message}`);
  }
}, 10 * 60 * 1000);
sweep.unref();

let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received; finishing open requests.`);
  clearInterval(sweep);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
