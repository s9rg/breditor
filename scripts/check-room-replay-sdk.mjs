/** Source-bound all-copy native replay, preserving the original parent operational assertions. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {buildRoomParticipantInventoryFixtures} from "./check-room-participant-inventory-native.mjs";
import {sourceEvidence,saveEvidence} from "./candidate-release/evidence.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
export function checkRoomReplaySdk(){const source=sourceEvidence(root),native=buildRoomParticipantInventoryFixtures({saveReport:false}),temporary=resolve(root,"target/room-replay-native-fixtures.json");saveEvidence(temporary,native);
 const acceptance=JSON.parse(execFileSync(process.execPath,["scripts/probe-room-replay.mjs","target/promoted-shared-web",temporary],{cwd:root,encoding:"utf8",maxBuffer:1024*1024,timeout:360000}));assert.deepEqual(sourceEvidence(root),source);
 for(const[key,value]of Object.entries({passed:true,cases:10,copies:30,duplicateWriterCopies:10,originalNativeComparisons:30,completePolicyRefusals:30,partialNativeFailures:10,currentValidityAfterCallback:1,nativeFactoryCalls:70,nativeDisposals:70,forbiddenCalls:0}))assert.equal(acceptance[key],value,key);
 const report={format:"breditor/room-replay-sdk-check",formatVersion:1,passed:true,source,native,acceptance};saveEvidence(resolve(root,"target/room-replay-sdk.json"),report);return report;}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==2)throw Error("No arguments expected");console.log(JSON.stringify(checkRoomReplaySdk(),null,2));}
