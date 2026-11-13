/** Fresh bounded DATA read policy. These checks and factory wrappers confer no
 * native/root ownership; only independently admitted files may use their results. */
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {snapshotPhysicalHistoryReadOptions} from '../physical_room_operation_v3/history_read.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import type {SharedRustOwner} from '../types.js';
import type {RoomExecutionReadOptions} from './contract.js';
import {fields} from './policy.js';
type Restore=(...args:never[])=>SharedRustOwner|Promise<SharedRustOwner>;
export class RoomExecutionReadScope{
 readonly #waits:NativeReconstructionWaits;readonly integrity;readonly reads:RoomExecutionReadOptions['reads'];readonly assets:RoomExecutionReadOptions['assets'];readonly signal:AbortSignal;
 constructor(provided:RoomExecutionReadOptions){
  const r=fields(provided,['wasm','reads','checkAuthority'],['signal','assets']),chosen=snapshotPhysicalHistoryReadOptions({reads:r['reads'] as RoomExecutionReadOptions['reads'],checkAuthority:participantAuthority(r['checkAuthority'] as ()=>void),...(r['signal']!==undefined?{signal:r['signal'] as AbortSignal}:{})}),a=r['assets']===undefined?undefined:fields(r['assets'],[],['limits','signal']),supplied=a?.['limits'],limits=checkRichAssetLimits(supplied===undefined?{}:fields(supplied,[],['maxFileBytes','maxPixels','maxDimension','maxStoredBytes']));
  this.#waits=new NativeReconstructionWaits(chosen.checkAuthority,[chosen.signal,a?.['signal'] as AbortSignal|undefined]);this.signal=this.#waits.signal;this.assets=Object.freeze({limits,signal:this.signal});
  try{this.integrity=prepareArchiveIntegrity({wasm:r['wasm'] as RoomExecutionReadOptions['wasm'],checkAuthority:this.check,signal:this.signal});this.reads=Object.freeze(chosen.reads.map(row=>{
   const next={...row.read} as Record<string,unknown>;for(const name of['restore','restoreSegmented','restoreContinued'])if(typeof next[name]==='function')next[name]=this.#waits.restore(next[name] as Restore,row.read);
   const selected=next['session'];if(selected&&typeof selected==='object'&&!Array.isArray(selected)){const session={...selected} as Record<string,unknown>,history=session['documentHistory'];if(history&&typeof history==='object'&&!Array.isArray(history)){const copy={...history} as Record<string,unknown>;for(const name of['restoreOriginal','restoreSegmented'])if(typeof copy[name]==='function')copy[name]=this.#waits.restore(copy[name] as Restore,history);session['documentHistory']=Object.freeze(copy);}next['session']=Object.freeze(session);}return Object.freeze({id:row.id,read:Object.freeze(next)});
  })) as unknown as RoomExecutionReadOptions['reads'];this.check();Object.freeze(this);}catch(error){this.#waits.close();throw error;}
 }
 check=()=>{this.#waits.check();};
 close():void{this.#waits.close();}
}
