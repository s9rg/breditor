import {NORMAL_SHARED_WASM_SHA256} from "./fixtures/native-runtime/normal-shared-identity.mjs";
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

const directory = mkdtempSync(join(root, 'target/native-read-sdk-'));
const probe = 'scripts/probe-operational-native-read.mjs', runtimeProbe = 'scripts/operational-native-read-runtime.test.mjs';
let output;
try {
  output = execFileSync(process.execPath, ['--test', probe, runtimeProbe], {cwd: root, encoding: 'utf8', timeout: 1800000, maxBuffer: 16 * 1024 * 1024});
  writeFileSync(join(directory, 'matrix.log'), output);
} catch (error) {
  writeFileSync(join(directory, 'matrix.log'), String(error.stdout ?? '') + '\n' + String(error.stderr ?? ''));
  throw error;
}
for (const pattern of [/^# pass 53$/m, /^# fail 0$/m, /^# skipped 0$/m]) assert.match(output, pattern);
assert.deepEqual(sourceEvidence(root), source);
for (const row of native.files) assert.deepEqual(fileEvidence(root, row.path), row);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const normalWasmSha256 = sha(readFileSync(join(root, 'target/promoted-shared-web/breditor_shared_bg.wasm')));
assert.equal(normalWasmSha256, NORMAL_SHARED_WASM_SHA256);
const result = {
  format: 'breditor/native-read-sdk', formatVersion: 1, passed: true,
  source, sourceUnchanged: true, directory, nativeEvidence: fileEvidence(root, nativePath),
  nativeInputsFreshForSource: true, nativeFilesVerified: native.files.length,
  normalWasmSha256, probe: fileEvidence(root, probe), runtimeProbe: fileEvidence(root, runtimeProbe), assertions: 53, runtimeInitializationLaws: 1, kernelLaws: 5, uploadCustodyLaws: 2, roomHistoryCases: 40, lateCancellationLaws: 1, documentOnlyLaws: 4,
  profiles: 10, independentHistoryPairs: 4, roomParticipants: 280, repeatedReadsPerRoom: 2,
  scope: 'One real concurrent-runtime initialization law, five kernel laws, two actual legacy upload-custody laws, forty real seven-writer/history room combinations, late cancellation and four genuine document-only/unselected-review laws. Repeated native-only reads preserve committed database bytes, parent custody, whole uploads and subsequent native Undo/Redo. Synthetic IDB/locks and offline transports. Cached inventory is not provider/client reconciliation, fresh server authority, authenticated activation, physical-browser durability, sustainable lifetime or V1 readiness.',
};
saveEvidence(join(root, 'target/native-read-sdk.json'), result);
saveEvidence(join(directory, 'result.json'), result);
console.log(JSON.stringify(result));
