/** Real whole-cohort retirement through the NEW mixed proof. This is not an
 * old exact-continuation archive, target creation or serving activation. */
import type{RetainedSelectedAssetOwner,SelectedActorExecutionReservation}from'../physical_room_asset_successor/owner.js';
import type{PhysicalOperationV3HistoryReadOptions}from'../physical_room_operation_v3/history_read_contract.js';
import type{SharedSelectionPolicy}from'../types.js';
import{sourceNativeRecoveryRead}from'../source_native_read.js';
import{prepareArchiveIntegrity}from'../archive_integrity/context.js';
import{readReconstructionCatalog,preparedMemberBytes}from'../native_room_retirement/catalog.js';
import{requireAbsent}from'../participant_recovery/inspect.js';
import{decideFreshAssetChoice}from'../physical_room_asset_approval/decision.js';
import{withNativeRoomUnionActorRetirement,withReservedNativeRoomUnionActorRetirement,type NativeReconstructionInputOptions}from'./input_scope.js';
import{readPreparedNativeRoomUnion}from'./coordinator.js';
import{NativeRoomUnionArchive}from'./archive.js';
import{buildNativeRoomUnionRecipes}from'./recipes.js';
import{unionChoice,unionPlanTargets,unionAuthorizations,matchUnionAuthorizations,unionPlan}from'./plan.js';
import type{NativeRoomUnionChoice as Choice,NativeRoomUnionAuthorization}from'./contract.js';
import{fields,fail}from'./policy.js';
export interface NativeRoomUnionRetirementResult{readonly format:'breditor/native-room-union-retirement';readonly formatVersion:1;readonly preparation:Choice;readonly state:'old-writers-closed';readonly scope:'local-native-and-selected-asset-custody-only'}
export type NativeRoomUnionRetirementOptions=Omit<NativeReconstructionInputOptions,'resolveAsset'>&Readonly<{expected:Choice;authorizations:readonly NativeRoomUnionAuthorization[];approve:(choice:Choice)=>boolean|Promise<boolean>}>;
const a={read:NativeRoomUnionArchive.read,part:NativeRoomUnionArchive.prototype.participant,union:NativeRoomUnionArchive.prototype.participantUnion,dispose:NativeRoomUnionArchive.prototype.dispose},add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
function retire<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions<P>,options:NativeRoomUnionRetirementOptions,reservation?:SelectedActorExecutionReservation):Promise<NativeRoomUnionRetirementResult>{
 const raw=fields(options,['expected','retained','authorizations','approve'],['assets']),expected=unionChoice(raw['expected']),targets=unionPlanTargets(expected.plan),grants=unionAuthorizations(raw['authorizations']),approve=raw['approve'] as NativeRoomUnionRetirementOptions['approve'];matchUnionAuthorizations(targets,grants);if(typeof approve!=='function')throw fail('room_union_policy');const source={retained:raw['retained'],...(raw['assets']===undefined?{}:{assets:raw['assets']})} as NativeReconstructionInputOptions;
 const borrow:typeof withNativeRoomUnionActorRetirement=reservation?(owner,read,source,expected,complete,visit)=>withReservedNativeRoomUnionActorRetirement(owner,reservation,read,source,expected,complete,visit):withNativeRoomUnionActorRetirement;
 return borrow(owner,provided,source,targets.map(t=>({id:t.id,families:[t.sourceFamily]})),true,async context=>{
  if(JSON.stringify(context.before.file().selection)!==JSON.stringify(expected.plan.before)||JSON.stringify(context.retained.file().selection)!==JSON.stringify(expected.plan.retained))throw fail();const read={wasm:context.integrity.wasm,reads:context.nativeReads,authorizations:grants,checkAuthority:context.check,...(context.integrity.signal?{signal:context.integrity.signal}:{}),...(context.assets?{assets:context.assets}:{})},saved=await readPreparedNativeRoomUnion(expected,read);context.check();let prepared:NativeRoomUnionArchive|undefined,catalog:Awaited<ReturnType<typeof readReconstructionCatalog>>|undefined;
  try{prepared=await a.read.call(NativeRoomUnionArchive,saved.file,expected,read);context.check();catalog=await readReconstructionCatalog(context,expected.plan,id=>a.part.call(prepared!,id));const digest=prepareArchiveIntegrity(context.integrity),descriptors=new Map(context.clients.map(c=>[c.id,JSON.stringify(sourceNativeRecoveryRead(c.core).descriptor())])),unions=new Map(expected.plan.participants.flatMap(p=>p.mode==='independent-delivery-union'?[[p.id,a.union.call(prepared!,p.id)]as const]:[])),rebuilt=await buildNativeRoomUnionRecipes({...context,descriptors,integrityDigest:digest.digest,resolveAsset:id=>preparedMemberBytes(catalog!.catalog,id,context.check)},expected.plan.database,targets,grants,unions);context.check();if(rebuilt.pending.length||JSON.stringify(unionPlan({...expected.plan,participants:rebuilt.participants}))!==JSON.stringify(expected.plan))throw fail();}
  finally{try{catalog?.catalog.dispose();}finally{if(prepared)a.dispose.call(prepared);}}
  // Only observations, not a lasting destination reservation. The actual
  // recovery constructors still must admit their own absent/exact targets.
  for(const name of targets.flatMap(t=>[...t.namespaces.map(n=>n.database),...(t.mode==='independent-delivery-union'?[t.unionDatabase]:[])])){context.check();await requireAbsent(name);context.check();}
  const signal=context.integrity.signal;if(!signal)throw fail('room_union_policy');await decideFreshAssetChoice(expected,approve,{check:context.check,signal,watchClosing:notify=>{add.call(signal,'abort',notify,{once:true});return()=>remove.call(signal,'abort',notify);}});context.check();const actual=await context.captureCurrent();context.check();if(JSON.stringify(actual.current.selection)!==JSON.stringify(expected.plan.before))throw fail();
  return Object.freeze({format:'breditor/native-room-union-retirement' as const,formatVersion:1 as const,preparation:expected,state:'old-writers-closed' as const,scope:'local-native-and-selected-asset-custody-only' as const});
 });
}
/** All real author locks stay with the original canonical owner across failed
 * old cleanup, until taken through the existing genuine stopped-cohort API. */
export function retireNativeRoomUnionKeepingActors<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions<P>,options:NativeRoomUnionRetirementOptions){return retire(owner,provided,options);}
/** A previously returned warm attempt must own the genuine reservation. */
export function retireReservedNativeRoomUnionKeepingActors<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,reservation:SelectedActorExecutionReservation,provided:PhysicalOperationV3HistoryReadOptions<P>,options:NativeRoomUnionRetirementOptions){return retire(owner,provided,options,reservation);}
