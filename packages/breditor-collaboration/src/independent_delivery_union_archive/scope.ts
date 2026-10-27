/** Snapshotted fresh read policy and cancellable factories; no stored grant becomes executable authority. */
import{participantAuthority}from'../participant_backup/policy.js';
import type{AssetLimits}from'@breditor/experimental-rich-content';
import{checkRichAssetLimits}from'@breditor/experimental-rich-content';
import{NativeReconstructionWaits}from'../selected_native_reconstruction/read_waits.js';
import{snapshotReadFactoryData}from'../operation_read/read_factory_snapshot.js';
import{nativeBranchAuthorizations}from'../native_recovery/branch_authorizations.js';
import{freezeGeneration}from'../generation_source/identity.js';
import{prepareArchiveIntegrity}from'../archive_integrity/context.js';
import type{SharedIndependentDeliveryUnionArchiveReadOptions}from'./contract.js';
import{fields,fail}from'./policy.js';
export class DeliveryUnionArchiveScope{
 readonly #work;readonly integrity;readonly session;readonly authorizations;#limits;readonly signal;
 constructor(provided:SharedIndependentDeliveryUnionArchiveReadOptions){const r=fields(provided,['wasm','session','authorizations','checkAuthority'],['limits','signal']);if(typeof r['checkAuthority']!=='function')throw fail('delivery_union_policy');const selected=snapshotReadFactoryData(r['session'] as SharedIndependentDeliveryUnionArchiveReadOptions['session']);if(selected?.readOnly!==true||selected.review?.access!=='read_only')throw fail('delivery_union_policy');this.authorizations=freezeGeneration(JSON.parse(nativeBranchAuthorizations(r['authorizations'])).authorizations) as SharedIndependentDeliveryUnionArchiveReadOptions['authorizations'];this.#limits=checkRichAssetLimits(r['limits']===undefined?{}:fields(r['limits'],[],['maxFileBytes','maxPixels','maxDimension','maxStoredBytes']));this.#work=new NativeReconstructionWaits(participantAuthority(r['checkAuthority'] as ()=>void),[r['signal'] as AbortSignal|undefined]);this.signal=this.#work.signal;try{const history=selected?.documentHistory;if(!history||history.kind!=='original'&&history.kind!=='segmented-v1')throw fail('delivery_union_policy');this.session={...selected,documentHistory:history.kind==='original'?{...history,restoreOriginal:this.#work.restore(history.restoreOriginal,history)}:{...history,restoreSegmented:this.#work.restore(history.restoreSegmented,history)}};this.integrity=prepareArchiveIntegrity({wasm:r['wasm'] as SharedIndependentDeliveryUnionArchiveReadOptions['wasm'],checkAuthority:this.check,signal:this.signal});Object.freeze(this);}catch(error){this.#work.close();throw error;}}
 get limits(){return this.#limits;}
 /** Every component obeys both the immutable archived ceiling and fresh host tightening. */
 tighten(ceiling:Readonly<AssetLimits>){this.check();this.#limits=checkRichAssetLimits(Object.fromEntries(Object.entries(this.#limits).map(([key,value])=>[key,Math.min(value,ceiling[key as keyof typeof ceiling])])));}
 check=()=>{this.#work.check();};
 close(){this.#work.close();}
}
