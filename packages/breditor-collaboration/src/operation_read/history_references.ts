/** Complete explicit history scope. Original source-only metadata stays intact;
 * references from protected parent archives are added without granting writers. */
import {SharedEditorError} from '../core.js';
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import type {SharedAssetCapturePending} from '../asset_references_capture.js';
import {createParentReferenceRead,type ParentReferenceSource,type ParentReferenceProducer} from './reference_read.js';
type Immutable<T>=T extends readonly(infer V)[]?readonly Immutable<V>[]:T extends object?{readonly[K in keyof T]:Immutable<T[K]>}:T;
export interface OperationalHistoryOrigin{readonly role:'operation-origin'|'recovery-origin';readonly references:readonly RichRetainedAssetReference[];readonly pending:readonly Immutable<SharedAssetCapturePending>[]}
export interface OperationalHistoryReferenceMetadata<M extends ParentReferenceSource>{readonly format:'breditor/operational-history-reference-read';readonly formatVersion:1;readonly scope:'protected-parent-archives-and-current-native-records';readonly family:'original'|'generation';readonly origins:readonly OperationalHistoryOrigin[];readonly current:M;readonly kind:'ready'|'pending';readonly references:readonly RichRetainedAssetReference[]}
interface Parent{check():void;checkCurrent():void;verify():Promise<void>;dispose():void}
/** Own both borrows; closed reports keep only immutable diagnostics. */
export function composeOperationalHistoryReferences<M extends ParentReferenceSource>(family:'original'|'generation',parent:Parent,capture:ParentReferenceProducer<M>,origins:readonly OperationalHistoryOrigin[]){
 const currentMetadata=capture.metadata(),union=new Map<string,RichRetainedAssetReference>();for(const reference of[...origins.flatMap(row=>row.references),...currentMetadata.references]){union.set(JSON.stringify([reference.asset,reference.generation]),reference);if(union.size>100000)throw new SharedEditorError('operational_history_reference_budget','Complete protected and current reference budget exceeded');}
 const current=()=>{parent.checkCurrent();capture.checkCurrent();parent.checkCurrent();};current();
 const metadata:OperationalHistoryReferenceMetadata<M>={format:'breditor/operational-history-reference-read',formatVersion:1,scope:'protected-parent-archives-and-current-native-records',family,origins,current:currentMetadata,kind:currentMetadata.kind==='pending'||origins.some(row=>row.pending.length)?'pending':'ready',references:[...union.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0)};
 return createParentReferenceRead(metadata,{check:()=>{parent.check();capture.check();current();},current,verify:async()=>{await parent.verify();await capture.verify();current();},release:()=>{try{capture.dispose();}finally{parent.dispose();}}});
}
