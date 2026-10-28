/** Cold mixed-room admission reproduces every native/store recipe and both sides of each declared union. */
import{LoadedNativeReconstructionCurrent as Loaded}from'../selected_native_reconstruction/loaded_current.js';
import{readReconstructionCatalog,preparedMemberBytes}from'../native_room_retirement/catalog.js';
import{PhysicalRoomCatalogV3Archive}from'../physical_room_catalog_v3/archive.js';
import{executionNativeDescriptors}from'../native_room_execution/native_descriptors.js';
import{buildNativeRoomUnionRecipes}from'./recipes.js';
import{NativeRoomUnionReadScope as Scope}from'./read_scope.js';
import{readNativeRoomUnionFrame,type RoomUnionParts}from'./framing.js';
import{unionChoice,unionPlan,unionPlanTargets,checkUnionSources,matchUnionAuthorizations}from'./plan.js';
import type{NativeRoomUnionChoice as Choice,NativeRoomUnionReadOptions as Read}from'./contract.js';
import{fail}from'./policy.js';
import type{AuthenticatedNativeRoomUnionReadOptions as AuthRead}from'../native_room_union_authentication/contract.js';
const token=Object.freeze({}),l={read:Loaded.read,dispose:Loaded.prototype.dispose},dispose=PhysicalRoomCatalogV3Archive.prototype.dispose;
export class NativeRoomUnionArchive{
 readonly #choice;#state:Readonly<{file:Blob;parts:RoomUnionParts;scope:Scope}>|undefined;
 private constructor(key:object,choice:Choice,state:Readonly<{file:Blob;parts:RoomUnionParts;scope:Scope}>){if(key!==token)throw fail('room_union_policy');this.#choice=choice;this.#state=state;Object.freeze(this);}
 #open(){const state=this.#state;if(!state)throw fail('room_union_closed');state.scope.check();if(this.#state!==state)throw fail('room_union_closed');return state;}
 choice(){this.#open();return this.#choice;}
 file(){return this.#open().file;}
 before(){return Object.freeze({...this.#open().parts.before});}
 retained(){return Object.freeze({...this.#open().parts.retained});}
 participant(id:string){const file=this.#open().parts.participants.get(id);if(!file)throw fail('room_union_policy');return file;}
 /** A fresh immutable tuple, not a borrowed mutable slot in the admitted archive. */
 participantUnion(id:string){const part=this.#open().parts.unions.get(id);if(!part)throw fail('room_union_policy');return Object.freeze({...part});}
 dispose(){const state=this.#state;this.#state=undefined;state?.scope.close();}
 static async read(input:Blob,provided:Choice,options:Read):Promise<NativeRoomUnionArchive>{if(this!==NativeRoomUnionArchive)throw fail('room_union_policy');return this.#read(input,provided,options,false);}
 static async readAuthenticated(input:Blob,provided:Choice,options:AuthRead):Promise<NativeRoomUnionArchive>{if(this!==NativeRoomUnionArchive)throw fail('room_union_policy');return this.#read(input,provided,options,true);}
 static async #read(input:Blob,provided:Choice,options:Read|AuthRead,authenticated:boolean):Promise<NativeRoomUnionArchive>{
  const choice=unionChoice(provided),targets=unionPlanTargets(choice.plan),scope=new Scope(options,authenticated);let before:Loaded|undefined,retained:Loaded|undefined,catalog:PhysicalRoomCatalogV3Archive|undefined,complete=false;
  try{if(!authenticated)matchUnionAuthorizations(targets,scope.authorizations);const integrity={wasm:scope.base.integrity.wasm,checkAuthority:scope.check,signal:scope.base.signal},framed=await readNativeRoomUnionFrame(input,choice,integrity);scope.check();before=await l.read.call(Loaded,framed.parts.before,integrity);retained=await l.read.call(Loaded,framed.parts.retained,integrity);scope.check();checkUnionSources(before,retained,choice.plan.database,targets);
   if(authenticated){scope.checkCatalogs(before,retained);await scope.authorize(targets);matchUnionAuthorizations(targets,scope.authorizations);}
   const context={before,retained,nativeReads:scope.base.reads,assets:scope.base.assets,integrity,check:scope.check},admitted=await readReconstructionCatalog(context,choice.plan,id=>{const file=framed.parts.participants.get(id);if(!file)throw fail();return file;});catalog=admitted.catalog;scope.check();const descriptors=await executionNativeDescriptors(retained,scope.base),rebuilt=await buildNativeRoomUnionRecipes({...context,descriptors,integrityDigest:scope.base.integrity.digest,resolveAsset:id=>preparedMemberBytes(catalog!,id,scope.check)},choice.plan.database,targets,scope.authorizations,framed.parts.unions);scope.check();if(rebuilt.pending.length||JSON.stringify(unionPlan({...choice.plan,participants:rebuilt.participants}))!==JSON.stringify(choice.plan))throw fail();if(authenticated)await scope.verify();const result=new NativeRoomUnionArchive(token,choice,{file:framed.file,parts:framed.parts,scope});complete=true;return result;
  }finally{try{if(catalog)dispose.call(catalog);}finally{try{if(retained)l.dispose.call(retained);}finally{try{if(before)l.dispose.call(before);}finally{if(!complete)scope.close();}}}}
 }
}
