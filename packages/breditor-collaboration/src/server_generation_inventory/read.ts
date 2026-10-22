/** Immutable selected physical-family metadata. No native storage, role or connection changes. */
import {checkInventorySources} from "../room_participant_inventory/coverage.js";
import {checkInventoryGenerationSources} from "../room_participant_inventory/generation_coverage.js";
import {frozen,invalid,inventorySignal,SharedRoomParticipantInventoryError} from "../room_participant_inventory/policy.js";
import {serverGenerationParticipantIdentity,serverGenerationParticipantMetadata} from "./identity.js";
import {closed,MAX_SHARED_SERVER_LOG_GENERATION_PARTICIPANT_INVENTORY_BYTES} from "./policy.js";
import {checkPhysicalMixedSources} from "./mixed_coverage.js";
import {checkInventoryIndependentSources} from '../room_participant_inventory/independent_coverage.js';
import {checkPhysicalSourceCohort,checkOperationalPhysicalSourceCohort,type OperationalPhysicalCohortSource} from './cohort_coverage.js';
import type {SharedRoomParticipantSource,SharedRoomGenerationParticipantSource,SharedRoomParticipantCoverage} from "../room_participant_inventory/types.js";
import type {SharedRoomIndependentParticipantSource} from '../room_participant_inventory/types.js';
import type {SharedServerLogGenerationParticipantIdentity,SharedServerLogGenerationParticipantMetadata,SharedServerLogGenerationParticipantCoverage,SharedServerLogGenerationParticipantSource} from "./contract.js";
import type {SharedServerLogGenerationCohortSource} from './contract.js';
interface State {readonly file:Blob;readonly metadata:SharedServerLogGenerationParticipantMetadata}
const token=Object.freeze({}),states=new WeakMap<SharedServerLogGenerationParticipantInventory,State>();
let operationalCohort:(owner:SharedServerLogGenerationParticipantInventory,input:readonly OperationalPhysicalCohortSource[])=>SharedServerLogGenerationParticipantCoverage;
function snapshot(input:Blob):Blob {
 let bytes:unknown;
 try{if(typeof Blob!=="function"||!(input instanceof Blob))throw invalid();bytes=Object.getOwnPropertyDescriptor(Blob.prototype,"size")?.get?.call(input);}catch{bytes=undefined;}
 if(typeof bytes!=="number"||!Number.isSafeInteger(bytes)||bytes<1||bytes>MAX_SHARED_SERVER_LOG_GENERATION_PARTICIPANT_INVENTORY_BYTES)throw new SharedRoomParticipantInventoryError("inventory_budget","The native generation inventory exceeds its metadata ceiling");
 // Blob subclasses may override public size/type. Admit the actual native byte
 // length before allocation/hash reads and require a byte-complete immutable snapshot.
 try{const file=new Blob([input],{type:input.type});if(file.size!==bytes)throw invalid();return file;}catch{throw invalid();}
}
/** Distinct native physical-generation file reader, never an original file wrapper.
 * A genuine handle establishes selected metadata integrity, not native replay or account auth. */
export class SharedServerLogGenerationParticipantInventory {
 readonly #identity;readonly #metadata;
 private constructor(key:object,state:State,identity:SharedServerLogGenerationParticipantIdentity){if(key!==token)throw closed();this.#identity=identity;this.#metadata=state.metadata;states.set(this,state);Object.freeze(this);}
 identity():SharedServerLogGenerationParticipantIdentity{return this.#identity;}
 metadata():SharedServerLogGenerationParticipantMetadata{return this.#metadata;}
 file():Blob{const state=states.get(this);if(!state)throw closed();return state.file;}
 /** Genuine original client histories checked against this full physical source, without flattening. */
 checkSources(input:readonly SharedRoomParticipantSource[]):SharedServerLogGenerationParticipantCoverage{if(!states.has(this))throw closed();return this.#check(state=>checkInventorySources(state.metadata.native,input));}
 /** Genuine generation client histories checked natively; no old-journal translation or reset. */
 checkGenerationSources(input:readonly SharedRoomGenerationParticipantSource[]):SharedServerLogGenerationParticipantCoverage{if(!states.has(this))throw closed();return this.#check(state=>checkInventoryGenerationSources(state.metadata.native,input));}
 /** One explicit mixed cohort. Copies of a writer/actor across families refuse as a whole. */
 checkMixedSources(input:readonly SharedServerLogGenerationParticipantSource[]):SharedServerLogGenerationParticipantCoverage{if(!states.has(this))throw closed();return this.#check(state=>checkPhysicalMixedSources(state.metadata.native,input));}
 /** Explicit independent native families. Local-only comments remain unbound/Pending. */
 checkIndependentSources(input:readonly SharedRoomIndependentParticipantSource[]):SharedServerLogGenerationParticipantCoverage{if(!states.has(this))throw closed();return this.#check(state=>checkInventoryIndependentSources(state.metadata.native,input));}
 /** Separately named wider cohort; the old mixed-reader input remains unchanged. */
 checkSourceCohort(input:readonly SharedServerLogGenerationCohortSource[]):SharedServerLogGenerationParticipantCoverage{if(!states.has(this))throw closed();return this.#check(state=>checkPhysicalSourceCohort(state.metadata.native,input));}
 #check(run:(state:State)=>SharedRoomParticipantCoverage):SharedServerLogGenerationParticipantCoverage {
  const state=states.get(this);if(!state)throw closed();
  try{const coverage=run(state);if(states.get(this)!==state)throw closed();return frozen({source:this.#identity.source,coverage});}
  catch(error){if(states.get(this)!==state)throw closed();if(error instanceof SharedRoomParticipantInventoryError)throw error;throw new SharedRoomParticipantInventoryError("inventory_source","The genuine client history could not be checked against the selected physical source");}
 }
 static{operationalCohort=(owner,input)=>owner.#check(state=>checkOperationalPhysicalSourceCohort(state.metadata.native,input));}
 /** Close only this file reader, not any borrowed client/source, storage or host. */
 dispose():void{states.delete(this);}
 static async read(input:Blob,expected:SharedServerLogGenerationParticipantIdentity,options:{readonly signal?:AbortSignal}={}):Promise<SharedServerLogGenerationParticipantInventory>{
  const signal=options.signal;inventorySignal(signal);const selected=serverGenerationParticipantIdentity(expected);
  const file=snapshot(input);
  const bytes=new Uint8Array(await file.arrayBuffer());inventorySignal(signal);
  if(!globalThis.crypto?.subtle)throw new SharedRoomParticipantInventoryError("inventory_crypto","Generation inventory integrity requires Web Crypto SHA-256");
  const sha256=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));inventorySignal(signal);
  if(sha256.some((byte,index)=>byte!==selected.sha256[index]))throw new SharedRoomParticipantInventoryError("inventory_integrity","The generation inventory differs from the independently selected file");
  let metadata:SharedServerLogGenerationParticipantMetadata;
  try{const text=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes);metadata=serverGenerationParticipantMetadata(JSON.parse(text));if(JSON.stringify(metadata)!==text||JSON.stringify(metadata.source)!==JSON.stringify(selected.source))throw invalid();}catch{throw invalid();}
  inventorySignal(signal);return new SharedServerLogGenerationParticipantInventory(token,{file,metadata},selected);
 }
}
export const readSharedServerLogGenerationParticipantInventory=(file:Blob,expected:SharedServerLogGenerationParticipantIdentity,options:{readonly signal?:AbortSignal}={}):Promise<SharedServerLogGenerationParticipantInventory>=>SharedServerLogGenerationParticipantInventory.read(file,expected,options);
/** Private friend: requires the actual inventory brand and its lifetime around
 * one synchronous native cohort. No data marker or copied facade can stand in. */
export const checkOperationalPhysicalInventoryCohort=(owner:SharedServerLogGenerationParticipantInventory,input:readonly OperationalPhysicalCohortSource[])=>operationalCohort(owner,input);
