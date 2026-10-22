/** Explicit local operational provenance around the unchanged native head. */
import {readIndependentHistoryHead} from '../independent_history/cut.js';
import {MAX_INDEPENDENT_HISTORY_HEAD_BYTES} from '../independent_history/contract.js';
import {generationFields} from '../generation_source/identity.js';
import type {LocalOperationJournalIdentity} from './journal_identity.js';
import {localJournalFailure as fail} from './journal_failure.js';
export function wrapLocalOperationHead(source:string,id:LocalOperationJournalIdentity):string{readIndependentHistoryHead(source);return JSON.stringify({format:'breditor/shared-independent-local-operation-head',formatVersion:1,operation:id.operation,origin:id.origin,source:JSON.parse(source)});}
export function unwrapLocalOperationHead(input:string,id:LocalOperationJournalIdentity):string{
 if(typeof input!=='string'||new TextEncoder().encode(input).length>MAX_INDEPENDENT_HISTORY_HEAD_BYTES+2048)throw fail();const row=JSON.parse(input) as Record<string,unknown>;if(!generationFields(row,'format,formatVersion,operation,origin,source')||row['format']!=='breditor/shared-independent-local-operation-head'||row['formatVersion']!==1||row['operation']!==id.operation||row['origin']!==id.origin)throw fail();const source=JSON.stringify(row['source']);if(wrapLocalOperationHead(source,id)!==input)throw fail();return source;
}
export const readLocalOperationHead=(input:string,id:LocalOperationJournalIdentity)=>readIndependentHistoryHead(unwrapLocalOperationHead(input,id));
