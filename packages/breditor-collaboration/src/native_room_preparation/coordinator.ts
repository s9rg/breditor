/** Build all seven concrete families under one actual selected-cohort scope.
 * Preview writes nothing. Preparation saves only one immutable intent; it never
 * creates participant targets, retires sources or grants serving activation. */
import type {RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedAssetBytesPending} from '../asset_bytes/types.js';
import {sourceNativeRecoveryRead} from '../source_native_read.js';
import {requireAbsent} from '../participant_recovery/inspect.js';
import {withNativeReconstructionInputs,type NativeReconstructionInputOptions,type NativeReconstructionInputs} from '../selected_native_reconstruction/input_scope.js';
import {buildComparedReconstructionParticipant} from '../selected_native_reconstruction/participant_recipe.js';
import {encodeRoomPreparation} from './archive.js';
import {RoomPreparationResources} from './resources.js';
import {roomPreparationTargets,roomPreparationChoice,checkRoomPreparationSources} from './plan.js';
import type {RoomPreparationTarget,RoomPreparationParticipant,RoomPreparationChoice,RoomPreparationFile} from './contract.js';
import {fields,database,fail} from './policy.js';
export type RoomPreparationPreviewOptions=NativeReconstructionInputOptions&Readonly<{database:string;participants:readonly RoomPreparationTarget[]}>;
export type RoomPreparationInspection=Readonly<{kind:'prepared-data';data:RoomPreparationFile}>|Readonly<{kind:'pending';participants:readonly Readonly<{id:string;pending:readonly SharedAssetBytesPending[]}>[]}>;
async function build(context:NativeReconstructionInputs,name:string,targets:readonly RoomPreparationTarget[]):Promise<RoomPreparationInspection>{
 checkRoomPreparationSources(context.before,context.retained,name,targets);const participants:RoomPreparationParticipant[]=[],files:Blob[]=[],pending:{id:string;pending:readonly SharedAssetBytesPending[]}[]=[];
 const digest=prepareArchiveIntegrity(context.integrity);
 for(const t of targets){context.check();const member=context.clients.find(row=>row.id===t.id)!,factory=context.reads.find(row=>row.id===t.id)!,recipe=await buildComparedReconstructionParticipant({id:t.id,before:context.before,retained:context.retained,read:factory.read,descriptor:JSON.stringify(sourceNativeRecoveryRead(member.core).descriptor()),assets:context.assets,resolveAsset:context.resolveAsset,check:context.check},t.family);context.check();if(recipe.kind==='pending'){pending.push({id:t.id,pending:recipe.pending});continue;}const file=recipe.participant.file;participants.push({id:t.id,sourceFamily:t.sourceFamily,family:t.family,selection:recipe.participant.selection,bytes:file.size,sha256:await digest.digest(file),mime:file.type,namespaces:t.namespaces} as RoomPreparationParticipant);files.push(file);}
 if(pending.length)return Object.freeze({kind:'pending',participants:Object.freeze(pending.map(row=>Object.freeze(row)))});const plan={format:'breditor/native-room-preparation-plan' as const,formatVersion:1 as const,database:name,before:context.before.file().selection,retained:context.retained.file().selection,participants},data=await encodeRoomPreparation(plan,context.before.file(),context.retained.file(),files,context.integrity);context.check();return Object.freeze({kind:'prepared-data',data});
}
function input(value:RoomPreparationPreviewOptions){const r=fields(value,['database','participants','retained'],['assets','resolveAsset']),name=database(r['database']),targets=roomPreparationTargets(r['participants'],name),{database:_database,participants:_participants,...options}=r;return{name,targets,options:options as NativeReconstructionInputOptions};}
export function inspectRoomPreparation<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions<P>,options:RoomPreparationPreviewOptions):Promise<RoomPreparationInspection>{const selected=input(options);return withNativeReconstructionInputs(owner,provided,selected.options,selected.targets.map(t=>({id:t.id,families:[t.sourceFamily]})),true,c=>build(c,selected.name,selected.targets));}
/** Exact independent choice is checked again after rebuilding every recipe.
 * A committed file survives a lost completion or a later current-cut refusal. */
export function prepareRoomReconstruction<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions<P>,options:NativeReconstructionInputOptions&Readonly<{expected:RoomPreparationChoice}>):Promise<RoomPreparationFile>{const r=fields(options,['expected','retained'],['assets','resolveAsset']),expected=roomPreparationChoice(r['expected']),{expected:ignored,...source}=r;void ignored;const targets=roomPreparationTargets(expected.plan.participants.map(({id,sourceFamily,family,namespaces})=>({id,sourceFamily,family,namespaces})),expected.plan.database);return withNativeReconstructionInputs(owner,provided,source as NativeReconstructionInputOptions,targets.map(t=>({id:t.id,families:[t.sourceFamily]})),true,async context=>{
 const rebuilt=await build(context,expected.plan.database,targets);if(rebuilt.kind!=='prepared-data'||JSON.stringify(rebuilt.data.choice)!==JSON.stringify(expected))throw fail();
 for(const name of[expected.plan.database,...targets.flatMap(t=>t.namespaces.map(n=>n.database))]){context.check();await requireAbsent(name);context.check();}const current=await context.captureCurrent();context.check();if(JSON.stringify(current.current.selection)!==JSON.stringify(expected.plan.before))throw fail();const resources=new RoomPreparationResources();try{const result=await resources.open(expected,context.integrity,rebuilt.data.file);context.check();const after=await context.captureCurrent();context.check();if(JSON.stringify(after.current.selection)!==JSON.stringify(expected.plan.before))throw fail();return result;}finally{await resources.close();}
 });}
/** Existing-only immutable DATA reopen. No live owner or writer permission is
 * recovered from the stored record, even when all bytes match. */
export async function readPreparedRoom(expected:RoomPreparationChoice,integrity:SharedArchiveIntegrityOptions):Promise<RoomPreparationFile>{const choice=roomPreparationChoice(expected),resources=new RoomPreparationResources();try{return await resources.open(choice,integrity);}finally{await resources.close();}}
