/** Original catalog data from one selected server; no recipient grants or ACK installation. */
import type {SharedDocumentVersionsPage} from '../versions/types.js';
import type {SharedSuggestionPublication,SharedSuggestionDecision} from '../suggestions/types.js';
import type {SharedSuggestionRevisionReceipt} from '../suggestion_revisions/types.js';
import type {SharedSuggestionPermissions} from '../relay/suggestion_types.js';
export const MAX_SERVER_METADATA_PAGE_BYTES=8*1024*1024;
export type ServerMetadataFamily='server-log-generation-recovery'|'physical-room-recovery';
export interface OriginalMetadataCursor {readonly binding:string;readonly after:string;readonly through:string}
export type OriginalMetadataLaneQuery=Readonly<{kind:'disabled'}|{kind:'start'}|{kind:'after';cursor:OriginalMetadataCursor}>;
export interface OriginalMetadataQuery {readonly versions:OriginalMetadataLaneQuery;readonly suggestions:OriginalMetadataLaneQuery;readonly revisions:OriginalMetadataLaneQuery}
/** Complete collection always starts fresh; an arbitrary older interval is not current coverage. */
export interface OriginalMetadataStartQuery {readonly versions:Readonly<{kind:'disabled'|'start'}>;readonly suggestions:Readonly<{kind:'disabled'|'start'}>;readonly revisions:Readonly<{kind:'disabled'|'start'}>}
export interface OriginalPacketFingerprint {readonly id:string;readonly bytes:number;readonly sha256:string}
export type OriginalSuggestionUpdate=Readonly<{kind:'published';data:SharedSuggestionPublication}|{kind:'decided';data:SharedSuggestionDecision}>;
export interface OriginalSuggestionsDescriptor {readonly format:'breditor/relay-document-suggestions';readonly formatVersion:1;readonly document:string;readonly binding:string;readonly effectWriter:string}
export interface OriginalRevisionsDescriptor {readonly format:'breditor/relay-suggestion-revisions';readonly formatVersion:1;readonly document:string;readonly binding:string;readonly suggestionBinding:string}
export interface OriginalSuggestionsPage {readonly descriptor:OriginalSuggestionsDescriptor;readonly updates:readonly OriginalSuggestionUpdate[];readonly cursor:OriginalMetadataCursor;readonly more:boolean;/** Authenticated SERVER reader rights; never the restored client's rights. */readonly permissions:SharedSuggestionPermissions}
export interface OriginalRevisionsPage {readonly descriptor:OriginalRevisionsDescriptor;readonly revisions:readonly SharedSuggestionRevisionReceipt[];readonly cursor:OriginalMetadataCursor;readonly more:boolean;/** Authenticated SERVER reader rights; never the restored client's rights. */readonly permissions:SharedSuggestionPermissions}
export type OriginalMetadataLanePage<P>=Readonly<{kind:'disabled'}|{kind:'page';catalog:P;packets:readonly OriginalPacketFingerprint[]}>;
export interface OriginalMetadataPage {readonly versions:OriginalMetadataLanePage<SharedDocumentVersionsPage>;readonly suggestions:OriginalMetadataLanePage<OriginalSuggestionsPage>;readonly revisions:OriginalMetadataLanePage<OriginalRevisionsPage>}
export interface SelectedServerMetadataRead<S> {readonly format:`breditor/${ServerMetadataFamily}-metadata-read`;readonly formatVersion:1;readonly selection:S;readonly requestSha256:string;readonly scope:'selected-server-original-metadata-receipts-and-packet-fingerprints-page';readonly metadata:OriginalMetadataPage}
export interface SelectedServerMetadataCatalog<S> {readonly format:'breditor/selected-server-original-metadata-catalog';readonly formatVersion:1;readonly selection:S;readonly pages:readonly SelectedServerMetadataRead<S>[];readonly terminal:Readonly<{versions:OriginalMetadataCursor|null;suggestions:OriginalMetadataCursor|null;revisions:OriginalMetadataCursor|null}>}
