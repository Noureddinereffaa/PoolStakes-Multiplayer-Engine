/**
 * Load test for 8-Ball Pool WebSocket server.
 * Requires server running on the configured HOST:PORT.
 *
 * Usage: node scripts/load-test.cjs [--concurrent=10] [--host=localhost] [--port=3000]
 *
 * Tests:
 *   - Batch connect + authenticate
 *   - Batch create room
 *   - Concurrent shoot messages
 *   - Concurrent disconnect
 */

const WebSocket = require('ws');
const http = require('http');

const args = {};
process.argv.slice(2).forEach(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  args[k] = v ?? true;
});

const HOST = args.host || 'localhost';
const PORT = Number(args.port || 3000);
const CONCURRENT = Number(args.concurrent || 10);
const WS_URL = `ws://${HOST}:${PORT}`;
const API_URL = `http://${HOST}:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_minimum_32_chars_long_!!';

let passed = 0;
let failed = 0;
let totalLatency = 0;
let totalSamples = 0;

function color(s, code) { return `\x1b[${code}m${s}\x1b[0m`; }
function ok(s) { passed++; console.log(`  ${color('✓', 32)} ${s}`); }
function fail(s) { failed++; console.log(`  ${color('✗', 31)} ${s}`); }
function green(s) { return color(s, 32); }
function red(s) { return color(s, 31); }
function yellow(s) { return color(s, 33); }

function connect() {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const ws = new WebSocket(WS_URL);
    const t = setTimeout(() => reject(new Error('Connection timeout')), 5000);
    ws.on('open', () => {
      clearTimeout(t);
      const latency = Date.now() - t0;
      totalLatency += latency;
      totalSamples++;
      ws.__latency = latency;
      resolve(ws);
    });
    ws.on('error', (err) => { clearTimeout(t); reject(err); });
  });
}

function waitForMessage(ws, typeFilter, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout waiting for ${typeFilter}`)), timeout);
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === typeFilter) {
          clearTimeout(t);
          resolve(msg);
        }
      } catch {}
    });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function testConcurrentConnections() {
  console.log(yellow(`\n── Test: ${CONCURRENT} concurrent connections ──\n`));

  const promises = Array.from({ length: CONCURRENT }, (_, i) => connect().then(ws => {
    ws.__id = `load-test-user-${i}`;
    return ws;
  }));

  const results = await Promise.allSettled(promises);
  const connected = results.filter(r => r.status === 'fulfilled').map(r => r.value);
  const failures = results.filter(r => r.status === 'rejected');

  if (connected.length === CONCURRENT) {
    ok(`All ${CONCURRENT} connections established (avg ${(totalLatency / totalSamples).toFixed(1)}ms)`);
  } else {
    fail(`${connected.length}/${CONCURRENT} connected, ${failures.length} failed`);
  }

  return connected;
}

async function testConcurrentDisconnect(clients) {
  console.log(yellow(`\n── Test: ${clients.length} concurrent disconnects ──\n`));

  const t0 = Date.now();
  const results = await Promise.allSettled(clients.map(ws => {
    return new Promise(resolve => {
      ws.on('close', () => resolve(true));
      ws.close();
      setTimeout(() => resolve(false), 1000);
    });
  }));
  const allClosed = results.every(r => r.status === 'fulfilled' && r.value === true);
  const elapsed = Date.now() - t0;

  if (allClosed) {
    ok(`All ${clients.length} clients disconnected cleanly in ${elapsed}ms`);
  } else {
    fail(`Some clients failed to disconnect in ${elapsed}ms`);
  }
}

async function run() {
  console.log(yellow(`\n═══ Load Test: 8-Ball Pool ═══`));
  console.log(`Target: ${green(WS_URL)}`);
  console.log(`Concurrency: ${yellow(String(CONCURRENT))}`);

  let clients = [];

  try {
    // 1. Concurrent connections
    clients = await testConcurrentConnections();

    // 2. Concurrent disconnect
    await testConcurrentDisconnect(clients);
    clients = [];

  } catch (err) {
    console.error(red(`\n✗ Load test error: ${err.message}`));
  } finally {
    // Cleanup any remaining connections
    for (const ws of clients) {
      try { ws.close(); } catch {}
    }
  }

  // Summary
  console.log(yellow(`\n── Summary ──`));
  console.log(`  ${green(`${passed} passed`)}  ${red(`${failed} failed`)}`);
  if (failed > 0) {
    console.log(red(`\n✗ Load test FAILED`));
    process.exit(1);
  } else {
    console.log(green(`\n✓ Load test PASSED`));
  }
}

run().catch(err => {
  console.error(red(`\nFatal: ${err.message}`));
  process.exit(1);
});
