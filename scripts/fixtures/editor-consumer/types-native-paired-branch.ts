/** Pure paired native coverage cannot create a mutable room or author grant. */
import type{SharedRichEditor}from'../../../packages/breditor-collaboration/dist/core.js';
declare const core:SharedRichEditor,source:SharedRichEditor<'document-v1'>;
const supported:boolean=core.supportsRetainedNativeBranch();
const proof:void=core.verifyRetainedNativeBranch(source);
// @ts-expect-error Native source identity cannot come from checkpoint data.
core.verifyRetainedNativeBranch({checkpointJson:'data'});
// @ts-expect-error A pure coverage read grants neither approval nor authoring.
const grant:boolean=core.verifyRetainedNativeBranch(source);
// @ts-expect-error Coverage imports no comments or review decisions.
core.reconcileReviewBranch;
void supported;void proof;

import{verifySelectedRoomNativeBranchCoverage,verifySelectedRoomNativeDataBranchCoverage}from'../../../packages/breditor-collaboration/dist/selected_room_current/native_continuation.js';
import type{PhysicalRoomRecordCutArchive}from'../../../packages/breditor-collaboration/dist/physical_room_record_cut/archive.js';
import type{PhysicalOperationV3HistoryReadOptions}from'../../../packages/breditor-collaboration/dist/physical_room_operation_v3/history_read_contract.js';
import type{RetainedNativeClient}from'../../../packages/breditor-collaboration/dist/complete_operation_cohort/retained_native_read.js';
declare const before:PhysicalRoomRecordCutArchive,after:PhysicalRoomRecordCutArchive,reads:PhysicalOperationV3HistoryReadOptions,clients:readonly RetainedNativeClient[],descriptors:ReadonlyMap<string,string>;
const coverage:Promise<void>=verifySelectedRoomNativeBranchCoverage(before,after,reads,clients,()=>{});
const data:Promise<void>=verifySelectedRoomNativeDataBranchCoverage(before,after,reads,descriptors,()=>{});
// @ts-expect-error A pure complete-record native check creates no mutable owner.
const owner:Promise<{clients:readonly RetainedNativeClient[]}>=verifySelectedRoomNativeBranchCoverage(before,after,reads,clients,()=>{});
void coverage;void data;
