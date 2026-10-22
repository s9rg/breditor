/** Explicit closed source head; old readers cannot silently discard operational intent. */
import {MAX_INDEPENDENT_DELIVERY_HEAD_BYTES} from '../independent_delivery/contract.js';
import {generationFields} from '../generation_source/identity.js';
import type {IndependentOperationJournalIdentity} from './cut_intent.js';
import {operationJournalFailure as fail} from './journal_failure.js';
export function wrapOperationHead(source:string,id:IndependentOperationJournalIdentity):string{
 if(typeof source!=='string'||new TextEncoder().encode(source).length>MAX_INDEPENDENT_DELIVERY_HEAD_BYTES)throw fail();
 return JSON.stringify({format:'breditor/shared-independent-operation-head',formatVersion:1,operation:id.operation,origin:id.origin,source:JSON.parse(source)});
}
export function unwrapOperationHead(input:string,id:IndependentOperationJournalIdentity):string{
 if(typeof input!=='string'||new TextEncoder().encode(input).length>MAX_INDEPENDENT_DELIVERY_HEAD_BYTES+2048)throw fail();
 const r=JSON.parse(input) as Record<string,unknown>;
 if(!generationFields(r,'format,formatVersion,operation,origin,source')||r['format']!=='breditor/shared-independent-operation-head'||r['formatVersion']!==1||r['operation']!==id.operation||r['origin']!==id.origin)throw fail();
 const source=JSON.stringify(r['source']);if(wrapOperationHead(source,id)!==input)throw fail();return source;
}
