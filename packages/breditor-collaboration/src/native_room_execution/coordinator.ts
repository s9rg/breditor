/** Durable preparation of complete execution DATA under a genuine held source
 * cohort. No writer retirement, replacement creation or activation occurs here. */
import type {RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import {withNativeReconstructionInputs,type NativeReconstructionInputs,type NativeReconstructionInputOptions} from '../selected_native_reconstruction/input_scope.js';
import {readPreparedRoom} from '../native_room_preparation/coordinator.js';
import {requireAbsent} from '../participant_recovery/inspect.js';
import type {RoomPreparationChoice} from '../native_room_preparation/contract.js';
import {roomPreparationChoice} from '../native_room_preparation/plan.js';
import {RoomExecutionArchive} from './archive.js';
import {RoomExecutionResources} from './resources.js';
import {executionLayout,executionAssetChoices,executionChoice,executionNames} from './plan.js';
import {fields,fail} from './policy.js';
import type {RoomExecutionLayout,RoomExecutionAssetChoices,RoomExecutionFile,RoomExecutionChoice,RoomExecutionReadOptions} from './contract.js';
const archive={capture:RoomExecutionArchive.capture,choice:RoomExecutionArchive.prototype.choice,file:RoomExecutionArchive.prototype.file,dispose:RoomExecutionArchive.prototype.dispose},resourcesApi={open:RoomExecutionResources.prototype.open,close:RoomExecutionResources.prototype.close};
export type RoomExecutionInspectionOptions=NativeReconstructionInputOptions&Readonly<{preparation:RoomPreparationChoice;layout:RoomExecutionLayout;decisions:readonly RoomExecutionAssetChoices[]}>;
function options(context:NativeReconstructionInputs):RoomExecutionReadOptions{return{...context.integrity,reads:context.nativeReads,checkAuthority:context.check,...(context.assets?{assets:context.assets}:{})};}
async function build(context:NativeReconstructionInputs,preparation:RoomPreparationChoice,layout:RoomExecutionLayout,decisions:readonly RoomExecutionAssetChoices[]):Promise<RoomExecutionFile>{
 context.check();if(JSON.stringify(context.before.file().selection)!==JSON.stringify(preparation.plan.before)||JSON.stringify(context.retained.file().selection)!==JSON.stringify(preparation.plan.retained))throw fail();const input=await readPreparedRoom(preparation,context.integrity);context.check();const captured=await archive.capture.call(RoomExecutionArchive,{preparation:input,layout,decisions},options(context));try{context.check();return Object.freeze({choice:archive.choice.call(captured),file:archive.file.call(captured)});}finally{archive.dispose.call(captured);}
}
export function inspectRoomExecution<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions<P>,value:RoomExecutionInspectionOptions):Promise<RoomExecutionFile>{const r=fields(value,['retained','preparation','layout','decisions'],['assets','resolveAsset']),preparation=roomPreparationChoice(r['preparation']),layout=executionLayout(r['layout']),decisions=executionAssetChoices(r['decisions']),{preparation:_p,layout:_l,decisions:_d,...input}=r;return withNativeReconstructionInputs(owner,provided,input as NativeReconstructionInputOptions,preparation.plan.participants.map(row=>({id:row.id,families:[row.sourceFamily]})),true,context=>build(context,preparation,layout,decisions));}
/** Absent-only save. An uncertain completion is resolved by existing-only
 * exact read; retrying creation never overwrites an existing record. */
export function prepareRoomExecution<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions<P>,value:NativeReconstructionInputOptions&Readonly<{expected:RoomExecutionChoice}>):Promise<RoomExecutionFile>{const r=fields(value,['retained','expected'],['assets','resolveAsset']),expected=executionChoice(r['expected']),{expected:_e,...input}=r;return withNativeReconstructionInputs(owner,provided,input as NativeReconstructionInputOptions,expected.plan.preparation.plan.participants.map(row=>({id:row.id,families:[row.sourceFamily]})),true,async context=>{
 const rebuilt=await build(context,expected.plan.preparation,expected.plan.layout,expected.plan.assets.map(({id,union,adoption})=>({id,union,adoption})));context.check();if(JSON.stringify(rebuilt.choice)!==JSON.stringify(expected))throw fail();for(const name of[...executionNames(expected.plan.layout),...expected.plan.preparation.plan.participants.flatMap(row=>row.namespaces.map(ns=>ns.database))]){context.check();await requireAbsent(name);context.check();}const current=await context.captureCurrent();context.check();if(JSON.stringify(current.current.selection)!==JSON.stringify(expected.plan.preparation.plan.before))throw fail();const resources=new RoomExecutionResources();try{const result=await resourcesApi.open.call(resources,expected,options(context),rebuilt.file);context.check();const after=await context.captureCurrent();context.check();if(JSON.stringify(after.current.selection)!==JSON.stringify(expected.plan.preparation.plan.before))throw fail();return result;}finally{await resourcesApi.close.call(resources);}
 });}
/** Cold DATA read only. Restoring an intent never restores live permission. */
export async function readRoomExecution(provided:RoomExecutionChoice,options:RoomExecutionReadOptions):Promise<RoomExecutionFile>{const choice=executionChoice(provided),resources=new RoomExecutionResources();try{return await resourcesApi.open.call(resources,choice,options);}finally{await resourcesApi.close.call(resources);}}
