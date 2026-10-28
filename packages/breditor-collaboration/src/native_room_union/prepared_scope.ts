/** Exact mixed preparation to genuine ordinary catalog, scoped to a fresh
 * caller lifetime. No old exact protocol is relabeled and no actor is acquired. */
import{NativeRoomUnionArchive as Archive}from'./archive.js';
import{LoadedNativeReconstructionCurrent as Loaded}from'../selected_native_reconstruction/loaded_current.js';
import{readReconstructionCatalog}from'../native_room_retirement/catalog.js';
import type{NativeRoomUnionFile}from'./contract.js';
import type{NativeRoomUnionReadScope}from'./read_scope.js';
import type{PhysicalRoomCatalogV3Archive}from'../physical_room_catalog_v3/archive.js';
import type{PhysicalRoomCatalogV3ReadOptions}from'../physical_room_catalog_v3/contract.js';
export async function withNativeRoomUnionPrepared<R>(input:NativeRoomUnionFile,scope:NativeRoomUnionReadScope,visit:(context:Readonly<{before:Loaded;retained:Loaded;catalog:PhysicalRoomCatalogV3Archive;readOptions:PhysicalRoomCatalogV3ReadOptions}>)=>Promise<R>):Promise<R>{
 let archive:Archive|undefined,before:Loaded|undefined,retained:Loaded|undefined,catalog:PhysicalRoomCatalogV3Archive|undefined;
 try{scope.check();const base=scope.base,integrity={wasm:base.integrity.wasm,checkAuthority:scope.check,signal:base.signal};archive=await Archive.read(input.file,input.choice,{...integrity,reads:base.reads,authorizations:scope.authorizations,...(base.assets?{assets:base.assets}:{})});scope.check();before=await Loaded.read(archive.before(),integrity);retained=await Loaded.read(archive.retained(),integrity);const admitted=await readReconstructionCatalog({before,retained,nativeReads:base.reads,assets:base.assets,integrity,check:scope.check},input.choice.plan,id=>archive!.participant(id));catalog=admitted.catalog;scope.check();const result=await visit({before,retained,catalog,readOptions:admitted.readOptions});scope.check();return result;}
 finally{try{catalog?.dispose();}finally{try{retained?.dispose();}finally{try{before?.dispose();}finally{archive?.dispose();}}}}
}
