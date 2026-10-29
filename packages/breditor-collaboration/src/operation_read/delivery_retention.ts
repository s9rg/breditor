import {sessionDeliveryIO} from '../delivery_source/io.js';
/** Actual constructor-owned source resources for future delivery composition.
 * SDK-private. This is not source admission, a receipt, a transfer or a grant.
 * Only the genuine retained root may lend these resources to its coordinator. */
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {RecoverySession} from '../participant_recovery/components.js';
import type {SharedAssetReferenceCaptureOptions} from '../asset_references_capture.js';
import type {SharedGenerationSourceSelection} from '../generation_source/contract.js';
import type {SharedIndependentHistoryPersistentSession} from '../independent_history/session.js';
import type {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import type {NativeRetentionSource} from './native_retention.js';
type P=SharedSelectionPolicy;
export type RetainedDeliveryParent=
 |Readonly<{kind:'original';session:RecoverySession<P>;packets:Readonly<Pick<SharedAssetReferenceCaptureOptions<P>,'suggestions'|'revisions'|'versions'>>}>
 |Readonly<{kind:'generation';source:SharedGenerationSourceSelection<P>}>
 |Readonly<{kind:'independent-local';session:SharedIndependentHistoryPersistentSession<P>}>
 |Readonly<{kind:'independent-delivery';session:SharedIndependentDeliverySession<P>}>;
export interface RetainedDeliverySource {readonly core:SharedRichEditor<P>;readonly parent:RetainedDeliveryParent;check():void;save():void;flush():Promise<void>}
const sources=new WeakMap<NativeRetentionSource,RetainedDeliverySource>();
/** Trusted actual-parent constructor composition only. Neither this registry
 * nor a returned source is accepted by public recovery/adoption APIs. */
export function retainNativeDeliverySource(native:NativeRetentionSource,parent:RetainedDeliveryParent,check:()=>void):void{
 if(sources.has(native))throw Error('Native delivery source reused');const core=native.core;
 const selected=Object.freeze({...parent}),session=selected.kind==='generation'?selected.source.session:selected.session,io=sessionDeliveryIO(session,core),current=()=>{check();io.check();};
 sources.set(native,Object.freeze({core,parent:selected,check:current,save(){current();io.save();current();},async flush(){current();await io.flush();current();}}));
}
/** The SAME fully prepared source reader supplies the key. A copied DTO, a
 * decoded checkpoint or another core does not carry its constructor resources. */
export function nativeDeliverySource(native:NativeRetentionSource):RetainedDeliverySource{
 const value=sources.get(native);if(!value)throw Error('A genuine native delivery source is required');return value;
}
