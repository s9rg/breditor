/** Borrow genuine selected sources without ending or reacquiring their native
 * reservation. Only the private registry of the actual owner admits a scope;
 * saved cuts, copied methods and same-shaped sources cannot select this route.
 * The outer owner retains all cleanup and final retirement responsibility. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {selectedNativeDeliveryReads,selectedNativeDeliverySources} from '../relay/native_delivery.js';
import type {NativeReconstructionInputOptions,NativeReconstructionInputs,ExpectedReconstructionMember} from './input_scope.js';
import {selectedRoomCurrentSelection,MAX_SELECTED_ROOM_CURRENT_BYTES} from '../selected_room_current/manifest.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import type {SharedAssetBytesOptions,SharedAssetBytesResolver} from '../asset_bytes/types.js';
import {NativeReconstructionFactoryScope} from './factory_scope.js';
import {NativeReconstructionWaits} from './read_waits.js';
import {withAdmittedReconstructionInputs} from './admit_inputs.js';
import {fields,fail} from './policy.js';
export function withHeldNativeReconstructionInputs<R>(scope:SelectedNativeRecoveryScope,options:NativeReconstructionInputOptions,expected:readonly ExpectedReconstructionMember[],complete:boolean,visit:(context:NativeReconstructionInputs)=>Promise<R>,retire=false):Promise<R>{
 // Registry admission precedes reflection on caller options or read factories.
 const reads=selectedNativeDeliveryReads(scope);selectedNativeDeliverySources(scope);scope.check();
 const raw=fields(options,['retained'],['assets','resolveAsset']),input=fields(raw['retained'],['selection','file']),retained={selection:selectedRoomCurrentSelection(input['selection']),file:archiveBlob(input['file'] as Blob,MAX_SELECTED_ROOM_CURRENT_BYTES)},assetOptions=raw['assets']===undefined?undefined:fields(raw['assets'],[],['limits','signal']) as SharedAssetBytesOptions,assets=assetOptions===undefined?undefined:{limits:checkRichAssetLimits(assetOptions.limits),...(assetOptions.signal?{signal:assetOptions.signal}:{})},resolveAsset=raw['resolveAsset'] as SharedAssetBytesResolver|undefined;
 if(typeof visit!=='function'||resolveAsset!==undefined&&typeof resolveAsset!=='function')throw fail('native_reconstruction_policy');scope.check();
 const factories=new NativeReconstructionFactoryScope(reads),cancellation=new NativeReconstructionWaits(scope.check,[scope.signal,assets?.signal]);
 try{factories.bind(scope,cancellation.signal);const check=cancellation.check,chosen={reads,checkAuthority:check,signal:cancellation.signal},scoped={...chosen,reads:factories.reads};
  const current=async(retirement:boolean)=>{check();const actual=await(retirement?scope.retainRetirementCurrent():scope.retainCurrent());check();const authorize=()=>{check();actual.integrity.checkAuthority?.();check();};return{current:actual.current,integrity:{...actual.integrity,checkAuthority:authorize,signal:cancellation.signal}};};
  // This local wrapper adds only cancellation. The genuine owner remains the
  // sole source of every capture and final witness, with no registry insertion.
  const guarded={...scope,check,signal:cancellation.signal,retainCurrent:()=>current(false),retainRetirementCurrent:()=>current(true)};
  return withAdmittedReconstructionInputs(guarded,chosen,scoped,retained,assets,resolveAsset,expected,complete,visit,retire).finally(()=>{try{factories.close();}finally{cancellation.close();}});
 }catch(error){try{factories.close();}finally{cancellation.close();}throw error;}
}
