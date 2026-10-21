/** Current normal native runtime and managed document-storage read-only archival contract. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),runtime=resolve(root,'target/promoted-shared-web');
if(process.argv.length!==2)throw Error('Use the current explicitly built normal runtime; no automatic rebuild or publication');
const run=name=>JSON.parse(execFileSync(process.execPath,[`scripts/${name}.mjs`,runtime],{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:2*1024*1024})),native=run('probe-read-only-history-native'),sdk=run('probe-read-only-history-sdk');
for(const [key,value]of Object.entries({passed:true,cases:144,coldPairs:144,enabledDocumentArchives:72,enabledReviewArchives:72,strictObserverRefusals:288,readOnlySeals:288,futurePairedComparisons:432,rootFileComparisons:288,activeFileComparisons:288}))assert.equal(native[key],value,key);
for(const [key,value]of Object.entries({passed:true,cases:216,pairedCases:144,coldPairs:648,passiveSeals:432,oldObserverRefusals:216,rootFileComparisons:432,firstSealedFileComparisons:216,saveAborts:2,lostAcknowledgements:2,futureHistoryPairs:648}))assert.equal(sdk[key],value,key);
const sharedWasmSha256=createHash('sha256').update(readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))).digest('hex');assert.equal(native.sharedWasmSha256,sharedWasmSha256);assert.deepEqual(sourceEvidence(root),source);
const report={format:'breditor/read-only-history-qualification',passed:true,source,sourceUnchanged:true,native,sdk,sharedWasmSha256,scope:'Explicit read-only former-author archival in independent native document/comment lanes, plus managed document-generation storage with original paired comments. Fresh current policy never comes from archive bytes. No independent review-generation SDK storage or relay-generation activation is implied.'};saveEvidence(resolve(root,'target/read-only-history-native.json'),report);console.log(JSON.stringify(report,null,2));
