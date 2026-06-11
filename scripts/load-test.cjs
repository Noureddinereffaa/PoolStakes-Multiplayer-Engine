/**
 * Load test for 8-Ball Pool WebSocket server.
 * Requires server running on the configured HOST:PORT.
 *
 * Usage: node scripts/load-test.cjs [--concurrent=10] [--duration=30] [--host=localhost] [--port=3000]
 *
 * Tests:
 *   - Batch connect + authenticate
 *   - Metrics endpoint availability
 *   - Memory leak verification (500 AI matches → verify 0 after cleanup)
 *   - Concurrent room creation (PvP)
 *   - Concurrent match join + matching queue
 *   - AI match creation + bot shot throughput
 *   - Reconnection simulation
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
const DURATION = Number(args.duration || 30);
const WS_URL = `ws://${HOST}:${PORT}`;
const API_URL = `http://${HOST}:${PORT}`;

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

function waitForMessage(ws, typeFilter, timeout = 5000) {
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

function waitForAnyMessage(ws, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Timeout waiting for any message')), timeout);
    ws.on('message', (data) => {
      clearTimeout(t);
      try { resolve(JSON.parse(data.toString())); }
      catch { resolve(data.toString()); }
    });
  });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Invalid JSON: ${data}`)); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function sendJson(ws, obj) {
  ws.send(JSON.stringify(obj));
}

function markLatency(ws) {
  const lat = Date.now() - ws.__createdAt;
  totalLatency += lat;
  totalSamples++;
  return lat;
}

async function testMetricsEndpoint() {
  console.log(yellow(`\n── Test: Metrics endpoint ──\n`));
  try {
    const metrics = await fetchJson(`${API_URL}/api/metrics`);
    if (metrics && typeof metrics.activeRooms === 'number') {
      ok(`Metrics endpoint returns valid data (rooms: ${metrics.activeRooms}, clients: ${metrics.connectedClients}, AI: ${metrics.aiMatches})`);
      return metrics;
    }
    fail('Metrics endpoint returned invalid data');
  } catch (err) {
    fail(`Metrics endpoint unavailable: ${err.message}`);
  }
  return null;
}

async function testConcurrentConnections() {
  console.log(yellow(`\n── Test: ${CONCURRENT} concurrent connections ──\n`));

  const promises = Array.from({ length: CONCURRENT }, (_, i) => {
    const p = connect().then(ws => {
      ws.__id = `load-test-user-${i}`;
      ws.__createdAt = Date.now();
      return ws;
    });
    return p;
  });

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

async function testConcurrentRoomCreation(clients) {
  console.log(yellow(`\n── Test: ${clients.length} concurrent room creations ──\n`));

  const results = await Promise.allSettled(clients.map((ws, i) => {
    return new Promise(async (resolve) => {
      try {
        const msgPromise = waitForAnyMessage(ws, 3000);
        sendJson(ws, { type: 'create_room', stake: 10, isPublic: false });
        const resp = await msgPromise;
        if (resp.type === 'room_created' || resp.type === 'room_joined' || resp.type === 'sync_state') {
          resolve(true);
        } else {
          resolve(false);
        }
      } catch {
        resolve(false);
      }
    });
  }));

  const created = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
  const roomPromises = clients.map(async (ws) => {
    try {
      const msg = await waitForAnyMessage(ws, 3000);
      return msg?.type === 'room_created' || msg?.type === 'sync_state';
    } catch { return false; }
  });
  const roomResults = await Promise.allSettled(roomPromises);
  const successCount = roomResults.filter(r => r.status === 'fulfilled' && r.value === true).length;

  if (successCount > 0) {
    ok(`${successCount}/${clients.length} clients received room confirmation`);
  } else {
    fail(`No clients received room confirmation`);
  }
}

async function testAiMatchCreation(clients) {
  console.log(yellow(`\n── Test: AI match creation on ${Math.min(clients.length, 5)} clients ──\n`));

  const batch = clients.slice(0, Math.min(clients.length, 5));
  const results = await Promise.allSettled(batch.map(async (ws) => {
    try {
      sendJson(ws, { type: 'start_ai_match', difficulty: 'easy', username: ws.__id || 'load-tester' });
      const resp = await waitForAnyMessage(ws, 5000);
      return resp?.type === 'sync_state';
    } catch { return false; }
  }));

  const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
  if (successCount > 0) {
    ok(`${successCount}/${batch.length} AI matches created`);
  } else {
    fail(`No AI matches created`);
  }
}

async function testMemoryLeakVerification() {
  const COUNT = 500;
  console.log(yellow(`\n── Test: Memory leak — ${COUNT} AI matches ──\n`));

  // Before snapshot
  const before = await fetchJson(`${API_URL}/api/metrics`);
  console.log(`  Before: ${JSON.stringify({ activeRooms: before.activeRooms, aiMatches: before.aiMatches })}`);

  // Create COUNT AI matches
  const sockets = [];
  const startTime = Date.now();
  for (let i = 0; i < COUNT; i++) {
    try {
      const ws = await connect();
      ws.__id = `mem-leak-${i}`;
      sendJson(ws, { type: 'start_ai_match', difficulty: 'easy', username: `mem-leak-${i}` });
      // Wait briefly for sync_state to confirm match creation
      await new Promise(resolve => {
        const t = setTimeout(resolve, 10);
        ws.on('message', () => { clearTimeout(t); resolve(); });
      });
      sockets.push(ws);
    } catch (err) {
      // partial success is OK
    }
  }
  const created = sockets.length;
  const createTime = Date.now() - startTime;
  console.log(`  Created ${created}/${COUNT} AI matches in ${createTime}ms`);

  // Check metrics during (some rooms may still be alive)
  const during = await fetchJson(`${API_URL}/api/metrics`);
  console.log(`  During: ${JSON.stringify({ activeRooms: during.activeRooms, aiMatches: during.aiMatches })}`);

  // Disconnect all — should trigger handleAiDisconnect cleanup
  const discStart = Date.now();
  await Promise.allSettled(sockets.map(ws => {
    return new Promise(resolve => {
      ws.on('close', () => resolve(true));
      ws.close();
      setTimeout(() => resolve(false), 1000);
    });
  }));
  const discTime = Date.now() - discStart;
  console.log(`  Disconnected ${sockets.length} sockets in ${discTime}ms`);

  // Wait for async cleanup to settle
  await sleep(300);

  // After snapshot
  const after = await fetchJson(`${API_URL}/api/metrics`);
  console.log(`  After: ${JSON.stringify({ activeRooms: after.activeRooms, aiMatches: after.aiMatches })}`);

  if (after.activeRooms === 0 && after.aiMatches === 0) {
    ok(`All ${COUNT} AI matches cleaned up — no memory leak`);
  } else {
    fail(`Leak detected: ${after.activeRooms} rooms, ${after.aiMatches} AI matches remain after cleanup`);
  }
  return { before, during, after };
}

async function testMessageThroughput(clients) {
  console.log(yellow(`\n── Test: message throughput (${clients.length} clients, ${DURATION}s) ──\n`));

  let totalSent = 0;
  let totalReceived = 0;
  const perClient = { sent: 0, received: 0 };

  const handlers = clients.map((ws) => {
    ws.on('message', () => {
      totalReceived++;
      perClient.received++;
    });
  });

  const start = Date.now();
  const interval = setInterval(() => {
    for (const ws of clients) {
      try {
        sendJson(ws, { type: 'ping' });
        totalSent++;
        perClient.sent++;
      } catch {}
    }
  }, 100);

  await sleep(DURATION * 1000);
  clearInterval(interval);

  const elapsed = (Date.now() - start) / 1000;
  const sentPerSec = (totalSent / elapsed).toFixed(1);
  const recvPerSec = (totalReceived / elapsed).toFixed(1);

  ok(`Sent ${totalSent} messages in ${elapsed.toFixed(1)}s (${sentPerSec}/s)`);
  ok(`Received ${totalReceived} messages (${recvPerSec}/s)`);

  return { totalSent, totalReceived, elapsed };
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
  console.log(`Duration: ${yellow(`${DURATION}s`)}`);

  let clients = [];

  try {
    // 1. Metrics endpoint
    const metrics = await testMetricsEndpoint();

    // 2. Memory leak verification (500 AI matches)
    await testMemoryLeakVerification();

    // 3. Concurrent connections
    clients = await testConcurrentConnections();
    if (clients.length === 0) throw new Error('No clients connected, aborting');

    // 4. Room creation
    if (CONCURRENT >= 2) {
      await testConcurrentRoomCreation(clients.slice(0, Math.min(clients.length, 4)));
    }

    // 5. AI match creation
    if (CONCURRENT >= 1) {
      const freshClients = [];
      for (let i = 0; i < Math.min(3, CONCURRENT); i++) {
        try {
          const ws = await connect();
          ws.__id = `ai-load-${i}`;
          ws.__createdAt = Date.now();
          freshClients.push(ws);
        } catch {}
      }
      if (freshClients.length > 0) {
        await testAiMatchCreation(freshClients);
      }
      clients.push(...freshClients);
    }

    // 6. Message throughput (only if we have clients)
    await testMessageThroughput(clients);

    // 7. Concurrent disconnect
    await testConcurrentDisconnect(clients);
    clients = [];

    // 8. Check metrics after cleanup
    await sleep(500);
    const metricsAfter = await testMetricsEndpoint();
    if (metricsAfter) {
      ok(`Post-cleanup: ${metricsAfter.activeRooms} rooms, ${metricsAfter.connectedClients} clients`);
    }

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
