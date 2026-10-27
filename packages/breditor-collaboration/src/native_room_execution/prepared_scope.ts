/** Rebuild the exact native catalog from complete immutable preparation. No
 * participant target, mutable native source, storage or provider is opened. */
import {verifyExecutionPrepared} from './verify_prepared.js';
import {RoomPreparationArchive} from '../native_room_preparation/archive.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import {PhysicalRoomCatalogV3Archive} from '../physical_room_catalog_v3/archive.js';
import {readPreparedReconstructionCatalog} from '../native_room_retirement/catalog.js';
import type {RoomPreparationFile} from '../native_room_preparation/contract.js';
import type {RoomExecutionReadScope} from './read_scope.js';
const p={read:RoomPreparationArchive.read,before:RoomPreparationArchive.prototype.before,retained:RoomPreparationArchive.prototype.retained,dispose:RoomPreparationArchive.prototype.dispose},l={read:Loaded.read,dispose:Loaded.prototype.dispose},disposeCatalog=PhysicalRoomCatalogV3Archive.prototype.dispose;
export async function withExecutionPrepared<R>(input:RoomPreparationFile,scope:RoomExecutionReadScope,visit:(context:Readonly<{before:Loaded;retained:Loaded;catalog:PhysicalRoomCatalogV3Archive}>)=>Promise<R>):Promise<R>{let prepared:RoomPreparationArchive|undefined,before:Loaded|undefined,retained:Loaded|undefined,catalog:PhysicalRoomCatalogV3Archive|undefined;let value:R;
 try{scope.check();const integrity={wasm:scope.integrity.wasm,checkAuthority:scope.check,signal:scope.signal};prepared=await p.read.call(RoomPreparationArchive,input.file,input.choice,integrity);scope.check();before=await l.read.call(Loaded,p.before.call(prepared),integrity);retained=await l.read.call(Loaded,p.retained.call(prepared),integrity);scope.check();catalog=(await readPreparedReconstructionCatalog({before,retained,nativeReads:scope.reads,assets:scope.assets,integrity,check:scope.check},prepared)).catalog;scope.check();await verifyExecutionPrepared(before,retained,catalog,prepared,scope);scope.check();value=await visit({before,retained,catalog});scope.check();}
 finally{try{if(catalog)disposeCatalog.call(catalog);}finally{try{if(retained)l.dispose.call(retained);}finally{try{if(before)l.dispose.call(before);}finally{if(prepared)p.dispose.call(prepared);}}}}
 scope.check();return value;
}
