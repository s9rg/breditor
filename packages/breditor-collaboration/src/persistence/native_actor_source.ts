/** Core-to-persistence resource bindings registered by the four genuine native
 * constructors. Readable native history alone cannot synthesize this binding.
 * This is private local custody, not a server or reconstruction permission. */
import {SharedWriterLease,prepareSharedWriterLeaseCloseRetention,cancelSharedWriterLeaseCloseRetention,type SharedWriterLeaseCloseRetention} from './writer_lease.js';
import {ReviewWriterLease,prepareReviewWriterLeaseCloseRetention,type ReviewWriterLeaseCloseRetention} from './review_writer_lease.js';
import type {StoppedActorBinding} from './stopped_actor_source.js';
import {checkManagedCore} from '../managed_custody.js';
import {SharedEditorError} from '../core.js';
import {managedSourceCore} from '../managed_custody.js';
import {captureManagedSourceBindings} from '../managed_source_bindings.js';
import {generationActorCore} from '../generation_source/admission.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
export type NativeActorSourceFamily='shared'|'review'|'segmented'|'independent';
export interface NativeActorSource{readonly family:NativeActorSourceFamily;readonly source:object}
interface Registration extends NativeActorSource{readonly checkBinding:()=>void;readonly document:SharedWriterLease;readonly review:ReviewWriterLease|undefined}
const owners=new WeakMap<object,Registration>(),checkDocument=SharedWriterLease.prototype.assertLive,checkReview=ReviewWriterLease.prototype.assertLive;
const fail=()=>new SharedEditorError('native_actor_source','Use the genuine native core and its original privately registered persistence owner');
/** Constructor-only registration, after the actual existing source/native port
 * has admitted this owner. A copied core field cannot create that admission. */
export function registerNativeActorSource(source:object,family:NativeActorSourceFamily,leases:Readonly<{document:SharedWriterLease;review?:ReviewWriterLease}>):void{
 if(!['shared','review','segmented','independent'].includes(family))throw fail();
 const core=family==='shared'||family==='review'?managedSourceCore(source):family==='segmented'?generationActorCore(source):independentHistoryNative(source).core;
 if(owners.has(core))throw fail();
 if(!leases||typeof leases!=='object')throw fail();checkDocument.call(leases.document);if(leases.review)checkReview.call(leases.review);
 const checkBinding=captureManagedSourceBindings(source,fail);checkBinding();
 owners.set(core,Object.freeze({family,source,checkBinding,document:leases.document,review:leases.review}));
}
/** Private stopped-core lookup. No public getter or current-edit method is
 * invoked; actual source liveness, stopped state, I/O and actors are separately
 * admitted by the existing branded source helper before the cohort can move. */
export function nativeActorSource(core:object):NativeActorSource{
 const row=owners.get(core);if(!row)throw fail();row.checkBinding();
 return Object.freeze({family:row.family,source:row.source});
}

/** Final factory-loan admission compares the actual constructor's private
 * lease references. A readonly replay, DTO, copied source or matching IDs cannot
 * substitute another actor borrower. No handles escape this check. */
export function checkNativeActorSourceLeases(core:object,family:NativeActorSourceFamily,document:SharedWriterLease,review:ReviewWriterLease|undefined):void{const row=owners.get(core);if(!row||row.family!==family||row.document!==document||row.review!==review)throw fail();row.checkBinding();checkManagedCore(core);checkDocument.call(document);if(review)checkReview.call(review);row.checkBinding();}

/** Prepare only the constructor's actual registered leases. Bindings originate
 * in the genuine source readiness check; these descriptions cannot mint a lock.
 * Pair refusal rolls back the earlier pending plan before any source closes. */
export function prepareNativeActorSourceClose(core:object,family:NativeActorSourceFamily,binding:StoppedActorBinding):Readonly<{document:SharedWriterLeaseCloseRetention;review:ReviewWriterLeaseCloseRetention|undefined}>{
 const row=owners.get(core);if(!row||row.family!==family||(binding.actor===null)!==(row.review===undefined))throw fail();row.checkBinding();
 const document=prepareSharedWriterLeaseCloseRetention(row.document,binding.room,binding.writer);
 try{const review=binding.actor===null?undefined:prepareReviewWriterLeaseCloseRetention(row.review!,binding.room,binding.actor);return Object.freeze({document,review});}
 catch(error){cancelSharedWriterLeaseCloseRetention(document);throw error;}
}
