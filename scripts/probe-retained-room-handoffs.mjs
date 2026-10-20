/** Whole-room dependent-owner custody using the original actual native server fixtures. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {probeRoomOperationalRecovery} from "./probe-room-operational-recovery.mjs";
import {checkRetainedRoomHandoffs} from "./fixtures/room-operation/retained-handoffs.mjs";
export async function probeRetainedRoomHandoffs(directory,nativeReport){
 const counts={nativeRooms:0,parentUpgradeRefusals:0,lateUpgradeRefusals:0,lastCallbackUploadCloseRefusals:0,suggestions:0,revisions:0,versions:0,uploads:0,storedRecordComparisons:0,retainedFiles:0,freshParticipants:0,unaffectedColdParticipants:0};
 const original=await probeRoomOperationalRecovery(directory,nativeReport,{onRoom:async h=>{const result=await checkRetainedRoomHandoffs(h);for(const[key,value]of Object.entries(result))counts[key]+=value;counts.nativeRooms++;}});
 assert.equal(original.passed,true);assert.deepEqual(counts,{nativeRooms:10,parentUpgradeRefusals:40,lateUpgradeRefusals:30,lastCallbackUploadCloseRefusals:10,suggestions:10,revisions:10,versions:20,uploads:40,storedRecordComparisons:500,retainedFiles:200,freshParticipants:120,unaffectedColdParticipants:40});return{format:"breditor/retained-room-handoff-probe",passed:true,...counts,original,scope:"All ten actual native room compilers/transports and both participant slots. Real upgrades in every declared dependent store or uploads refuse the aggregate; changes after asynchronous preparation and uploads closed in the last host callback consume no child. Complete stored bytes/original files remain, fresh recovery and unaffected readonly cold reopen pass. Synthetic storage/locks/raster, not room activation or platform durability."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error("Expected shared runtime and native fixture report");const report=JSON.parse(readFileSync(process.argv[3],"utf8"));console.log(JSON.stringify(await probeRetainedRoomHandoffs(process.argv[2],report.native??report),null,2));}
