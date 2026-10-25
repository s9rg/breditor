/** Fixed actual seven-writer recovery matrix on fresh source-matched native
 * inputs. This is functional SDK evidence, not authenticated room activation. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {sourceEvidence,fileEvidence,saveEvidence} from './candidate-release/evidence.mjs';

if (process.argv.length !== 2) throw Error('No substituted source, native registrations or reduced workload accepted');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = sourceEvidence(root), nativePath = 'target/complete-cohort-native.json';
const native = JSON.parse(readFileSync(join(root, nativePath)));
assert.equal(native.passed, true);
assert.deepEqual(native.source, source, 'Generate the actual native seven-author fixture for this exact source');
assert.equal(native.registeredWritersPerRoom, 7);
assert.equal(native.reviewActorsPerRoom, 7);
assert.equal(native.protectedStreamsPerRoom, 14);
assert.equal(native.files.length, 50);
for (const row of native.files) assert.deepEqual(fileEvidence(root, row.path), row);
assert.deepEqual(fileEvidence(root, native.manifestEvidence.path), native.manifestEvidence);

const directory = mkdtempSync(join(root, 'target/seven-room-sdk-'));
const probe = 'scripts/probe-physical-operation-v3-seven-room.mjs';
let output;
try {
  output = execFileSync(process.execPath, ['--test', probe], {cwd: root, encoding: 'utf8', timeout: 1800000, maxBuffer: 16 * 1024 * 1024});
  writeFileSync(join(directory, 'matrix.log'), output);
} catch (error) {
  writeFileSync(join(directory, 'matrix.log'), String(error.stdout ?? '') + '\n' + String(error.stderr ?? ''));
  throw error;
}
for (const pattern of [/^# pass 40$/m, /^# fail 0$/m, /^# skipped 0$/m]) assert.match(output, pattern);
assert.deepEqual(sourceEvidence(root), source);
for (const row of native.files) assert.deepEqual(fileEvidence(root, row.path), row);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const normalWasmSha256 = sha(readFileSync(join(root, 'target/promoted-shared-web/breditor_shared_bg.wasm')));
assert.equal(normalWasmSha256, '946ca19dadd21e06eafc12f366272c44ba831de5349831bc2323f38eda6372f0');
const result = {
  format: 'breditor/seven-room-sdk', formatVersion: 1, passed: true,
  source, sourceUnchanged: true, directory, nativeEvidence: fileEvidence(root, nativePath),
  nativeInputsFreshForSource: true, nativeFilesVerified: native.files.length,
  normalWasmSha256, probe: fileEvidence(root, probe), cases: 40,
  profiles: 10, independentHistoryPairs: 4, participants: 280, coldParticipants: 280,
  nativeHistoryPairs: 280, wholeUploadStores: 280, postJobContinuations: 280,
  scope: 'All seven concrete families from distinct actual writers/actors in one room per case: exact cold native histories, whole nonempty uploads, provenance and post-job continuation. Synthetic IDB/locks and offline transports. Not provider/client reconciliation, authenticated activation, physical-browser durability, sustainable lifetime or V1 readiness.',
};
saveEvidence(join(root, 'target/seven-room-sdk.json'), result);
saveEvidence(join(directory, 'result.json'), result);
console.log(JSON.stringify(result));
