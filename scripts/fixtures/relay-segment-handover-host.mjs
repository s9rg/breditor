/** Private fixture commands over stdin. The live relay exposes only its ordinary routes. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {once} from 'node:events';

export async function startSegmentHandoverHost(executable, args, token) {
  const mode = args[1];
  const child = spawn(executable, args, {stdio: ['pipe', 'pipe', 'pipe']});
  const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({code, signal})));
  const lines = createInterface({input: child.stdout})[Symbol.asyncIterator]();
  let errors = '';
  child.stderr.on('data', value => { errors = (errors + value).slice(-8192); });
  child.stdin.on('error', () => {});
  const spawned = once(child, 'spawn');
  async function next(kind) {
    let timer;
    try {
      const result = await Promise.race([
        lines.next(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error(`Relay segment ${mode} ${kind} deadline: ${errors}`)), 90_000);
        }),
      ]);
      assert.equal(result.done, false, 'Relay segment host exited: ' + errors);
      const row = JSON.parse(result.value);
      assert.equal(row.kind, kind);
      return row;
    } finally {
      clearTimeout(timer);
    }
  }
  const send = request => {
    child.stdin.write(JSON.stringify(request) + '\n');
  };
  try {
    await spawned;
    if (token) {
      send({kind: 'resume', token});
      child.stdin.end();
    } else if (mode !== 'final') {
      child.stdin.end();
    }
    const {address} = await next('listening');
    return {
      address,
      async handover(token, document, review, peer, uploads, journals) {
        send({kind: 'handover', token, writer: document.writer, documentCredential: document.credential,
          actor: review.actor, reviewCredential: review.credential, peerWriter: peer.writer,
          peerCredential: peer.credential, uploads, journals});
        return next('committed');
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
