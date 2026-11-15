import type {AssetLimits} from '@breditor/experimental-rich-content';
import type {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import type {RichSelection} from '../types.js';
import type {SharedVersionAsset} from '../version_types.js';
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

/** Exact archived source and explicit text ranges in the recovered and current publications. */
export interface SharedRecoveredBranchTextSuggestionOptions extends SharedIndependentDeliveryBranchArchiveReadOptions {
 readonly source:SharedIndependentDeliveryBranchFile;
 readonly sourceRange:Extract<RichSelection,{kind:'text'}>;
 readonly target:SharedIndependentDeliverySession;
 readonly targetRange:Extract<RichSelection,{kind:'text'}>;
 readonly targetRevision:string;
 /** Fresh namespace permanently reserved by the application for any required native floors. */
 readonly namespace:string;
 readonly title:string;
 readonly createdAtMs:string;
}

/** Original provenance is detached from the ordinary immutable suggestion packet. */
export interface SharedRecoveredBranchTextSuggestion {
 readonly packet:string;
 readonly plainText:string;
 readonly source:Readonly<{selection:SharedIndependentDeliveryParticipantSelection;anchorJson:string}>;
}

/** Preserve the native semantic clipboard content of an archived text, node or grid selection. */
export interface SharedRecoveredBranchRichSuggestionOptions extends Omit<SharedRecoveredBranchTextSuggestionOptions,'sourceRange'> {
 readonly sourceSelection:RichSelection;
}

/** Original verified bytes and the exact fresh destination generation to resolve before acceptance. */
export interface SharedRecoveredBranchSuggestionAsset {
 readonly source:Readonly<SharedVersionAsset>;
 readonly target:Readonly<SharedVersionAsset>;
 readonly contentAsset:string;
 readonly blob:Blob;
}

export interface SharedRecoveredBranchRichSuggestion extends SharedRecoveredBranchTextSuggestion {
 readonly assets:readonly SharedRecoveredBranchSuggestionAsset[];
}
