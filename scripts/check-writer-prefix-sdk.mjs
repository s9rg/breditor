/** Exact working-tree source and canonical Wasm. No substitute factories/cuts. */
import assert from 'node:assert/strict';
import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {probeWriterPrefix} from './probe-writer-prefix.mjs';
if(process.argv.length!==2)throw Error('Usage: node scripts/check-writer-prefix-sdk.mjs; no substitute source or runtime');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),acceptance=await probeWriterPrefix(resolve(root,'target/promoted-shared-web'));
assert.deepEqual(sourceEvidence(root),source);const report={format:'breditor/native-writer-prefix-sdk-check',formatVersion:1,passed:true,source,sourceUnchanged:true,acceptance};
saveEvidence(resolve(root,'target/writer-prefix-sdk.json'),report);console.log(JSON.stringify(report,null,2));
