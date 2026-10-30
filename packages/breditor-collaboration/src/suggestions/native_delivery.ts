/** Private delivery of the exact original queue's existing immutable intent.
 * Original authenticated protocol and server decision order remain unchanged. */
import {SharedSuggestionSync,createNativeSuggestionSync,waitForRetiredSuggestionSync,type SharedSuggestionSyncState,type SharedSuggestionSyncOptions} from './sync.js';
import {lendSuggestionNativeQueue,type NativeSuggestionQueueLoan} from './native_queue.js';
import {nativeSuggestionTransportFor} from '../relay/native_suggestion_transport.js';
import type {SharedSuggestionQueue} from './queue.js';
import type {SharedSuggestionTransport} from './transport_port.js';
import type {NativeRelayDelivery} from '../relay/native_delivery.js';
import type {NativeSuggestionChild} from './native_child.js';
import type {SharedSelectionPolicy} from '../types.js';
import {SharedRelayError} from '../relay/validation.js';
export type NativeSuggestionDeliveryOptions=Omit<SharedSuggestionSyncOptions,'autoStart'>;
export interface NativeSuggestionDelivery{state():SharedSuggestionSyncState;entries():ReturnType<SharedSuggestionSync['entries']>;subscribe(listener:()=>void):()=>void;connect():Promise<void>;refresh():Promise<void>;loadSuggestion(id:string):Promise<string>;flushShared():Promise<void>;retryLocal():Promise<void>;disconnect():void;close():Promise<void>}
const methods={state:SharedSuggestionSync.prototype.state,entries:SharedSuggestionSync.prototype.entries,subscribe:SharedSuggestionSync.prototype.subscribe,connect:SharedSuggestionSync.prototype.connect,refresh:SharedSuggestionSync.prototype.refresh,loadSuggestion:SharedSuggestionSync.prototype.loadSuggestion,flushShared:SharedSuggestionSync.prototype.flushShared,retryLocal:SharedSuggestionSync.prototype.retryLocal,disconnect:SharedSuggestionSync.prototype.disconnect,dispose:SharedSuggestionSync.prototype.dispose};
// Registration is local to the actual factory, with no exported registration
// hook accepting a caller's alleged queue view, grant or lifecycle callbacks.
const parents=new WeakMap<object,()=>NativeSuggestionChild>();
export function lendNativeSuggestionChild<P extends SharedSelectionPolicy>(owner:NativeSuggestionDelivery):NativeSuggestionChild<P>{const lend=parents.get(owner);if(!lend)throw new SharedRelayError('native_suggestion_parent');return lend() as NativeSuggestionChild<P>;}
export function createNativeSuggestionDelivery<P extends SharedSelectionPolicy>(queue:SharedSuggestionQueue<P>,transport:SharedSuggestionTransport<P>,delivery:NativeRelayDelivery,input:NativeSuggestionDeliveryOptions={}):NativeSuggestionDelivery{
 const loan:NativeSuggestionQueueLoan<P>=lendSuggestionNativeQueue(queue,delivery);
 let sync:SharedSuggestionSync<P>|undefined,closed=false,closing=false,ending:Promise<void>|undefined;
 interface Slot{stop():void;wait():Promise<void>}
 const children=new Set<Slot>(),failure=()=>new SharedRelayError('native_suggestion_closed');
 const current=()=>{if(closing||closed)throw failure();loan.port.check();if(closing||closed)throw failure();};
 const stop=()=>{closing=true;const errors:unknown[]=[];for(const child of children)try{child.stop();}catch(error){errors.push(error);}try{if(sync)methods.dispose.call(sync);}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Native suggestion children did not stop');};
 const close=()=>{if(closed)return Promise.resolve();if(ending)return ending;closing=true;ending=(async()=>{const errors:unknown[]=[];try{stop();}catch(error){errors.push(error);}await Promise.all([...children].map(async child=>{try{await child.wait();}catch(error){errors.push(error);}}));try{if(sync)await waitForRetiredSuggestionSync(sync);}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Native suggestion cleanup did not finish');await loan.close();closed=true;})().finally(()=>{ending=undefined;});return ending;};
 try{
  current();const allowed=new Set(['onState','onError']);if(!input||typeof input!=='object'||Reflect.ownKeys(input).some(key=>typeof key!=='string'||!allowed.has(key)))throw new SharedRelayError('native_suggestion_options');
  const options={...input};current();const relay=nativeSuggestionTransportFor<P>(transport,loan.port);loan.port.track(stop,close);
  sync=createNativeSuggestionSync(loan.queue,relay,options);const actual=sync;
  const owner=Object.freeze({state:()=>methods.state.call(actual),entries:()=>methods.entries.call(actual),subscribe:(listener:()=>void)=>methods.subscribe.call(actual,listener),connect:()=>methods.connect.call(actual),refresh:()=>methods.refresh.call(actual),loadSuggestion:(id:string)=>methods.loadSuggestion.call(actual,id),flushShared:()=>methods.flushShared.call(actual),retryLocal:()=>methods.retryLocal.call(actual),disconnect:()=>methods.disconnect.call(actual),close});
  parents.set(owner,()=>{
   current();let stopped=false,released=false,installed:Slot|undefined,finish!:()=>void;
   const opening=new Promise<void>(resolve=>{finish=resolve;}),slot:Slot={stop(){stopped=true;installed?.stop();},async wait(){await opening;await installed?.wait();}};
   children.add(slot);
   const check=()=>{if(stopped||released)throw failure();current();if(stopped||released)throw failure();};
   const release=()=>{if(released)return;released=true;finish();children.delete(slot);};
   try{check();return Object.freeze({originalQueue:queue,queue:loan.queue,transport:relay,delivery,port:loan.port,check,install(stop:()=>void,wait:()=>Promise<void>){check();if(installed)throw failure();installed={stop,wait};finish();},release}) as unknown as NativeSuggestionChild;}
   catch(error){release();throw error;}
  });
  return owner;
 }catch(error){if(sync)void close().catch(()=>{});else{void loan.close();closed=true;}throw error;}
}
