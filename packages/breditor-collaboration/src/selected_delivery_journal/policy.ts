/** New bounded immutable journal; exhaustion refuses without trimming history. */
import {fields as sourceFields,integer,hash} from '../physical_room_record_cut/policy.js';
export {integer,hash};
export const MAX_DELIVERY_JOURNAL_BYTES=2*1024*1024*1024,MAX_DELIVERY_JOURNAL_EVENTS=4096;
export class DeliveryJournalError extends Error{constructor(readonly code:'delivery_journal_authority'|'delivery_journal_policy'|'delivery_journal_integrity'|'delivery_journal_budget'|'delivery_journal_exists'|'delivery_journal_missing'|'delivery_journal_busy'|'delivery_journal_closed'|'delivery_journal_aborted'|'delivery_journal_storage'){super('Retain complete factual delivery cuts; require fresh native ancestry and approval before resume');this.name='DeliveryJournalError';}}
export const fail=(code:DeliveryJournalError['code']='delivery_journal_integrity')=>new DeliveryJournalError(code);
export function fields(value:unknown,required:readonly string[]):Record<string,unknown>{try{return sourceFields(value,required);}catch{throw fail('delivery_journal_policy');}}
