/** Separate portable local-operation family. Its manifest selects immutable
 * native/provenance bytes, never permissions, a relay identity or activation. */
import type {IndependentHistoryCut} from '../independent_history/contract.js';
import type {SharedIndependentSourceRecord} from '../independent_source/contract.js';
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import type {SharedAssetByteBinding,SharedAssetBytePayload} from '../asset_bytes/types.js';
import type {LocalOperationJournalIdentity} from './journal_identity.js';
import type {LocalOperationCutIntent} from './cut_intent.js';
export interface LocalOperationBackupSelection{readonly original:SharedIndependentParticipantSelection;readonly manifestSha256:string}
export interface LocalOperationPortableData{
 readonly operation:LocalOperationJournalIdentity;readonly original:SharedIndependentParticipantSelection;readonly originalFile:Blob;
 readonly intent:LocalOperationCutIntent;readonly observed:string|null;readonly current:IndependentHistoryCut|null;readonly pending:IndependentHistoryCut|null;
 readonly live:readonly SharedIndependentSourceRecord[];readonly uploads:Blob;
 readonly bindings:readonly SharedAssetByteBinding[];readonly assets:readonly SharedAssetBytePayload[];readonly assetBytes:number;readonly payloads:ReadonlyMap<string,Blob>;
}
export interface LocalPortableFile{readonly part:number;readonly lane:'document'|'review';readonly generation:string;readonly kind:'root'|'sealed';readonly sha256:string}
export interface LocalPortableCut{readonly head:number;readonly files:readonly LocalPortableFile[]}
export interface LocalOperationPortableBody{
 readonly format:'breditor/shared-independent-local-operation-backup';readonly formatVersion:1;
 readonly operation:LocalOperationJournalIdentity;readonly original:SharedIndependentParticipantSelection;readonly intent:LocalOperationCutIntent;readonly observed:string|null;
 readonly current:LocalPortableCut|null;readonly pending:LocalPortableCut|null;
 readonly live:readonly Readonly<{kind:SharedIndependentSourceRecord['kind'];index:number;part:number}>[];
 readonly bindings:readonly SharedAssetByteBinding[];readonly assets:readonly (SharedAssetBytePayload&{readonly part:number})[];readonly assetBytes:number;
 readonly uploads:number;readonly parts:readonly Readonly<{offset:number;bytes:number;sha256:string}>[];
}
export interface LocalOperationPortableHeader extends LocalOperationPortableBody{readonly manifestSha256:string}
