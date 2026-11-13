import type {RichAssetStore} from '@breditor/experimental-rich-content';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {SharedAssetBytesOptions,SharedAssetBytesResolver,SharedAssetByteBinding,SharedAssetBytePayload} from '../asset_bytes/types.js';
import type {ContinuedPairIdentity,SharedContinuedPairOptions} from '../continued_pair/contract.js';
import type {SharedContinuedPairSession} from '../continued_pair/session.js';
import type {SharedSelectionPolicy} from '../types.js';

export interface ContinuedParticipantIdentity {
 readonly participant:string;
 readonly principal:string;
 readonly source:ContinuedPairIdentity;
 readonly assets:'whole-store';
}
export interface ContinuedParticipantSelection {
 readonly identity:ContinuedParticipantIdentity;
 readonly sha256:string;
}
export interface ContinuedParticipantMetadata {
 readonly identity:ContinuedParticipantIdentity;
 readonly bindings:readonly SharedAssetByteBinding[];
 readonly assets:readonly SharedAssetBytePayload[];
 readonly assetBytes:number;
}
export interface ContinuedParticipantCaptureOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>
 extends SharedArchiveIntegrityOptions,SharedAssetBytesOptions {
 readonly participant:string;
 readonly principal:string;
 readonly session:SharedContinuedPairSession<P>;
 readonly uploads:RichAssetStore;
 readonly resolveAsset?:SharedAssetBytesResolver;
}
export interface ContinuedParticipantReadOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>
 extends SharedArchiveIntegrityOptions,SharedAssetBytesOptions {
 readonly restoreDocument:SharedContinuedPairOptions<P>['restoreDocument'];
}
