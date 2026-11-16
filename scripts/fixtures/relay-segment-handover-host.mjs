/** Private fixture commands over stdin. The live relay exposes only its ordinary routes. */
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import {readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

export function assertOlderAuthorityRefused(executable, parent, address, token, older) {
  const ledger = join(parent, 'deployment', 'authority.log');
  const parked = join(parent, 'held-current-authority.log');
  const current = readFileSync(ledger);
  assert.ok(older.length < current.length);
  assert.deepEqual(current.subarray(0, older.length), older);
  renameSync(ledger, parked);
  try {
    writeFileSync(ledger, older, {flag: 'wx', mode: 0o600});
    assert.throws(
      () => execFileSync(executable, [parent, 'relocated', address], {
        input: JSON.stringify({kind: 'resume', token}) + '\n',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10_000,
      }),
      error => error.status === 1 && error.stderr.toString().trim() === 'Error: NeedsRecovery',
    );
    assert.deepEqual(readFileSync(ledger), older);
  } finally {
    rmSync(ledger, {force: true});
    renameSync(parked, ledger);
  }
  assert.deepEqual(readFileSync(ledger), current);
}

export async function startSegmentHandoverHost(executable, args, token, exportAlternates = false, carryControl = false, relocation) {
  const mode = args[1];
  const child = spawn(executable, args, {stdio: ['pipe', 'pipe', 'pipe']});
  const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({code, signal})));
  const lines = createInterface({input: child.stdout})[Symbol.asyncIterator]();
  let errors = '';
  child.stderr.on('data', value => { errors = (errors + value).slice(-8192); });
  child.stdin.on('error', () => {});
  const spawned = once(child, 'spawn');
  async function withinDeadline(promise, step) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error(`Relay segment ${mode} ${step} deadline: ${errors}`)), 90_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async function next(kind) {
    const result = await withinDeadline(lines.next(), kind);
    assert.equal(result.done, false, 'Relay segment host exited: ' + errors);
    const row = JSON.parse(result.value);
    assert.equal(row.kind, kind);
    return row;
  }
  const send = request => {
    child.stdin.write(JSON.stringify(request) + '\n');
  };
  try {
    await spawned;
    if (mode === 'relocated' || mode === 'relocated-before-listen') {
      send({...(relocation ?? {kind: 'resume'}), token});
      if (mode === 'relocated-before-listen') child.stdin.end();
    } else if (token) {
      send({kind: 'resume', token, exportAlternates, ...(carryControl ? {carryControl} : {})});
      if (!carryControl) child.stdin.end();
    } else if (mode !== 'final') {
      child.stdin.end();
    }
    if (mode === 'relocated-before-listen') {
      const {selection} = await next('activated');
      assert.deepEqual(await withinDeadline(closed, 'abrupt exit'), {code: 77, signal: null}, errors);
      assert.equal((await lines.next()).done, true, 'Relay announced service before the exit');
      return {selection};
    }
    const {address} = await next('listening');
    return {
      address,
      async maintenance(principal, token, action) {
        assert.equal(mode, 'relocated');
        send({principal, token, action});
        return next('maintenance');
      },
      async handover(token, document, review, peer, uploads, journals, wrongReceipt, assetMapping, incomingBranch, peerReview) {
        send({kind: 'handover', token, writer: document.writer, documentCredential: document.credential,
          actor: review.actor, reviewCredential: review.credential, peerWriter: peer.writer,
          peerCredential: peer.credential, peerPrincipal: peer.principal, peerReview,
          uploads, journals, wrongReceipt, assetMapping, incomingBranch});
        return next('committed');
      },
      async carry(token, document, review, peer, peerUpload, journals, alternate, additionalAlternate, peerReview, discussionBackup, sealPortable) {
        send({token, writer: document.writer, documentCredential: document.credential,
          actor: review.actor, reviewCredential: review.credential, peerWriter: peer.writer,
          peerCredential: peer.credential, peerPrincipal: peer.principal, peerReview,
          peerUpload, journals, alternate, additionalAlternate, discussionBackup, sealPortable});
        return next('carried');
      },
      async crash() {
        child.kill('SIGTERM');
        const result = await closed;
        assert.equal(result.signal, 'SIGTERM', errors);
      },
      async stop() {
        if (child.exitCode !== null || child.signalCode !== null) return;
        child.stdin.end();
        child.kill('SIGINT');
        let timer;
        try {
          const result = await Promise.race([
            closed,
            new Promise(resolve => { timer = setTimeout(() => resolve(null), 15_000); }),
          ]);
          if (!result) {
            child.kill('SIGKILL');
            await closed;
            throw Error('Relay segment did not stop');
          }
          assert.equal(result.code, 0, errors);
        } finally {
          clearTimeout(timer);
        }
      },
    };
  } catch (error) {
    child.kill('SIGKILL');
    await closed;
    throw error;
  }
}
