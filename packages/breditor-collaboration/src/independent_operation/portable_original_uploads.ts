/** Slice actual pinned original bytes. Replaced public archive facades cannot supply this payload. */
import type {AssetLimits} from '@breditor/experimental-rich-content';
import {INDEPENDENT_DELIVERY_PARTICIPANT_PREFIX_BYTES,MAX_INDEPENDENT_DELIVERY_PARTICIPANT_HEADER_BYTES,readIndependentDeliveryParticipantHeader} from '../independent_delivery_participant/codec.js';
import {operationJournalFailure as fail} from './journal_failure.js';
export async function portableOriginalLayout(file:Blob,limits:Readonly<AssetLimits>,check:()=>void){
 check();const prefix=new Uint8Array(await file.slice(0,INDEPENDENT_DELIVERY_PARTICIPANT_PREFIX_BYTES).arrayBuffer());check();const length=new DataView(prefix.buffer).getUint32(INDEPENDENT_DELIVERY_PARTICIPANT_PREFIX_BYTES-4),offset=INDEPENDENT_DELIVERY_PARTICIPANT_PREFIX_BYTES+length;if(length<1||length>MAX_INDEPENDENT_DELIVERY_PARTICIPANT_HEADER_BYTES||offset>file.size)throw fail();const raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await file.slice(INDEPENDENT_DELIVERY_PARTICIPANT_PREFIX_BYTES,offset).arrayBuffer()));check();const header=readIndependentDeliveryParticipantHeader(raw,file.size-offset,limits);return{header,uploads:file.slice(offset+header.uploads.offset,offset+header.uploads.offset+header.uploads.bytes)};
}
