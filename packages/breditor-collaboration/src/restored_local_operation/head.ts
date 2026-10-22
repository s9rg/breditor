/** New logical restored-local head over exact paired native bytes. Old local
 * head readers refuse this tag; native JSON is never reconstructed from AST. */
import {readIndependentHistoryHead} from '../independent_history/cut.js';
import {MAX_INDEPENDENT_HISTORY_HEAD_BYTES} from '../independent_history/contract.js';
import {generationFields} from '../generation_source/identity.js';
import {restoredLocalFailure as fail} from './failure.js';
export interface RestoredLocalIdentity{readonly plan:string;readonly operation:string;readonly origin:string;readonly database:string;readonly sourceDatabase:string}
export function wrapRestoredLocalHead(native:string,id:RestoredLocalIdentity):string{readIndependentHistoryHead(native);return JSON.stringify({format:'breditor/shared-restored-local-operation-head',formatVersion:1,operation:id.operation,origin:id.origin,source:JSON.parse(native)});}
export function unwrapRestoredLocalHead(input:string,id:RestoredLocalIdentity):string{
 if(typeof input!=='string'||new TextEncoder().encode(input).length>MAX_INDEPENDENT_HISTORY_HEAD_BYTES+2048)throw fail('restored_local_operation_head');const row=JSON.parse(input);if(!generationFields(row,'format,formatVersion,operation,origin,source')||row['format']!=='breditor/shared-restored-local-operation-head'||row['formatVersion']!==1||row['operation']!==id.operation||row['origin']!==id.origin)throw fail('restored_local_operation_head');const source=JSON.stringify(row['source']);if(wrapRestoredLocalHead(source,id)!==input)throw fail('restored_local_operation_head');return source;
}
export const readRestoredLocalHead=(input:string,id:RestoredLocalIdentity)=>readIndependentHistoryHead(unwrapRestoredLocalHead(input,id));
