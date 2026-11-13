/** Source-bound native comment-generation qualification through normal application Wasm. */
import assert from 'node:assert/strict';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {probeSegmentedReviewNative} from './probe-segmented-review-native.mjs';
import {probeContinuedReviewSdk} from './probe-continued-review-sdk.mjs';

if(process.argv.length!==2)throw Error('Use the freshly built normal application runtime; no automatic rebuild or publication');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root);
const acceptance=await probeSegmentedReviewNative(resolve(root,'target/promoted-shared-web'));
assert.equal(acceptance.passed,true);
const continuation=await probeContinuedReviewSdk(resolve(root,'target/promoted-shared-web'));
assert.equal(continuation.sharedWasmSha256,acceptance.sharedWasmSha256);
assert.deepEqual(sourceEvidence(root),source,'Source changed during native comment-generation qualification');
const report={format:'breditor/native-review-generations',formatVersion:1,passed:true,source,sourceUnchanged:true,acceptance,continuation,scope:'Current normal application Wasm, independently selected native document/comment generations. No SDK persistence, relay lifetime, physical browser or V1 qualification.'};
saveEvidence(resolve(root,'target/native-review-generations.json'),report);
console.log(JSON.stringify(report,null,2));
