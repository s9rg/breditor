/** Read-only complete restart basis from the actual retained approval pin.
 * Neither a prepared nor observed marker grants authors or bypasses the fresh
 * actor/actual-target/approval barriers of ordinary selected-room recovery. */
import {NativeRoomUnionReadScope as Scope} from '../native_room_union/read_scope.js';
import {readPreparedNativeRoomUnionExecution} from '../native_room_union_execution/coordinator.js';
import {NativeRoomUnionRunJournalResources as Journal} from './journal_resources.js';
import {unionRunIdentity,MAX_UNION_RUN_METADATA_BYTES} from './identity.js';
import {unionRunPromotionChoice} from './promotion_choice.js';
import {readRetainedRoomAssetApproval} from '../physical_room_asset_approval/retention.js';
import {RoomAssetApprovalArchive} from '../physical_room_asset_approval/archive.js';
import {selectedAdoptionFile} from '../physical_room_asset_adoption/selection.js';
import {encodeSelectedRoomCurrent} from '../selected_room_current/archive.js';
import {recordCutJson} from '../physical_room_record_cut/json.js';
import type {NativeRoomUnionRunIdentity,NativeRoomUnionRunReadOptions,NativeRoomUnionRunHandoffData} from './contract.js';
import {recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {fail} from './policy.js';
const journalApi={open:Journal.prototype.open,read:Journal.prototype.read,close:Journal.prototype.close},approvalApi={choice:RoomAssetApprovalArchive.prototype.choice,file:RoomAssetApprovalArchive.prototype.file,selection:RoomAssetApprovalArchive.prototype.selection,base:RoomAssetApprovalArchive.prototype.baseFile,cut:RoomAssetApprovalArchive.prototype.recordCut,dispose:RoomAssetApprovalArchive.prototype.dispose};
export async function readNativeRoomUnionRunHandoff(provided:NativeRoomUnionRunIdentity,options:NativeRoomUnionRunReadOptions):Promise<NativeRoomUnionRunHandoffData>{
 const pinned={factory:recoveryOpeningContext(),locks:navigator.locks},identity=unionRunIdentity(provided),scope=new Scope(options);let journal:Journal|undefined,archive:RoomAssetApprovalArchive|undefined;const current=()=>{if(globalThis.indexedDB!==pinned.factory||globalThis.navigator?.locks!==pinned.locks)throw fail('room_union_run_closed');},check=()=>{current();scope.check();current();};
 try{check();journal=new Journal();const base=scope.base,integrity={wasm:base.integrity.wasm,checkAuthority:check,signal:base.signal};
  await readPreparedNativeRoomUnionExecution(identity.execution,{...integrity,reads:base.reads,authorizations:scope.authorizations,...(base.assets?{assets:base.assets}:{})});check();
  const snapshot=await journalApi.open.call(journal,identity,integrity,false);check();const event=snapshot.events.at(-1)!.event;if(event.stage!=='handoff-prepared'&&event.stage!=='handoff-observed'||!event.handoff)throw fail('room_union_run_closed');
  archive=await readRetainedRoomAssetApproval(identity.execution.plan.layout.approvalDatabase,event.handoff.approvalFile,integrity);check();const chosen=approvalApi.choice.call(archive),text=recordCutJson(chosen,MAX_UNION_RUN_METADATA_BYTES),blob=new Blob([text]);if(blob.size!==event.handoff.approval.bytes||await base.integrity.digest(blob)!==event.handoff.approval.sha256)throw fail();
  const choice=unionRunPromotionChoice({format:'breditor/native-room-union-run-promotion-choice',formatVersion:1,identity,head:event.handoff.decisionHead,approval:chosen}),approval=Object.freeze({choice:chosen,selection:approvalApi.selection.call(archive),file:approvalApi.file.call(archive)}),uploads=[];
  for(const row of chosen.adoption.participants){const bytes=await approvalApi.base.call(archive,row.id).arrayBuffer();check();const file=await selectedAdoptionFile(row,bytes,check);if(file.size!==row.selected.bytes||await base.integrity.digest(file)!==row.selected.sha256)throw fail();check();uploads.push({id:row.id,database:row.targetDatabase,file,sha256:row.selected.sha256});}
  const basis=await encodeSelectedRoomCurrent({approval,root:approvalApi.cut.call(archive),uploads},integrity);check();const actual=await journalApi.read.call(journal);check();if(JSON.stringify(actual.head)!==JSON.stringify(snapshot.head))throw fail();
  return Object.freeze({identity,head:snapshot.head,state:event.stage==='handoff-observed'?'observed':'prepared',choice,approval,basis});
 }finally{try{try{if(archive)approvalApi.dispose.call(archive);}finally{if(journal)await journalApi.close.call(journal);}}finally{scope.close();}}
}
