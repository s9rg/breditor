/** Closed flat-local native head. Original/restored snapshot head readers do
 * not learn this family; actual native JSON remains byte-for-byte unchanged. */
import {readIndependentHistoryHead} from '../independent_history/cut.js';
import {MAX_INDEPENDENT_HISTORY_HEAD_BYTES} from '../independent_history/contract.js';
import {generationFields} from '../generation_source/identity.js';
import type {NativeInputJournalIdentity} from '../native_input_operation/journal_contract.js';
import {flatLocalFailure as fail} from './failure.js';
export type FlatLocalIdentity=NativeInputJournalIdentity;
export function wrapFlatLocalHead(native:string,id:FlatLocalIdentity):string{readIndependentHistoryHead(native);return JSON.stringify({format:'breditor/shared-flat-local-input-head',formatVersion:1,operation:id.operation,origin:id.origin,source:JSON.parse(native)});}
export function unwrapFlatLocalHead(input:string,id:FlatLocalIdentity):string{if(typeof input!=='string'||new TextEncoder().encode(input).length>MAX_INDEPENDENT_HISTORY_HEAD_BYTES+2048)throw fail('flat_local_input_head');const row:unknown=JSON.parse(input);if(!generationFields(row,'format,formatVersion,operation,origin,source')||row['format']!=='breditor/shared-flat-local-input-head'||row['formatVersion']!==1||row['operation']!==id.operation||row['origin']!==id.origin)throw fail('flat_local_input_head');const native=JSON.stringify(row['source']);if(wrapFlatLocalHead(native,id)!==input)throw fail('flat_local_input_head');return native;}
export const readFlatLocalHead=(input:string,id:FlatLocalIdentity)=>readIndependentHistoryHead(unwrapFlatLocalHead(input,id));
