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
