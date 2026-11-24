/** Optional macOS observation of a disposable native process through clean shutdown. */
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';

function walInventory(parent) {
  const rows = [];
  for (const directory of ['source-native', 'successor', 'final']) {
    for (const name of readdirSync(join(parent, directory)).sort()) {
      if (!/^g-[a-f0-9]+\.wal$/.test(name)) continue;
      const bytes = readFileSync(join(parent, directory, name));
      rows.push({directory, name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});
    }
  }
  assert.ok(rows.length > 64, 'The measured chain must include both full predecessors');
  return rows;
}

function directChildren(parent) {
  return execFileSync('/bin/ps', ['-ax', '-o', 'pid=,ppid=,pgid=,rss='], {encoding: 'utf8', timeout: 5000})
    .trim().split('\n').map(row => row.trim().split(/\s+/).map(Number))
    .filter(([, parentPid]) => parentPid === parent);
}

async function waitForClose(closed) {
  let timeout;
  try {
    return await Promise.race([closed, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(Error('Measured relay process group did not close')), 5000);
    })]);
  } finally { clearTimeout(timeout); }
}

export async function measureSegmentColdStart(executable, parent) {
  assert.equal(process.platform, 'darwin', 'The optional memory meter requires macOS /usr/bin/time -l');
  const inventory = walInventory(parent);
  const started = performance.now();
  const wrapper = spawn('/usr/bin/time', ['-l', executable, parent, 'final', '127.0.0.1:0'],
    {stdio: ['pipe', 'pipe', 'pipe'], detached: true});
  const closed = new Promise(resolve => wrapper.once('close', (code, signal) => resolve({code, signal})));
  const lines = createInterface({input: wrapper.stdout});
  const deadline = AbortSignal.timeout(30_000);
  let stderr = '', endInput, cleanExit = false;
  wrapper.on('error', error => { stderr += String(error); });
  wrapper.stdin.on('error', () => {});
  wrapper.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16_384); });
  try {
    const [line] = await Promise.race([
      once(lines, 'line', {signal: deadline}),
      closed.then(result => { throw Error(`Measured relay exited before listening (${result.code}): ${stderr}`); }),
    ]);
    const listening = JSON.parse(line);
    assert.equal(listening.kind, 'listening');
    assert.match(listening.address, /^127\.0\.0\.1:\d+$/);
    const listeningMs = performance.now() - started;
    // `time` has exactly one direct child. Measure and stop only that native process.
    const native = directChildren(wrapper.pid);
    assert.equal(native.length, 1);
    const [[pid, , group, residentKiB]] = native;
    assert.equal(group, wrapper.pid);
    assert.ok(residentKiB > 0);
    process.kill(pid, 'SIGINT');
    // Let graceful server shutdown win before retiring the fixture's blocked stdin reader.
    endInput = setTimeout(() => wrapper.stdin.end(), 100);
    const [code, signal] = await once(wrapper, 'exit', {signal: deadline});
    await waitForClose(closed);
    assert.deepEqual({code, signal}, {code: 0, signal: null}, stderr);
    cleanExit = true;
    const maximumResidentBytes = Number(stderr.match(/^\s*(\d+) +maximum resident set size$/m)?.[1]);
    assert.ok(Number.isSafeInteger(maximumResidentBytes) && maximumResidentBytes > 0, stderr);
    assert.deepEqual(walInventory(parent), inventory, 'A measured replay must leave every retained WAL byte unchanged');
    return {walFiles: inventory.length, walBytes: inventory.reduce((sum, file) => sum + file.bytes, 0),
      walInventorySha256: createHash('sha256').update(JSON.stringify(inventory)).digest('hex'),
      listeningMs, residentAtListeningBytes: residentKiB * 1024, maximumResidentBytes,
      exactWalReplay: true};
  } finally {
    lines.close();
    clearTimeout(endInput);
    wrapper.stdin.end();
    // The child can still own inherited pipes after an abnormal wrapper exit.
    if (!cleanExit && wrapper.pid) {
      try { process.kill(-wrapper.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    try { await waitForClose(closed); } finally { wrapper.stdout.destroy(); wrapper.stderr.destroy(); }
  }
}
