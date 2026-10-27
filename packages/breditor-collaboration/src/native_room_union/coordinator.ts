/** Whole-cohort mixed preparation. Preview is read-only; persistence creates
 * only an immutable journal, never target stores, retirement or activation. */
import type{RetainedSelectedAssetOwner}from'../physical_room_asset_successor/owner.js';
import type{PhysicalOperationV3HistoryReadOptions}from'../physical_room_operation_v3/history_read_contract.js';
import type{SharedSelectionPolicy}from'../types.js';
import{prepareArchiveIntegrity}from'../archive_integrity/context.js';
import{recoveryOpeningContext}from'../participant_recovery/opening_custody.js';
import{requireAbsent}from'../participant_recovery/inspect.js';
import{sourceNativeRecoveryRead}from'../source_native_read.js';
import{readReconstructionCatalog}from'../native_room_retirement/catalog.js';
import{withNativeRoomUnionInputs,type NativeReconstructionInputs,type NativeReconstructionInputOptions}from'./input_scope.js';
import{buildNativeRoomUnionRecipes}from'./recipes.js';
import{encodeNativeRoomUnion}from'./framing.js';
import{NativeRoomUnionResources}from'./resources.js';
import{NativeRoomUnionReadScope as Scope}from'./read_scope.js';
import{unionTargets,unionAuthorizations,matchUnionAuthorizations,unionPlan,unionChoice,unionPlanTargets}from'./plan.js';
import type{NativeRoomUnionTarget as Target,NativeRoomUnionAuthorization as Grant,NativeRoomUnionPreviewOptions as Preview,NativeRoomUnionPrepareOptions as Prepare,NativeRoomUnionInspection as Inspection,NativeRoomUnionReadOptions as Read,NativeRoomUnionChoice as Choice,NativeRoomUnionFile as File}from'./contract.js';
import{fields,database,fail}from'./policy.js';
async function build(context:NativeReconstructionInputs,name:string,targets:readonly Target[],grants:readonly Grant[]):Promise<Inspection>{
 const digest=prepareArchiveIntegrity(context.integrity),descriptors=new Map(context.clients.map(c=>[c.id,JSON.stringify(sourceNativeRecoveryRead(c.core).descriptor())])),rebuilt=await buildNativeRoomUnionRecipes({...context,descriptors,integrityDigest:digest.digest,resolveAsset:()=>context.resolveAsset},name,targets,grants);context.check();
 if(rebuilt.pending.length)return Object.freeze({kind:'pending',participants:Object.freeze(rebuilt.pending.map(p=>Object.freeze(p)))});
 const plan=unionPlan({format:'breditor/native-room-union-plan',formatVersion:1,database:name,before:context.before.file().selection,retained:context.retained.file().selection,participants:rebuilt.participants});
 const admitted=await readReconstructionCatalog(context,plan,id=>{const file=rebuilt.files.get(id);if(!file)throw fail();return file;});try{context.check();const data=await encodeNativeRoomUnion(plan,{before:context.before.file(),retained:context.retained.file(),participants:rebuilt.files,unions:rebuilt.unions},context.integrity);context.check();return Object.freeze({kind:'prepared-data',data});}finally{admitted.catalog.dispose();}
}
function input(value:Preview){const r=fields(value,['database','participants','retained','authorizations'],['assets','resolveAsset']),name=database(r['database']),targets=unionTargets(r['participants'],name),grants=unionAuthorizations(r['authorizations']);matchUnionAuthorizations(targets,grants);const{database:_name,participants:_participants,authorizations:_grants,...source}=r;return{name,targets,grants,source:source as NativeReconstructionInputOptions};}
export function inspectNativeRoomUnion<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,read:PhysicalOperationV3HistoryReadOptions<P>,options:Preview):Promise<Inspection>{const selected=input(options);return withNativeRoomUnionInputs(owner,read,selected.source,selected.targets.map(t=>({id:t.id,families:[t.sourceFamily]})),true,c=>build(c,selected.name,selected.targets,selected.grants));}
/** Rebuild before saving, hold genuine sources throughout, and leave all output
 * namespaces absent. A committed journal survives a lost completion. */
export function prepareNativeRoomUnion<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions<P>,options:Prepare):Promise<File>{
 const pinned={factory:recoveryOpeningContext(),locks:navigator.locks},r=fields(options,['expected','retained','authorizations'],['assets','resolveAsset']),expected=unionChoice(r['expected']),targets=unionPlanTargets(expected.plan),grants=unionAuthorizations(r['authorizations']);matchUnionAuthorizations(targets,grants);const{expected:_expected,authorizations:_grants,...source}=r;
 return withNativeRoomUnionInputs(owner,provided,source as NativeReconstructionInputOptions,targets.map(t=>({id:t.id,families:[t.sourceFamily]})),true,async context=>{
  const check=()=>{context.check();if(globalThis.indexedDB!==pinned.factory||globalThis.navigator?.locks!==pinned.locks)throw fail('room_union_closed');};check();const rebuilt=await build(context,expected.plan.database,targets,grants);check();if(rebuilt.kind!=='prepared-data'||JSON.stringify(rebuilt.data.choice)!==JSON.stringify(expected))throw fail();
  for(const name of[expected.plan.database,...targets.flatMap(t=>[...t.namespaces.map(n=>n.database),...(t.mode==='independent-delivery-union'?[t.unionDatabase]:[])])]){check();await requireAbsent(name);check();}
  const before=await context.captureCurrent();check();if(JSON.stringify(before.current.selection)!==JSON.stringify(expected.plan.before))throw fail();const resources=new NativeRoomUnionResources();try{const result=await resources.open(expected,{wasm:context.integrity.wasm,reads:context.nativeReads,authorizations:grants,checkAuthority:check,...(context.assets?{assets:context.assets}:{}),...(context.integrity.signal?{signal:context.integrity.signal}:{})},rebuilt.data.file);check();const after=await context.captureCurrent();check();if(JSON.stringify(after.current.selection)!==JSON.stringify(expected.plan.before))throw fail();return result;}finally{await resources.close();}
 });
}
/** Existing-only admission pins storage before any fresh host callback and
 * reproduces the room's native, packet and asset recipes. No authority is saved. */
export async function readPreparedNativeRoomUnion(provided:Choice,options:Read):Promise<File>{
 const pinned={factory:recoveryOpeningContext(),locks:navigator.locks},expected=unionChoice(provided),scope=new Scope(options);let resources:NativeRoomUnionResources|undefined;
 try{const check=()=>{scope.check();if(globalThis.indexedDB!==pinned.factory||globalThis.navigator?.locks!==pinned.locks)throw fail('room_union_closed');};check();resources=new NativeRoomUnionResources();return await resources.open(expected,{wasm:scope.base.integrity.wasm,reads:scope.base.reads,authorizations:scope.authorizations,...(scope.base.assets?{assets:scope.base.assets}:{}),checkAuthority:check,signal:scope.base.signal});}finally{try{await resources?.close();}finally{scope.close();}}
}
