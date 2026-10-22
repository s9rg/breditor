/** Explicit full delivery capture; local-only and old generation source families remain closed. */
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import type {SharedIndependentDeliveryIdentity,SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
export interface SharedIndependentDeliverySourceSelection<P extends SharedSelectionPolicy=SharedSelectionPolicy>{readonly session:SharedIndependentDeliverySession<P>}
export type SharedIndependentDeliverySourceRecordKind='document'|'review'|'version'|'relay'|'suggestions'|'revisions'|'versions';
export interface SharedIndependentDeliverySourceRecord{readonly kind:SharedIndependentDeliverySourceRecordKind;readonly index:number;readonly json:string}
export const MAX_INDEPENDENT_DELIVERY_SOURCE_RECORDS=38;
/** Raw separately bounded native/packet records, not JSON-escaped into an old journal. */
export const MAX_INDEPENDENT_DELIVERY_SOURCE_BYTES=352*1024*1024+64*1024;
export interface IndependentDeliverySourcePort{
 readonly identity:SharedIndependentDeliveryIdentity;readonly core:SharedRichEditor<SharedSelectionPolicy>;
 /** A complete operational export must retain its journal/original, not only this source cut. */
 readonly operation?:object;
 check():void;stamp():readonly object[];read():SharedIndependentDeliveryRecovery;
}
