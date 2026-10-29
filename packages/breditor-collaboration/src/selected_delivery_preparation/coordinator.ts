import {consumeDeliveryResumeAdmission,type DeliveryResumeAdmission} from '../selected_delivery_journal/resume_admission.js';
import type {PreparedDeliveryDriver} from './driver_contract.js';
/** SDK-private real prepared-before-delivery boundary. Immutable bytes do not
 * confer an executable grant; the genuine scope and fresh approval are required.
 * Partial/advanced delivery journaling and whole-room adoption remain separate. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {SharedServerLogGenerationRecoveryHost} from '../generation_recovery_control/host.js';
import {generationRecoveryHostPort} from '../generation_recovery_control/host.js';
import {checkSelectedNativeDeliveryScope,retainSelectedNativeDeliveryResource,createSelectedNativeRelayDelivery,type NativeRelayDelivery} from '../relay/native_delivery.js';
import type {RetainedDeliverySource} from '../operation_read/delivery_retention.js';
import type {SharedReviewAccess} from '../review_types.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import {compareExecutionCut,requireExecutionOwnStreams} from '../selected_generation_execution/inspection.js';
import {DeliveryPreparationResources} from './resources.js';
import {preparationChoice} from './identity.js';
import {fail} from './policy.js';
import type {DeliveryPreparationChoice,DeliveryPreparationFile} from './contract.js';
const methods={open:DeliveryPreparationResources.prototype.open,close:DeliveryPreparationResources.prototype.close},add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
export interface PreparedSelectedNativeDelivery{readonly prepared:DeliveryPreparationFile;check():void;close():Promise<void>}
const owners=new WeakMap<PreparedSelectedNativeDelivery,{scope:SelectedNativeRecoveryScope;check():void;legacy():void;available():void;track(owner:NativeRelayDelivery):void;claim():PreparedDeliveryDriver}>();
async function inspect(scope:SelectedNativeRecoveryScope,host:SharedServerLogGenerationRecoveryHost,database:string){checkSelectedNativeDeliveryScope(scope);const port=generationRecoveryHostPort(host),read=await scope.readGenerationReconciliation(host);requireExecutionOwnStreams(read);const current=await scope.retainCurrent();await compareExecutionCut(current.current,read,current.integrity);await port.check(scope.signal);checkSelectedNativeDeliveryScope(scope);return {choice:preparationChoice({format:'breditor/selected-native-delivery-preparation',formatVersion:1,database,server:port.selection,before:current.current.selection}),current};}
/** Detached preview DATA; it cannot authenticate, open a writer or create a gate. */
export async function previewSelectedNativeDeliveryPreparation(scope:SelectedNativeRecoveryScope,host:SharedServerLogGenerationRecoveryHost,database:string){const selected=await inspect(scope,host,database);return Object.freeze({choice:selected.choice,current:selected.current.current});}
/** The complete actual before-cut is committed absent-only and read-admitted
 * from storage before this returns a same-scope runtime gate. */
export async function prepareSelectedNativeDelivery(scope:SelectedNativeRecoveryScope,host:SharedServerLogGenerationRecoveryHost,expected:DeliveryPreparationChoice,approve:(choice:DeliveryPreparationChoice)=>boolean|Promise<boolean>):Promise<PreparedSelectedNativeDelivery>{
 checkSelectedNativeDeliveryScope(scope);const chosen=preparationChoice(expected);if(typeof approve!=='function')throw fail('delivery_preparation_policy');
 let selected=await inspect(scope,host,chosen.database);if(JSON.stringify(selected.choice)!==JSON.stringify(chosen))throw fail();
 await decideFreshAssetChoice(chosen,approve,{check:()=>checkSelectedNativeDeliveryScope(scope),signal:scope.signal,watchClosing:cancel=>{add.call(scope.signal,'abort',cancel,{once:true});return()=>remove.call(scope.signal,'abort',cancel);}});
 selected=await inspect(scope,host,chosen.database);if(JSON.stringify(selected.choice)!==JSON.stringify(chosen))throw fail();
 const resources=new DeliveryPreparationResources(),held=ownPreparedGate(scope,resources);
 try{const prepared=await methods.open.call(resources,chosen,selected.current.integrity,selected.current.current.file);const actual=await scope.retainCurrent();if(JSON.stringify(actual.current.selection)!==JSON.stringify(chosen.before))throw fail();await generationRecoveryHostPort(host).check(scope.signal);held.check();return held.finish(prepared);}catch(error){await held.close();throw error;}
}
/** Exact runtime gate and scope, not a decoded record or copied object. */
export function createPreparedSelectedNativeRelayDelivery(gate:PreparedSelectedNativeDelivery,scope:SelectedNativeRecoveryScope,source:RetainedDeliverySource,ceiling:SharedReviewAccess):NativeRelayDelivery{const selected=owners.get(gate);if(!selected||selected.scope!==scope)throw fail('delivery_preparation_policy');selected.legacy();const context=createSelectedNativeRelayDelivery(scope,source,ceiling,selected.check);selected.track(context);return context;}

/** Consume only the genuine same-scope gate. Old unclaimed behavior is unchanged;
 * after claim, legacy context construction cannot bypass its coupled owner. */
export function claimPreparedSelectedDelivery(gate:PreparedSelectedNativeDelivery,scope:SelectedNativeRecoveryScope):PreparedDeliveryDriver{const selected=owners.get(gate);if(!selected||selected.scope!==scope)throw fail('delivery_preparation_policy');return selected.claim();}

/** Identity/state fence only; no callback, IO or authority is invoked. */
export function assertPreparedSelectedDeliveryPair(gate:PreparedSelectedNativeDelivery,scope:SelectedNativeRecoveryScope):void{const selected=owners.get(gate);if(!selected||selected.scope!==scope)throw fail('delivery_preparation_policy');selected.available();}

/** One actual context/cleanup owner shared by initial preparation and separately
 * authorized cold resume; this helper never accepts saved JSON as a grant. */
function ownPreparedGate(scope:SelectedNativeRecoveryScope,resources:DeliveryPreparationResources,extra:()=>void=()=>{}){
 const contexts=new Set<NativeRelayDelivery>();let closing=false,closed=false,claimed=false,quiescent=false,ending:Promise<void>|undefined;
 const check=()=>{if(closing||closed)throw fail('delivery_preparation_closed');checkSelectedNativeDeliveryScope(scope);resources.check();extra();};
 const cleanup:NativeRelayDelivery=Object.freeze({check,close(){if(closed)return Promise.resolve();if(ending)return ending;closing=true;ending=(async()=>{const results=await Promise.allSettled([...contexts].map(owner=>owner.close()));if(results.some(row=>row.status==='rejected'))throw fail('delivery_preparation_storage');await methods.close.call(resources);closed=true;})().finally(()=>{ending=undefined;});return ending;}});
 retainSelectedNativeDeliveryResource(scope,cleanup);
 return Object.freeze({check,close:()=>cleanup.close(),finish(prepared:DeliveryPreparationFile):PreparedSelectedNativeDelivery{check();const gate:PreparedSelectedNativeDelivery=Object.freeze({prepared,check,close:()=>cleanup.close()});const newContext=()=>{if(quiescent)throw fail('delivery_preparation_busy');check();if(quiescent)throw fail('delivery_preparation_busy');},legacy=()=>{if(claimed)throw fail('delivery_preparation_busy');newContext();if(claimed)throw fail('delivery_preparation_busy');};
  owners.set(gate,{scope,check,legacy,available(){if(claimed||quiescent)throw fail('delivery_preparation_busy');if(closing||closed)throw fail('delivery_preparation_closed');},track:owner=>{legacy();contexts.add(owner);},claim(){if(claimed||quiescent)throw fail('delivery_preparation_busy');claimed=true;try{check();}catch(error){void cleanup.close().catch(()=>{});throw error;}return Object.freeze({scope,prepared,check,
   create(source:RetainedDeliverySource,ceiling:SharedReviewAccess,restrict:()=>void){newContext();if(typeof restrict!=='function')throw fail('delivery_preparation_policy');const context=createSelectedNativeRelayDelivery(scope,source,ceiling,()=>{check();restrict();check();});contexts.add(context);newContext();return context;},
   async quiesce<T>(visit:()=>Promise<T>):Promise<T>{if(quiescent)throw fail('delivery_preparation_busy');quiescent=true;try{check();const results=await Promise.allSettled([...contexts].map(owner=>owner.close()));if(results.some(row=>row.status==='rejected'))throw fail('delivery_preparation_storage');contexts.clear();check();const value=await visit();check();return value;}catch(error){await cleanup.close();throw error;}finally{quiescent=false;}},
   close:()=>cleanup.close(),
  });}});return gate;}});
}

/** Only the fresh full-history native/source admission may reopen a gate. The
 * original immutable before-file is retained literally; no previous gate revives. */
export async function resumePreparedSelectedNativeDelivery(scope:SelectedNativeRecoveryScope,admission:DeliveryResumeAdmission):Promise<PreparedSelectedNativeDelivery>{
 const selected=consumeDeliveryResumeAdmission(admission,scope);let held:ReturnType<typeof ownPreparedGate>|undefined,complete=false;
 // The one-shot transfer is callback-free. Every subsequent check and parent
 // registration is inside owned cleanup, including synchronous refusal.
 try{held=ownPreparedGate(scope,selected.resources,selected.check);selected.check();const gate=held.finish(selected.prepared);complete=true;return gate;}
 finally{if(!complete){if(held)await held.close();else await methods.close.call(selected.resources);}}
}
