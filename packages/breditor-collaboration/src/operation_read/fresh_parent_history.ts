/** Opaque composition of actual stored parent admission and source history.
 * Detached metadata never releases a writer, selects a child, or activates a room. */
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import {createParentReferenceRead,type ParentReferenceSource,type ParentReferenceProducer} from './reference_read.js';
type Immutable<T>=T extends readonly(infer V)[]?readonly Immutable<V>[]:T extends object?{readonly[K in keyof T]:Immutable<T[K]>}:T;
export type FreshDeliveryFamily='independent-local'|'independent-delivery'|'restored-graph'|'local-operation-snapshot'|'local-operation-flat';
export interface FreshParentHistoryMetadata<P,R extends ParentReferenceSource>{readonly format:'breditor/fresh-operational-parent-history-read';readonly formatVersion:1;readonly scope:'actual-protected-parent-and-held-source-records';readonly family:FreshDeliveryFamily;readonly parent:Immutable<P>;readonly source:Immutable<R>;readonly kind:'ready'|'pending';readonly references:readonly RichRetainedAssetReference[]}
export function composeFreshParentHistory<P,R extends ParentReferenceSource>(family:FreshDeliveryFamily,parent:P,source:ParentReferenceProducer<R>,current:()=>void,verifyParent:()=>Promise<void>){
 const value=source.metadata(),metadata:FreshParentHistoryMetadata<P,R>={format:'breditor/fresh-operational-parent-history-read',formatVersion:1,scope:'actual-protected-parent-and-held-source-records',family,parent:parent as Immutable<P>,source:value as Immutable<R>,kind:value.kind,references:value.references};
 return createParentReferenceRead(metadata,{check:()=>{current();source.check();current();source.checkCurrent();},current:()=>{current();source.checkCurrent();current();},verify:async()=>{current();await verifyParent();await source.verify();current();source.checkCurrent();},release:()=>source.dispose()});
}
