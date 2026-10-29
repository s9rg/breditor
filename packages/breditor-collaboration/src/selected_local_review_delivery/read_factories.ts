/** Borrow only constructor-selected readonly factories. Cancellation observes
 * late results and frees unclaimed Rust owners; it never reopens an old job. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {selectedNativeDeliveryReads} from '../relay/native_delivery.js';
import {NativeReconstructionFactoryScope} from '../selected_native_reconstruction/factory_scope.js';
const bind=NativeReconstructionFactoryScope.prototype.bind,close=NativeReconstructionFactoryScope.prototype.close;
export function localReviewReadFactories(scope:SelectedNativeRecoveryScope){const owner=new NativeReconstructionFactoryScope(selectedNativeDeliveryReads(scope));try{bind.call(owner,scope);return Object.freeze({reads:owner.reads,close:()=>close.call(owner)});}catch(error){close.call(owner);throw error;}}
