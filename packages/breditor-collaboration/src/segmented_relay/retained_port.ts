/** Private per-call store custody. A stored DTO or public options field cannot select this path. */
import type {SegmentedRetainedRecords,SegmentedRetainedKind} from "./retained_contract.js";
import {SharedRelayError} from "../relay/validation.js";
export interface SegmentedRetainedPort<K extends SegmentedRetainedKind> {
 readonly kind:K;
 check():void;writable():void;
 read():NonNullable<SegmentedRetainedRecords[K]>;
 stage(record:NonNullable<SegmentedRetainedRecords[K]>):void;
 write(record:NonNullable<SegmentedRetainedRecords[K]>):Promise<void>;
}
const selected=new WeakMap<object,SegmentedRetainedPort<SegmentedRetainedKind>>();
export function withSegmentedRetainedPort<T extends object,K extends SegmentedRetainedKind>(options:T,port:SegmentedRetainedPort<K>):T{const copy={...options};selected.set(copy,port as SegmentedRetainedPort<SegmentedRetainedKind>);return copy;}
export function segmentedRetainedPort<K extends SegmentedRetainedKind>(options:object,kind:K):SegmentedRetainedPort<K>|undefined{const port=selected.get(options);if(port&&port.kind!==kind)throw new SharedRelayError("segmented_retained_kind");return port as SegmentedRetainedPort<K>|undefined;}
