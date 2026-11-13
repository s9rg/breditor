/** Frozen-source functional proof of independent native families and atomic paired client storage. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),runtime=resolve(root,'target/promoted-shared-web');
if(process.argv.length!==2)throw Error('Use explicitly built source and normal Wasm; never rebuild or publish automatically');
const run=name=>JSON.parse(execFileSync(process.execPath,[`scripts/${name}.mjs`,runtime],{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:2*1024*1024})),facade=run('probe-review-generation-sdk'),storage=run('probe-independent-history-sdk'),continuedPair=run('probe-continued-pair'),sharedWasmSha256=createHash('sha256').update(readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))).digest('hex');
for(const [key,value]of Object.entries({passed:true,cases:72,coldPairs:144,futureHistoryPairs:216,staleGuardRefusals:144,foreignGuardRefusals:72,pinnedStoreRefusals:180,readOnlyBoundaries:144,exactFiles:288,pairedNativeOrigins:72,sharedWasmSha256}))assert.equal(facade[key],value,key);
for(const [key,value]of Object.entries({passed:true,cases:576,coldPairs:1728,futureHistoryPairs:1728,sameGenerationIds:288,saveAborts:4,lostAcknowledgements:4,retainedVersionPackets:576,exactImmutableFiles:1152,sourceBindingRefusals:1152,getterCalls:0,sharedWasmSha256}))assert.equal(storage[key],value,key);
for(const [key,value]of Object.entries({passed:true,cases:15,coldPairs:45,historyComparisons:45,abortedSaves:3,lostAcknowledgements:3,exactFileSets:15,insertOnlyRefusals:15,missingFileRefusals:3,sharedWasmSha256}))assert.equal(continuedPair[key],value,key);
assert.deepEqual(sourceEvidence(root),source);const report={format:'breditor/independent-history-sdk-qualification',passed:true,source,sourceUnchanged:true,facade,storage,continuedPair,sharedWasmSha256,scope:'Explicit independently selected document/comment history families, real native cold replay and atomic client persistence with exact retries. Synthetic storage/locks only. No old-family migration, automatic source-port adoption, native server/log generation or room activation.'};saveEvidence(resolve(root,'target/independent-history-sdk.json'),report);console.log(JSON.stringify(report,null,2));
