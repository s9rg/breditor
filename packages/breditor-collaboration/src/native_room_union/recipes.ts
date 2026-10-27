/** Rebuild every closed family. Union mode never skips a participant or converts a saved role into authority. */
import{verifySelectedRoomNativeParticipantContinuation}from'../selected_room_current/native_continuation.js';
import{verifySelectedUploadContinuation}from'../physical_room_asset_successor/asset_continuation.js';
import{tighterExecutionLimits}from'../native_room_execution/asset_decisions.js';
import{buildComparedReconstructionParticipant}from'../selected_native_reconstruction/participant_recipe.js';
import{buildDeliveryReconstructionRecipe,type DeliveryReconstructionReadFactory}from'../selected_native_reconstruction/delivery_recipe.js';
import{SharedIndependentDeliveryUnionArchive as Union}from'../independent_delivery_union_archive/archive.js';
import{SharedIndependentDeliveryParticipantBackup as Backup}from'../independent_delivery_participant/backup.js';
import type{ReconstructionCatalogReadContext}from'../native_room_retirement/catalog.js';
import type{SharedAssetBytesResolver,SharedAssetBytesPending}from'../asset_bytes/types.js';
import type{NativeRoomUnionTarget as Target,NativeRoomUnionParticipant as Participant,NativeRoomUnionAuthorization}from'./contract.js';
import type{SharedIndependentDeliveryUnionArchiveFile}from'../independent_delivery_union_archive/contract.js';
import{checkUnionSources,matchUnionAuthorizations}from'./plan.js';
import{fail}from'./policy.js';
export interface UnionRecipeContext extends ReconstructionCatalogReadContext{readonly descriptors:ReadonlyMap<string,string>;readonly integrityDigest:(file:Blob)=>Promise<string>;readonly resolveAsset?:(id:string)=>SharedAssetBytesResolver|undefined}
const u={build:Union.build,read:Union.read,choice:Union.prototype.choice,file:Union.prototype.file,input:Union.prototype.input,output:Union.prototype.output,dispose:Union.prototype.dispose},b={read:Backup.read,blob:Backup.prototype.blob,dispose:Backup.prototype.dispose};
export async function buildNativeRoomUnionRecipes(context:UnionRecipeContext,name:string,targets:readonly Target[],grants:readonly NativeRoomUnionAuthorization[],retainedUnions?:ReadonlyMap<string,SharedIndependentDeliveryUnionArchiveFile>){
 const check=context.check;checkUnionSources(context.before,context.retained,name,targets);matchUnionAuthorizations(targets,grants);const participants:Participant[]=[],files=new Map<string,Blob>(),unions=new Map<string,SharedIndependentDeliveryUnionArchiveFile>(),pending:{id:string;pending:readonly SharedAssetBytesPending[]}[]=[];
 for(const target of targets){check();const factory=context.nativeReads.find(r=>r.id===target.id),descriptor=context.descriptors.get(target.id);if(!factory||!descriptor)throw fail('room_union_policy');
  if(target.mode==='continuation'){
   await verifySelectedRoomNativeParticipantContinuation(context.before.nativeCut(),context.retained.nativeCut(),{reads:context.nativeReads,checkAuthority:check,...(context.integrity.signal?{signal:context.integrity.signal}:{})},target.id,descriptor,check);check();const limits=context.before.approval().choice.adoption.participants.find(p=>p.id===target.id)?.limits;if(!limits)throw fail();await verifySelectedUploadContinuation(context.before.selectedUploads(target.id),context.retained.selectedUploads(target.id),tighterExecutionLimits(limits,context.assets?.limits),check,context.integrity.signal);check();
   const resolver=context.resolveAsset?.(target.id),recipe=await buildComparedReconstructionParticipant({id:target.id,before:context.before,retained:context.retained,read:factory.read,descriptor,assets:context.assets,resolveAsset:resolver,check},target.family);check();if(recipe.kind==='pending'){pending.push({id:target.id,pending:recipe.pending});continue;}const file=recipe.participant.file;participants.push({...target,mode:'continuation',selection:recipe.participant.selection,bytes:file.size,sha256:await context.integrityDigest(file),mime:file.type} as Participant);files.set(target.id,file);continue;
  }
  const session=(factory.read as {session:DeliveryReconstructionReadFactory}).session,authorization=grants.find(g=>g.id===target.id)!;let admitted:Union|undefined,currentBackup:Backup|undefined,incomingBackup:Backup|undefined;
  try{
   const saved=retainedUnions?.get(target.id),policy={wasm:context.integrity.wasm,session,authorizations:authorization.authorizations,checkAuthority:check,...(context.assets?.limits?{limits:context.assets.limits}:{}),...(context.integrity.signal?{signal:context.integrity.signal}:{})};
   if(retainedUnions&&!saved)throw fail();
   if(saved){admitted=await u.read.call(Union,saved.file,saved.choice,policy);check();const a=u.input.call(admitted,'current'),c=u.input.call(admitted,'incoming');currentBackup=await b.read.call(Backup,a.file,a.selection,context.assets);incomingBackup=await b.read.call(Backup,c.file,c.selection,context.assets);check();}
   const resolve=(side:'current'|'incoming')=>{const held=side==='current'?currentBackup:incomingBackup;if(!held)return context.resolveAsset?.(target.id);return(async reference=>{check();const file=b.blob.call(held,reference.asset,reference.generation);if(!file)return undefined;return{...reference,identity:/^sha256:[a-f0-9]{64}$/.test(reference.asset)?'content-addressed':'host-verified',blob:file,check};}) as SharedAssetBytesResolver;};
   const input=[];for(const[side,source]of[['current',context.before],['incoming',context.retained]]as const){const resolver=resolve(side),recipe=await buildDeliveryReconstructionRecipe(source,{id:target.id,session,...(context.assets?{assets:context.assets}:{}),...(resolver?{resolveAsset:resolver}:{})});check();if(recipe.kind==='pending'){pending.push({id:target.id,pending:recipe.pending});break;}input.push(recipe.participant);}
   if(input.length!==2)continue;
   if(admitted){for(const[i,side]of(['current','incoming']as const).entries()){const exact=u.input.call(admitted,side),rebuilt=input[i]!;if(JSON.stringify(exact.selection)!==JSON.stringify(rebuilt.selection)||exact.file.size!==rebuilt.file.size||await context.integrityDigest(exact.file)!==await context.integrityDigest(rebuilt.file))throw fail();check();}}
   else{const ns=(role:string)=>{const n=target.namespaces.find(n=>n.role===role);if(!n)throw fail();return n.database;},built=await u.build.call(Union,{...policy,current:input[0]!,incoming:input[1]!,layout:{database:target.unionDatabase,recoveryDatabase:ns('recovery'),sourceDatabase:ns('recovery-source'),uploadsDatabase:ns('uploads')},choices:target.choices});check();if(built.kind==='pending'){pending.push({id:target.id,pending:built.pending});continue;}admitted=built.archive;}
   const choice=u.choice.call(admitted),output=u.output.call(admitted),file=output.file;participants.push({id:target.id,sourceFamily:target.sourceFamily,family:target.family,namespaces:target.namespaces,mode:'independent-delivery-union',union:choice,selection:output.selection,bytes:file.size,sha256:await context.integrityDigest(file),mime:file.type} as Participant);files.set(target.id,file);unions.set(target.id,Object.freeze({choice,file:u.file.call(admitted)}));check();
  }finally{try{if(incomingBackup)b.dispose.call(incomingBackup);}finally{try{if(currentBackup)b.dispose.call(currentBackup);}finally{if(admitted)u.dispose.call(admitted);}}}
 }
 check();return{participants,files,unions,pending};
}
