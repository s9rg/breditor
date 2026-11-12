import type * as Root from '../../../packages/breditor-collaboration/dist/index.js';
type Assert<T extends true>=T;type Private=Assert<Extract<'ColdRoomExecutionAttempt'|'ColdRoomExecutionSource'|'verifyColdRoomExecutionSource'|'verifyColdCapturedPackets'|'ColdSelectedStorageContext'|'observeRoomRunJournal',keyof typeof Root> extends never?true:false>;
/** SDK-private cold execution keeps DATA choices separate from actual owners. */
import {ColdRoomExecutionAttempt} from '../../../packages/breditor-collaboration/dist/cold_room_execution/attempt.js';
import type {ColdRoomExecutionOptions,ColdRoomExecutionChoice,ColdRoomOriginalRepairChoice} from '../../../packages/breditor-collaboration/dist/cold_room_execution/contract.js';
import type {RoomRunPromotionChoice} from '../../../packages/breditor-collaboration/dist/native_room_execution_run/contract.js';
import type {RetainedSelectedAssetOwner} from '../../../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
declare const options:ColdRoomExecutionOptions,choice:ColdRoomExecutionChoice,promotion:RoomRunPromotionChoice;
const attempt:ColdRoomExecutionAttempt=ColdRoomExecutionAttempt.resume(options);
const prepared:ColdRoomExecutionAttempt=ColdRoomExecutionAttempt.beginPrepared(options);void prepared;
void attempt.preview();void attempt.run({expected:choice,approve:current=>current.format==='breditor/cold-room-execution-choice'});
void attempt.repairOriginal((repair:ColdRoomOriginalRepairChoice)=>repair.scope==='repair-existing-original-only');
void attempt.previewPromotion();void attempt.promote({expected:promotion,approve:()=>true,checkAssetAuthority(){}});void attempt.complete();
const selected:RetainedSelectedAssetOwner=attempt.takeOwner();void selected;void attempt.close();
// @ts-expect-error Current native clients never escape before joint admission.
attempt.clients;
// @ts-expect-error Actor escrow is not a public ownership getter.
attempt.takeActors();
// @ts-expect-error Local recovery is not serving activation.
attempt.activate();
// @ts-expect-error No old editor/cohort is accepted by the cold constructor.
ColdRoomExecutionAttempt.resume({...options,owner:selected});
// @ts-expect-error A fresh decision must be bound to the independently selected cut.
attempt.run(()=>true);
// @ts-expect-error A cold-source preview is not a target promotion choice.
attempt.promote({expected:choice,approve:()=>true,checkAssetAuthority(){}});
// @ts-expect-error A promotion choice is not original-source admission.
attempt.run({expected:promotion,approve:()=>true});
// @ts-expect-error Ready-looking DATA cannot supply a branded real attempt.
const forged:ColdRoomExecutionAttempt={ready:true};void forged;
// @ts-expect-error Stored boolean permission is not an executable fresh decision.
attempt.repairOriginal(true);
// @ts-expect-error Repair does not hand out mutable sources or writer ownership.
const repaired:Promise<RetainedSelectedAssetOwner>=attempt.repairOriginal(()=>true);void repaired;

export type {Private};

// @ts-expect-error Prepared startup accepts selected DATA, never a surviving owner.
ColdRoomExecutionAttempt.beginPrepared({...options,owner:selected});

import {observeRoomRunJournal} from '../../../packages/breditor-collaboration/dist/native_room_execution_run/journal_observation.js';
async function observeJournal(){
 const observation=await observeRoomRunJournal(options.run.expected,{wasm:options.reads.wasm,checkAuthority:options.reads.checkAuthority});
 if(observation.kind==='existing')observation.snapshot.head.sha256;
 else observation.identity.database;
 // @ts-expect-error Journal DATA supplies no owner or run approval.
 await attempt.run({expected:observation,approve:()=>true});
}
void observeJournal;
