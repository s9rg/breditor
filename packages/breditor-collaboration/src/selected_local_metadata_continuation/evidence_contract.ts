/** Complete DATA from one earlier metadata destination. Canonical journal text
 * retains its before/current facts and revisions; it grants no writer or ACK. */
import type {MetadataContinuationChoice,MetadataContinuationDestinations} from './contract.js';
/** A destination set which has no committed continuation choice yet. This is
 * an observed absence under leases, rather than an invented old HTTP choice. */
export interface MetadataContinuationAbsence {
 readonly format:'breditor/metadata-continuation-absence';readonly formatVersion:1;
 readonly destinations:MetadataContinuationDestinations;
}
export interface MetadataContinuationEvidence {
 readonly format:'breditor/metadata-continuation-evidence';readonly formatVersion:1;
 readonly choice:MetadataContinuationChoice;
 readonly phase:'absent'|'intent'|'prepared'|'review'|'metadata';
 readonly review:string|null;
 readonly metadata:string|null;
}
export interface HeldMetadataContinuationEvidence {
 readonly evidence:MetadataContinuationEvidence;
 /** Expires before any destination lease is released. */
 check():void;
}
