/** Flat provenance for repeated operational recovery. Each state retains its exact old header
 * and raw content-addressed parts; a lineage link never replaces its input or grants writes. */
import type {IndependentOperationBackupSelection} from './portable_contract.js';
export type OperationLineageReference=Readonly<{kind:'snapshot'|'lineage';manifestSha256:string}>;
export interface OperationLineageNodeBody {
 readonly format:'breditor/shared-independent-operation-lineage-node';readonly formatVersion:1;
 readonly previous:OperationLineageReference;readonly snapshot:string;
}
export interface OperationLineageNode extends OperationLineageNodeBody {readonly manifestSha256:string}
export interface OperationLineageState {readonly manifestSha256:string;readonly header:string}
export interface OperationLineagePart {readonly sha256:string;readonly bytes:number;readonly offset:number}
export interface OperationLineageHeader {
 readonly format:'breditor/shared-independent-operation-lineage-backup';readonly formatVersion:1;
 readonly root:string;readonly states:readonly OperationLineageState[];readonly nodes:readonly OperationLineageNode[];readonly parts:readonly OperationLineagePart[];
}
export interface OperationLineageData {readonly expected:IndependentOperationBackupSelection;readonly header:OperationLineageHeader;readonly payloads:ReadonlyMap<string,Blob>}
