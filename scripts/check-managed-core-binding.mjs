/** Source-bound ownership regression on the explicitly built normal application runtime. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root);
if(process.argv.length!==2)throw Error('Use the current explicitly built normal runtime; no automatic build or publication');
const run=probe=>JSON.parse(execFileSync(process.execPath,[`scripts/${probe}.mjs`,'target/promoted-shared-web'],{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:2*1024*1024}));
const segmented=run('probe-managed-core-binding'),original=run('probe-managed-original-core-binding'),relay=run('probe-relay-core-binding');
for(const [value,cases,checks,cleanup,failedSave]of [[segmented,72,432,144,2],[original,144,864,288,4]]){assert.equal(value.passed,true);assert.equal(value.cases,cases);assert.equal(value.captureRefusals,1728);assert.equal(value.accessorCalls,0);assert.equal(value.exactPairChecks,checks);assert.equal(value.cleanupChecks,cleanup);assert.equal(value.failedCloseChecks,cases);assert.equal(value.failedSaveChecks,failedSave);}
assert.equal(segmented.sharedWasmSha256,original.sharedWasmSha256);assert.deepEqual(sourceEvidence(root),source);
for(const [key,value]of Object.entries({passed:true,cases:36,shadowRefusals:72,getterCalls:0,exactNativeCuts:72,successfulSeals:36,coldReopens:36,sharedWasmSha256:segmented.sharedWasmSha256}))assert.equal(relay[key],value,key);
const report={format:'breditor/managed-core-binding-qualification',passed:true,source,sourceUnchanged:true,segmented,original,relay,scope:'Actual normal native owners and source SDK; synthetic IDB/Web Locks, not physical durability. Old history formats and native policies are unchanged.'};
saveEvidence(resolve(root,'target/managed-core-binding-source.json'),report);console.log(JSON.stringify(report,null,2));
