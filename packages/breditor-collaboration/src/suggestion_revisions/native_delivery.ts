/** Private original-outbox execution, borrowing the genuine parent suggestion
 * delivery's one queue loan. Neither closing owner disposes the saved outbox. */
import {lendNativeSuggestionChild,type NativeSuggestionDelivery} from '../suggestions/native_delivery.js';
import {lendNativeRevisionStore,type NativeRevisionStore} from './native_store.js';
import {NativeRevisionRuntime,type NativeRevisionDeliveryOptions,type NativeRevisionDeliveryState} from './native_runtime.js';
import type {SharedSuggestionRevisions} from './outbox.js';
import type {SharedSelectionPolicy} from '../types.js';
import {SharedRelayError} from '../relay/validation.js';
export type {NativeRevisionDeliveryOptions,NativeRevisionDeliveryState} from './native_runtime.js';
export type NativeRevisionDelivery<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Pick<NativeRevisionRuntime<P>,'state'|'entries'|'revisions'|'status'|'packet'|'subscribe'|'connect'|'synchronize'|'flushLocal'|'retryLocal'|'loadRevision'|'disconnect'>&{close():Promise<void>};
export function createNativeRevisionDelivery<P extends SharedSelectionPolicy>(outbox:SharedSuggestionRevisions<P>,parent:NativeSuggestionDelivery,input:NativeRevisionDeliveryOptions={}):NativeRevisionDelivery<P>{
 const child=lendNativeSuggestionChild<P>(parent);let store:NativeRevisionStore<P>|undefined,runtime:NativeRevisionRuntime<P>|undefined,closed=false,ending:Promise<void>|undefined;
 const stop=()=>{runtime?.stop();};
 const close=()=>{if(closed)return Promise.resolve();if(ending)return ending;stop();ending=(async()=>{await runtime?.drain();await store?.close();child.release();closed=true;})().finally(()=>{ending=undefined;});return ending;};
 try{child.check();const allowed=new Set(['onState','onError']);if(!input||typeof input!=='object'||Reflect.ownKeys(input).some(key=>typeof key!=='string'||!allowed.has(key)))throw new SharedRelayError('native_revision_options');const options={...input};child.check();store=lendNativeRevisionStore(outbox,child);const transport=child.transport;if(!transport.checkSuggestionRevisions||!transport.requestSuggestionRevision||!transport.suggestionRevisionsReady)throw new SharedRelayError('suggestion_revisions_unavailable');transport.checkSuggestionRevisions(store.core,store.identity,store.binding);runtime=new NativeRevisionRuntime(child,store,options);child.install(stop,close);const actual=runtime;
  return Object.freeze({state:()=>actual.state(),entries:()=>actual.entries(),revisions:()=>actual.revisions(),status:(id:string)=>actual.status(id),packet:(id:string)=>actual.packet(id),subscribe:(listener:()=>void)=>actual.subscribe(listener),connect:()=>actual.connect(),synchronize:()=>actual.synchronize(),flushLocal:()=>actual.flushLocal(),retryLocal:()=>actual.retryLocal(),loadRevision:(id:string)=>actual.loadRevision(id),disconnect:()=>actual.disconnect(),close});
 }catch(error){void close().catch(()=>{});throw error;}
}
