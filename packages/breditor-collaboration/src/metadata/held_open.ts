/** Private no-write adoption of an existing atomic metadata child. Neither
 * serialized fields nor copied options issue native work or storage custody. */
import {RelayWorkCustody,checkOrdinaryRelayWork} from '../relay/work_custody.js';
import type {NativeRelayDeliveryPort} from '../relay/native_delivery.js';
import {retainedStoreOwner,retainedStoreCommitted,type RetainedStorePort} from '../delivery_ports/retained.js';
import type {SegmentedRetainedKind} from '../segmented_relay/retained_contract.js';
import {SharedRelayError} from '../relay/validation.js';
const selected=new WeakMap<object,NativeRelayDeliveryPort>(),owners=new WeakMap<object,HeldMetadataOpen>();
const fail=()=>new SharedRelayError('metadata_preparation_policy');
export interface HeldMetadataOpen{readonly port:NativeRelayDeliveryPort;check():void}
export function withHeldMetadataOpen<T extends object>(input:T,port:NativeRelayDeliveryPort):T{port.check();selected.set(input,port);return input;}
export function selectedHeldMetadataOpen<K extends SegmentedRetainedKind>(input:object,core:object,atomic:RetainedStorePort<K>|undefined,ordinaryFailure:()=>Error):HeldMetadataOpen|undefined{
 const port=selected.get(input);if(!port){checkOrdinaryRelayWork(core,ordinaryFailure);return;}
 if(port.core!==core||!atomic||!retainedStoreOwner(atomic,core))throw fail();
 port.check();atomic.check();const encoded=JSON.stringify(retainedStoreCommitted(atomic,core));
 const check=()=>{port.check();atomic.check();if(JSON.stringify(atomic.read())!==encoded||JSON.stringify(retainedStoreCommitted(atomic,core))!==encoded)throw new SharedRelayError('metadata_preparation_unsaved');port.check();};
 check();return Object.freeze({port,check});
}
/** Genuine constructor registration also lets the catalog construct its original
 * disconnected sync owner with ordinary permissions under the same hold. */
export function registerHeldMetadataOwner(owner:object,opening:HeldMetadataOpen|undefined):void{if(!opening)return;if(owners.has(owner))throw fail();owners.set(owner,opening);}
export function heldMetadataWork(core:object,idle:()=>boolean,failure:()=>Error,opening:HeldMetadataOpen|undefined):RelayWorkCustody{
 if(opening){opening.check();return RelayWorkCustody.ordinaryDuringRecovery(core,idle,failure,opening.port.admission);}
 return new RelayWorkCustody(core,idle,failure);
}
export function takeHeldMetadataOwner(owner:object):HeldMetadataOpen|undefined{const opening=owners.get(owner);owners.delete(owner);return opening;}
