/** Compact DATA observations. A digest never supplies a journal, lease, actor,
 * acknowledgement, Native receipt, publication or current source authority. */
import type {MetadataContinuationChoice} from '../selected_local_metadata_continuation/contract.js';
export interface MetadataSnapshotPin {readonly bytes:number;readonly sha256:string}
export interface MetadataContinuationEvidencePins {
 readonly format:'breditor/metadata-continuation-evidence-pins';readonly formatVersion:1;
 readonly choice:MetadataContinuationChoice;
 readonly phase:'absent'|'intent'|'prepared'|'review'|'metadata';
 readonly review:MetadataSnapshotPin|null;readonly metadata:MetadataSnapshotPin|null;
}
/** Portable DATA keeps the exact UTF-8 snapshot bodies outside a compact
 * descriptor. Retain this complete bundle; pins alone are not a backup. */
export interface MetadataContinuationPinArchive {
 readonly format:'breditor/metadata-continuation-pin-archive';readonly formatVersion:1;
 readonly pins:MetadataContinuationEvidencePins;
 readonly review:Blob|null;readonly metadata:Blob|null;
}
export interface HeldMetadataContinuationPins {
 readonly pins:MetadataContinuationEvidencePins;
 /** Expires before the underlying journal leases are released. */
 check():void;
}
