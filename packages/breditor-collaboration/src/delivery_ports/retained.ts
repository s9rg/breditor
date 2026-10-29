/** Both explicitly selected atomic drivers retain the unchanged original store record formats. */
import type {SegmentedRetainedRecords,SegmentedRetainedKind} from '../segmented_relay/retained_contract.js';
import {segmentedRetainedPort} from '../segmented_relay/retained_port.js';
import {SharedRelayError} from '../relay/validation.js';
export interface RetainedStorePort<K extends SegmentedRetainedKind> {
 readonly kind:K;check():void;writable():void;
 read():NonNullable<SegmentedRetainedRecords[K]>;
 stage(record:NonNullable<SegmentedRetainedRecords[K]>):void;
 write(record:NonNullable<SegmentedRetainedRecords[K]>):Promise<void>;
}
const selected=new WeakMap<object,RetainedStorePort<SegmentedRetainedKind>>();
export function withIndependentRetainedPort<T extends object,K extends SegmentedRetainedKind>(input:T,port:RetainedStorePort<K>):T{const copy={...input};selected.set(copy,port as RetainedStorePort<SegmentedRetainedKind>);return copy;}
export function selectedRetainedStorePort<K extends SegmentedRetainedKind>(input:object,kind:K):RetainedStorePort<K>|undefined{
 const old=segmentedRetainedPort(input,kind),current=selected.get(input);if(old&&current)throw new SharedRelayError('delivery_source_ambiguous');if(current&&current.kind!==kind)throw new SharedRelayError('independent_retained_kind');return(old??current) as RetainedStorePort<K>|undefined;
}

/** The original atomic record driver knows its genuine enclosing source. */
const retainedOwners=new WeakMap<object,Readonly<{source:object;core:object;committed:()=>unknown}>>();
export function registerRetainedStoreOwner(port:object,source:object,core:object,committed:()=>unknown):void{if(retainedOwners.has(port)||typeof committed!=='function')throw new SharedRelayError('delivery_source_ambiguous');retainedOwners.set(port,Object.freeze({source,core,committed}));}
export function retainedStoreOwner(port:object,core:object):object|undefined{const owner=retainedOwners.get(port);if(owner&&owner.core!==core)throw new SharedRelayError('delivery_source_ambiguous');return owner?.source;}

/** Exact original driver commitment, never a record supplied by the borrower. */
export function retainedStoreCommitted(port:object,core:object):unknown{const owner=retainedOwners.get(port);if(!owner||owner.core!==core)throw new SharedRelayError('delivery_source_ambiguous');return owner.committed();}
