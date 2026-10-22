import {inventoryMetadata,inventoryIdentity} from "./parse.js";
import {checkInventorySources} from "./coverage.js";
import {checkInventoryGenerationSources} from "./generation_coverage.js";
import {checkInventoryIndependentSources} from './independent_coverage.js';
import {frozen,inventorySignal,invalid,MAX_SHARED_ROOM_PARTICIPANT_INVENTORY_BYTES,SharedRoomParticipantInventoryError} from "./policy.js";
import type {SharedRoomParticipantInventoryIdentity,SharedRoomParticipantInventoryMetadata,SharedRoomParticipantSource,SharedRoomGenerationParticipantSource,SharedRoomParticipantCoverage} from "./types.js";
import type {SharedRoomIndependentParticipantSource} from './types.js';
const key=Object.freeze({}),states=new WeakMap<SharedRoomParticipantInventory,{file:Blob;metadata:SharedRoomParticipantInventoryMetadata}>();
const closed=()=>new SharedRoomParticipantInventoryError("inventory_closed","The inventory is disposed or was not admitted by this SDK");
/** Exact independently selected native metadata, not authentication or native server replay proof. */
export class SharedRoomParticipantInventory {
 readonly #identity:SharedRoomParticipantInventoryIdentity;readonly #metadata:SharedRoomParticipantInventoryMetadata;
 private constructor(token:object,file:Blob,metadata:SharedRoomParticipantInventoryMetadata,identity:SharedRoomParticipantInventoryIdentity){if(token!==key)throw closed();this.#identity=identity;this.#metadata=metadata;states.set(this,{file,metadata});Object.freeze(this);}
 identity():SharedRoomParticipantInventoryIdentity{return this.#identity;}
 metadata():SharedRoomParticipantInventoryMetadata{return this.#metadata;}
 file():Blob{const state=states.get(this);if(!state)throw closed();return state.file;}
 /** Detached diagnostic coverage. This checks no credentials and grants no activation authority. */
 checkSources(sources:readonly SharedRoomParticipantSource[]):SharedRoomParticipantCoverage{const state=states.get(this);if(!state)throw closed();try{const result=checkInventorySources(state.metadata,sources);if(states.get(this)!==state)throw closed();return result;}catch(error){if(error instanceof SharedRoomParticipantInventoryError)throw error;throw new SharedRoomParticipantInventoryError("inventory_source","The exact selected native source could not be verified");}}
 /** Generation-aware native prefix coverage. Retained history is not flattened or
  * reset; current authorization and whole-room activation remain separate. */
 checkGenerationSources(sources:readonly SharedRoomGenerationParticipantSource[]):SharedRoomParticipantCoverage{const state=states.get(this);if(!state)throw closed();try{const result=checkInventoryGenerationSources(state.metadata,sources);if(states.get(this)!==state)throw closed();return result;}catch(error){if(error instanceof SharedRoomParticipantInventoryError)throw error;throw new SharedRoomParticipantInventoryError("inventory_source","The exact generation source could not be verified");}}
 /** Read both selected native lanes without flattening. No binding is invented
  * for local-only comments, and no source becomes a current permission grant. */
 checkIndependentSources(sources:readonly SharedRoomIndependentParticipantSource[]):SharedRoomParticipantCoverage{const state=states.get(this);if(!state)throw closed();try{const result=checkInventoryIndependentSources(state.metadata,sources);if(states.get(this)!==state)throw closed();return result;}catch(error){if(states.get(this)!==state)throw closed();if(error instanceof SharedRoomParticipantInventoryError)throw error;throw new SharedRoomParticipantInventoryError('inventory_source','The genuine independent native source could not be verified');}}
 /** Drops file state; it never closes a borrowed source, upload store, client or connection. */
 dispose():void{states.delete(this);}
 static async read(input:Blob,expected:SharedRoomParticipantInventoryIdentity,options:{readonly signal?:AbortSignal}={}):Promise<SharedRoomParticipantInventory>{
  const signal=options.signal;inventorySignal(signal);const selected=inventoryIdentity(expected);
  if(!(input instanceof Blob)||input.size<1||input.size>MAX_SHARED_ROOM_PARTICIPANT_INVENTORY_BYTES)throw new SharedRoomParticipantInventoryError("inventory_budget","The native participant inventory exceeds its independent byte budget");
  const file=new Blob([input],{type:input.type}),bytes=new Uint8Array(await file.arrayBuffer());inventorySignal(signal);
  if(!globalThis.crypto?.subtle)throw new SharedRoomParticipantInventoryError("inventory_crypto","Inventory integrity requires Web Crypto SHA-256");
  const sha256=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));inventorySignal(signal);
  if(sha256.some((b,i)=>b!==selected.sha256[i]))throw new SharedRoomParticipantInventoryError("inventory_integrity","The inventory differs from the independently selected exact native file");
  let metadata:SharedRoomParticipantInventoryMetadata;
  try{const text=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes);metadata=inventoryMetadata(JSON.parse(text));if(JSON.stringify(metadata)!==text||JSON.stringify(metadata.room)!==JSON.stringify(selected.room))throw invalid();}catch{throw invalid();}
  inventorySignal(signal);return new SharedRoomParticipantInventory(key,file,frozen(metadata),selected);
 }
}
export const readSharedRoomParticipantInventory=(file:Blob,expected:SharedRoomParticipantInventoryIdentity,options:{readonly signal?:AbortSignal}={}):Promise<SharedRoomParticipantInventory>=>SharedRoomParticipantInventory.read(file,expected,options);
