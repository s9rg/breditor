import type {AssetLimits} from '@breditor/experimental-rich-content';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {SharedIndependentDeliveryParticipantSelection} from '../independent_delivery_participant/contract.js';
import type {SharedIndependentDeliveryUnionReadFactory} from '../independent_delivery_union/contract.js';

/** One exact, independently selected SDK participant file, including its upload queue. */
export interface SharedIndependentDeliveryBranchFile {
 readonly selection:SharedIndependentDeliveryParticipantSelection;
 readonly file:Blob;
}

/** Causal comparison only. Local Undo and pending delivery can differ even at equal heads. */
export interface SharedIndependentDeliveryBranchLane {
 readonly relation:'equal'|'current-ahead'|'incoming-ahead'|'diverged';
 readonly currentThrough:string;
 readonly incomingThrough:string;
 readonly commonThrough:string;
 readonly commonPrefixDigest:string;
}

export interface SharedIndependentDeliveryBranchComparison {
 /** Use packing-independent native reads in both transport configurations. */
 readonly documentClockVersion:2;
 readonly document:SharedIndependentDeliveryBranchLane;
 readonly review:SharedIndependentDeliveryBranchLane;
}

export interface SharedIndependentDeliveryBranchArchiveSelection {
 readonly bytes:number;
 readonly manifestSha256:string;
}

/** Portable data. Both originals can be recovered separately with the ordinary SDK. */
export interface SharedIndependentDeliveryBranchArchive {
 readonly file:Blob;
 readonly selection:SharedIndependentDeliveryBranchArchiveSelection;
 readonly current:SharedIndependentDeliveryBranchFile;
 readonly incoming:SharedIndependentDeliveryBranchFile;
 readonly comparison:SharedIndependentDeliveryBranchComparison;
}

export interface SharedIndependentDeliveryBranchArchiveReadOptions extends SharedArchiveIntegrityOptions {
 readonly session:SharedIndependentDeliveryUnionReadFactory;
 readonly limits?:Partial<AssetLimits>;
}

export interface SharedIndependentDeliveryBranchArchiveBuildOptions extends SharedIndependentDeliveryBranchArchiveReadOptions {
 readonly current:SharedIndependentDeliveryBranchFile;
 readonly incoming:SharedIndependentDeliveryBranchFile;
}
