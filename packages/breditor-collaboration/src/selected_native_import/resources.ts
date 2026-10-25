/** Actual independent input-namespace custody. Failed openings retain their
 * request/connection/lease closures for retry; success transfers only immutable
 * input storage, never the selected room or its native writers. */
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {SelectedNativeImportInputStore,nativeImportInputRecord} from './input_store.js';
import {fail} from './policy.js';
import type {SelectedNativeImportFile,SelectedNativeImportChoice} from './contract.js';
const open=SelectedNativeImportInputStore.prototype.open,verify=SelectedNativeImportInputStore.prototype.verifyFresh,seal=SelectedNativeImportInputStore.prototype.sealPreparation,close=SelectedNativeImportInputStore.prototype.close;
export class NativeImportInputResources{
 readonly #factory=recoveryOpeningContext();readonly #locks=navigator.locks;
 #opening:RecoveryOpeningCustody|undefined;#lease:RecoveryLease|undefined;#store:SelectedNativeImportInputStore|undefined;#file:SelectedNativeImportFile|undefined;#opened=false;#closing=false;#closed=false;#moved=false;#cleanup:Promise<void>|undefined;
 constructor(){Object.freeze(this);}
 check=()=>{if(this.#closing||this.#closed||globalThis.indexedDB!==this.#factory||globalThis.navigator?.locks!==this.#locks)throw fail('native_import_closed');if(this.#lease)checkRecoveryLeasesHeld([this.#lease]);if(this.#opened)this.#store!.checkCurrent();};
 async open(choice:SelectedNativeImportChoice,input:SelectedNativeImportFile,integrity:SharedArchiveIntegrityOptions):Promise<void>{
  if(this.#opening||this.#lease||this.#closed)throw fail('native_import_busy');const check=()=>{this.check();integrity.checkAuthority();this.check();};
  this.#opening=await RecoveryOpeningCustody.reserve(this.#factory,[choice.database],()=>this.#close(),{policy:()=>fail('native_import_policy'),busy:()=>fail('native_import_busy'),storage:()=>fail('native_import_storage')});check();this.#lease=await RecoveryLease.acquire(JSON.stringify(choice.database));check();
  const store=new SelectedNativeImportInputStore(this.#factory,choice.database,nativeImportInputRecord({format:'breditor/selected-native-import-retained-input',formatVersion:1,choice,file:input.file}),check,integrity.wasm,integrity.signal);this.#store=store;
  // The unopened store is not a current connection yet. Its own opening job
  // checks actual namespace custody separately from that connection lifetime.
  await open.call(store);this.#opened=true;await verify.call(store,()=>{checkRecoveryLeasesHeld([this.#lease!]);integrity.checkAuthority();},integrity.signal);this.check();seal.call(store);this.#file=input;
 }
 file():SelectedNativeImportFile{this.check();if(!this.#file)throw fail('native_import_closed');return this.#file;}
 async verifyFresh(authority:()=>void,signal?:AbortSignal):Promise<SelectedNativeImportFile>{this.check();const value=await verify.call(this.#store!,()=>{this.check();authority();this.check();},signal);this.check();return Object.freeze({selection:value.choice.input,file:value.file});}
 consume():void{this.check();if(!this.#file||!this.#opening||this.#moved)throw fail('native_import_busy');this.#opening.complete();this.#moved=true;}
 close():Promise<void>{this.#closing=true;return this.#moved?this.#close():this.#opening?this.#opening.rollback():this.#close();}
 #close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;this.#cleanup=(async()=>{if(this.#store)await close.call(this.#store);await this.#lease?.close();this.#store=undefined;this.#lease=undefined;this.#file=undefined;this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
