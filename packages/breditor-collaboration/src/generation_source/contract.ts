/** Explicit generation sources; native strings and original retained records keep their codecs. */
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SegmentedSessionIdentity} from "../persistence/segmented_contract.js";
import type {SharedSegmentedPersistentSession} from "../persistence/segmented_session.js";
import type {SharedSegmentedRelaySession} from "../segmented_relay/session.js";
import type {SharedSegmentedRelayBinding} from "../segmented_relay/contract.js";
import type {SharedSegmentedRetainedBinding} from "../segmented_relay/retained_contract.js";
export type SharedGenerationSourceKind="local"|"relay"|"retained";
export type SharedGenerationSourceSelection<P extends SharedSelectionPolicy=SharedSelectionPolicy>=
 |Readonly<{kind:"local";session:SharedSegmentedPersistentSession<P>}>
 |Readonly<{kind:"relay"|"retained";session:SharedSegmentedRelaySession<P>}>;
export interface SharedGenerationSourceIdentity {
 readonly kind:SharedGenerationSourceKind;readonly native:Readonly<SegmentedSessionIdentity>;
 readonly review:Readonly<{actor:string;principal:string}>|null;
 readonly relay:SharedSegmentedRelayBinding|null;readonly retained:SharedSegmentedRetainedBinding|null;
}
export type SharedGenerationSourceRecordKind="document"|"review"|"local-version"|"relay"|"suggestions"|"revisions"|"versions";
export interface SharedGenerationSourceRecord {readonly kind:SharedGenerationSourceRecordKind;readonly index:number;readonly json:string}
// Each payload is stored separately, not JSON-escaped into a larger journal or old 16 MiB record.
export const MAX_GENERATION_SOURCE_BYTES=304*1024*1024+128*1024;
export const MAX_GENERATION_SOURCE_IDENTITY_BYTES=64*1024;
export const MAX_GENERATION_SOURCE_RECORDS=39;
export interface GenerationSourcePort {readonly identity:SharedGenerationSourceIdentity;readonly core:SharedRichEditor<SharedSelectionPolicy>;check():void;stamp():readonly object[];read():readonly SharedGenerationSourceRecord[]}
