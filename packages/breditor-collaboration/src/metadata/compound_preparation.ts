import type {SharedContinuedPairSession} from '../continued_pair/session.js';
import type {SharedSegmentedRelaySession} from '../segmented_relay/session.js';
import type {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
/** Exact source-owned metadata preparation. No record is staged or rewritten,
 * no credential is acquired, and no ordinary editor/store permission is granted. */
import {RelayWorkCustody} from '../relay/work_custody.js';
import {nativeRelayDeliveryForSource,type NativeRelayDelivery,type NativeRelayDeliveryPort} from '../relay/native_delivery.js';
import type {SharedDocumentVersions} from '../versions/catalog.js';import type {SharedSuggestionQueue} from '../suggestions/queue.js';import type {SharedSuggestionRevisions} from '../suggestion_revisions/outbox.js';
import type {SharedSelectionPolicy} from '../types.js';import {SharedRelayError} from '../relay/validation.js';
export interface PreparedCompoundMetadata<P extends SharedSelectionPolicy=SharedSelectionPolicy>{readonly versions:SharedDocumentVersions<P>|null;readonly suggestions:SharedSuggestionQueue<P>|null;readonly revisions:SharedSuggestionRevisions<P>|null}
interface Source{core:object;prepare(port:NativeRelayDeliveryPort):Promise<PreparedCompoundMetadata>}
const sources=new WeakMap<object,Source>(),busy=new WeakSet<object>();const fail=()=>new SharedRelayError('metadata_preparation_source');
export function registerCompoundMetadataSource<P extends SharedSelectionPolicy>(owner:object,core:object,prepare:(port:NativeRelayDeliveryPort)=>Promise<PreparedCompoundMetadata<P>>):void{if(sources.has(owner))throw fail();sources.set(owner,{core,prepare:prepare as Source['prepare']});}
/** Context closing waits for the actual preparation promise, including late
 * lock callbacks. Successfully opened children remain owned by the source. A
 * refused later child never discards an earlier child or its original records. */
export function prepareCompoundMetadata<P extends SharedSelectionPolicy=SharedSelectionPolicy>(owner:SharedSegmentedRelaySession<P>|SharedIndependentDeliverySession<P>|SharedContinuedPairSession<P>,delivery:NativeRelayDelivery):Promise<PreparedCompoundMetadata<P>>{
 const source=sources.get(owner);if(!source)return Promise.reject(fail());let port:NativeRelayDeliveryPort;
 try{port=nativeRelayDeliveryForSource(delivery,owner,source.core);if(busy.has(owner))throw new SharedRelayError('metadata_preparation_busy');}catch(error){return Promise.reject(error);}
 busy.add(owner);let stopped=false,pending:Promise<PreparedCompoundMetadata>|undefined;
 const work=new RelayWorkCustody(source.core,()=>false,fail,port.admission);
 const check=()=>{if(stopped)throw new SharedRelayError('metadata_preparation_closed');port.check();};
 try{port.track(()=>{stopped=true;},async()=>{if(pending)await pending.catch(()=>{});});
  pending=work.run(()=>Promise.resolve().then(async()=>{check();const result=await source.prepare(port);check();return Object.freeze(result);})).finally(()=>{busy.delete(owner);work.retire(()=>{});});return pending as Promise<PreparedCompoundMetadata<P>>;
 }catch(error){busy.delete(owner);work.retire(()=>{});return Promise.reject(error);}
}
