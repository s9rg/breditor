/** Keep one strict golden identity; this is not a source/binary attestation. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {NORMAL_SHARED_WASM_SHA256} from './fixtures/native-runtime/normal-shared-identity.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
test('the exact normal application runtime matches the single pinned golden identity',()=>{assert.match(NORMAL_SHARED_WASM_SHA256,/^[a-f0-9]{64}$/);assert.equal(createHash('sha256').update(readFileSync(new URL('../target/promoted-shared-web/breditor_shared_bg.wasm',import.meta.url))).digest('hex'),NORMAL_SHARED_WASM_SHA256);});
test('current normal-runtime golden bytes are not duplicated across scripts',()=>{const paths=execFileSync('rg',['-l','-F',NORMAL_SHARED_WASM_SHA256,'scripts'],{cwd:root,encoding:'utf8'}).trim().split('\n');assert.deepEqual(paths,['scripts/fixtures/native-runtime/normal-shared-identity.mjs']);});
