/** Original source families and actual native histories; no workspace-only editor substitute. */
import assert from "node:assert/strict";
import {realpathSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {probeParticipantRecovery} from "./probe-participant-recovery.mjs";
import {probeDocumentParticipantRecovery} from "./probe-document-participant-recovery.mjs";
import {checkRetainedOwnerHandoffs} from "./fixtures/participant-recovery/retained-handoffs.mjs";
export async function probeRetainedOwnerHandoffs(directory,phase){
 assert.ok(phase==="upgrade"||phase==="retry");const counts={nativeFamilies:0,cases:0,ready:0,operational:0,suggestions:0,revisions:0,versions:0,uploads:0,readablePacketExports:0,storedRecordComparisons:0,freshRecoveries:0,retryableSaveHandoffs:0,futureDocumentCheckpoints:0,futureReviewCheckpoints:0};
 const onRecovered=async({input,recovered,restore})=>{await recovered.close();const result=await checkRetainedOwnerHandoffs(input,restore,{phase});for(const[key,value]of Object.entries(result))counts[key]+=value;counts.nativeFamilies++;};await probeParticipantRecovery(directory,{onRecovered});await probeDocumentParticipantRecovery(directory,{onRecovered});
 const expected=phase==="upgrade"?{nativeFamilies:66,cases:312,ready:156,operational:156,suggestions:60,revisions:60,versions:60,uploads:132,readablePacketExports:720,storedRecordComparisons:1344,freshRecoveries:312,retryableSaveHandoffs:0,futureDocumentCheckpoints:624,futureReviewCheckpoints:480}:{nativeFamilies:66,cases:180,ready:90,operational:90,suggestions:60,revisions:60,versions:60,uploads:0,readablePacketExports:540,storedRecordComparisons:900,freshRecoveries:0,retryableSaveHandoffs:180,futureDocumentCheckpoints:360,futureReviewCheckpoints:360};assert.deepEqual(counts,expected);
 return{format:"breditor/retained-owner-handoff-probe",passed:true,phase,...counts,scope:"Actual canonical Wasm and complete original-family native/packet/upload owners. Real synthetic IndexedDB version changes during actual lease release, readable packet exports, unchanged committed data and fresh exact recovery; ordinary aborted saves retain handoff/retry semantics. Independent native future Undo/Redo references. Explicit Node storage/lock/raster fixtures, not browser/platform durability or room activation."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error("Expected current shared runtime and upgrade/retry phase");console.log(JSON.stringify(await probeRetainedOwnerHandoffs(process.argv[2],process.argv[3]),null,2));}
