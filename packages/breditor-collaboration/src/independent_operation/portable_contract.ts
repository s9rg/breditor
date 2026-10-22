/** Distinct portable-operation family. A manifest content digest is not an old whole-file hash,
 * a native signature, ownership, current permission or a room activation marker. */
import type {IndependentHistoryCut} from '../independent_history/contract.js';
import type {IndependentOperationCutIntent,IndependentOperationJournalIdentity} from './cut_intent.js';
import type {SharedIndependentDeliverySourceRecord} from '../independent_delivery_source/contract.js';
import type {SharedIndependentDeliveryParticipantSelection} from '../independent_delivery_participant/contract.js';
import type {SharedAssetByteBinding,SharedAssetBytePayload} from '../asset_bytes/types.js';
export interface IndependentOperationBackupSelection {readonly original:SharedIndependentDeliveryParticipantSelection;readonly manifestSha256:string}
export interface IndependentOperationPortableData {
 readonly operation:IndependentOperationJournalIdentity;readonly original:SharedIndependentDeliveryParticipantSelection;readonly originalFile:Blob;
 readonly intent:IndependentOperationCutIntent;readonly observed:string|null;readonly current:IndependentHistoryCut|null;readonly pending:IndependentHistoryCut|null;
 readonly live:readonly SharedIndependentDeliverySourceRecord[];readonly uploads:Blob;
 readonly bindings:readonly SharedAssetByteBinding[];readonly assets:readonly SharedAssetBytePayload[];readonly assetBytes:number;readonly payloads:ReadonlyMap<string,Blob>;
}
export interface OperationPortableFile {readonly part:number;readonly lane:'document'|'review';readonly generation:string;readonly kind:'root'|'sealed';readonly sha256:string}
export interface OperationPortableCut {readonly head:number;readonly files:readonly OperationPortableFile[]}
export interface IndependentOperationPortableBody {
 readonly format:'breditor/shared-independent-operation-backup';readonly formatVersion:1;
 readonly operation:IndependentOperationJournalIdentity;readonly original:SharedIndependentDeliveryParticipantSelection;readonly intent:IndependentOperationCutIntent;readonly observed:string|null;
 readonly current:OperationPortableCut|null;readonly pending:OperationPortableCut|null;
 readonly live:readonly Readonly<{kind:SharedIndependentDeliverySourceRecord['kind'];index:number;part:number}>[];
 readonly bindings:readonly SharedAssetByteBinding[];readonly assets:readonly (SharedAssetBytePayload&{readonly part:number})[];readonly assetBytes:number;
 readonly uploads:number;readonly parts:readonly Readonly<{offset:number;bytes:number;sha256:string}>[];
}
export interface IndependentOperationPortableHeader extends IndependentOperationPortableBody {readonly manifestSha256:string}
