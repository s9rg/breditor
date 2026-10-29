/** SDK-private explicit version delivery on the exact borrowed catalog/source.
 * Reuses the original authenticated version protocol; never owns the catalog. */
import {VersionCatalogSync} from './sync.js';
import {SharedRelayError} from '../relay/validation.js';
import type {NativeRelayDelivery} from '../relay/native_delivery.js';
import type {SharedDocumentVersionsState} from './types.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {NativeVersionDeliveryOptions,NativeVersionStoreLoan} from './native_store.js';
export type {NativeVersionDeliveryOptions} from './native_store.js';
export interface NativeVersionDelivery{
 state():SharedDocumentVersionsState;
 connect():Promise<void>;refresh():Promise<void>;flushShared():Promise<void>;
 loadVersion(id:string):Promise<string>;
 retryLocal():Promise<void>;disconnect():void;close():Promise<void>;
}
type Factory=(delivery:NativeRelayDelivery,options:NativeVersionDeliveryOptions)=>NativeVersionDelivery;
const owners=new WeakMap<object,Factory>();
const fail=()=>new SharedRelayError('version_native_delivery_source');
export function registerNativeVersionCatalog(owner:object,open:Factory):void{if(owners.has(owner))throw fail();owners.set(owner,open);}
export function createNativeVersionDelivery(owner:object,delivery:NativeRelayDelivery,options:NativeVersionDeliveryOptions):NativeVersionDelivery{const open=owners.get(owner);if(!open)throw fail();return open(delivery,options);}
/** Internal constructor helper: actual sync intrinsics and loan cleanup are
 * captured before an application can shadow public methods. */
export function composeNativeVersionDelivery<P extends SharedSelectionPolicy>(loan:NativeVersionStoreLoan<P>,release:()=>void):NativeVersionDelivery{
 let sync:VersionCatalogSync<P>|undefined,closed=false,ending:Promise<void>|undefined;
 const close=()=>{if(closed)return Promise.resolve();if(ending)return ending;ending=(async()=>{if(sync){dispose.call(sync);await retired.call(sync);}await loan.close();release();closed=true;})().finally(()=>{ending=undefined;});return ending;};
 const dispose=VersionCatalogSync.prototype.dispose,retired=VersionCatalogSync.prototype.waitForRetired;
 const {state,connect,refresh,flushShared,loadVersion,recoverLocal,disconnect}=VersionCatalogSync.prototype;
 try{
  const port=loan.port;port.check();port.track(()=>{if(sync)dispose.call(sync);},close);
  sync=new VersionCatalogSync(loan.store);const actual=sync;
  if(actual.nativeDeliveryPort()!==port)throw fail();
  return Object.freeze({state:()=>state.call(actual),connect:()=>connect.call(actual),refresh:()=>refresh.call(actual),flushShared:()=>flushShared.call(actual),loadVersion:(id:string)=>loadVersion.call(actual,id),async retryLocal(){await loan.retryLocal();loan.port.check();recoverLocal.call(actual);loan.port.check();},disconnect:()=>disconnect.call(actual),close});
 }catch(error){if(sync){void close().catch(()=>{});}else{void loan.close();release();closed=true;}throw error;}
}
