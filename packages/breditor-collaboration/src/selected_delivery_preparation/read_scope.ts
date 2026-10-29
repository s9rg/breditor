/** Own cancellation/integrity lifetime, independent of the delivery adapter. */
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {participantAuthority} from '../participant_backup/policy.js';
export class DeliveryPreparationReadScope{
 readonly #waits;readonly integrity;readonly signal;
 constructor(options:SharedArchiveIntegrityOptions){this.#waits=new NativeReconstructionWaits(participantAuthority(options.checkAuthority),[options.signal]);this.signal=this.#waits.signal;try{this.integrity=prepareArchiveIntegrity({wasm:options.wasm,checkAuthority:this.check,signal:this.signal});Object.freeze(this);}catch(error){this.#waits.close();throw error;}}
 check=()=>{this.#waits.check();};close():void{this.#waits.close();}
}
