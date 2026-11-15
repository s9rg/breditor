/** Freeze the read factory and policy before the first host callback or asynchronous read. */
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {snapshotIndependentDeliveryIdentityFactory} from '../independent_delivery_recovery/factory_policy.js';
import type {SharedIndependentDeliveryIdentity,SharedIndependentDeliveryOptions} from '../independent_delivery/contract.js';
import {snapshotReadFactoryData} from '../operation_read/read_factory_snapshot.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import type {SharedIndependentDeliveryBranchArchiveReadOptions} from './contract.js';

export class BranchArchiveScope {
 readonly #work;
 readonly #factory;
 readonly integrity;
 readonly limits;
 readonly signal;

 constructor(options:SharedIndependentDeliveryBranchArchiveReadOptions){
  this.#factory=snapshotReadFactoryData(options.session);
  this.limits=checkRichAssetLimits(options.limits===undefined?{}:
   fields(options.limits,[],['maxFileBytes','maxDimension','maxPixels','maxStoredBytes']));
  this.#work=new NativeReconstructionWaits(participantAuthority(options.checkAuthority),[options.signal]);
  this.signal=this.#work.signal;
  try{
   this.integrity=prepareArchiveIntegrity({wasm:options.wasm,checkAuthority:this.check,signal:this.signal});
  }catch(error){
   this.#work.close();
   throw error;
  }
 }

 session(identity:SharedIndependentDeliveryIdentity):SharedIndependentDeliveryOptions{
  const chosen=snapshotIndependentDeliveryIdentityFactory(identity,this.#factory,true);
  const history=chosen.documentHistory;
  const documentHistory=history.kind==='original'
   ? {...history,restoreOriginal:this.#work.restore(history.restoreOriginal,history)}
   : {...history,restoreSegmented:this.#work.restore(history.restoreSegmented,history)};
  return {...chosen,database:'branch-archive-read-only',documentHistory,create(){
   throw new Error('A branch archive requires both original checkpoints');
  }} as SharedIndependentDeliveryOptions;
 }

 check=()=>{this.#work.check();};
 close(){this.#work.close();}
}
