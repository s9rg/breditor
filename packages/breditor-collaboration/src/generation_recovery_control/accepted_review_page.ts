/** Original bounded ordered review pages. Native import/receipt verification is
 * still mandatory before persisting a cursor; no data-only acknowledgement. */
import {archiveFields as object} from '../archive_integrity/policy.js';
import {frame,decimal} from '../relay/validation.js';
import {reviewBinding,reviewCursor,reviewRole,reviewSource,reviewReceipt} from '../relay/review_validation.js';
import {controlFailure as fail} from './policy.js';
import type {SharedServerLogGenerationRecoveryAcceptedRequest,SharedServerLogGenerationRecoveryAcceptedReviewPage,SharedServerLogGenerationRecoveryAcceptedReviewBatch} from './accepted_contract.js';
export function readAcceptedReviewPage(input:unknown,request:SharedServerLogGenerationRecoveryAcceptedRequest['review']):SharedServerLogGenerationRecoveryAcceptedReviewPage|null {
 if(request.kind==='absent'){if(input!==null)throw fail();return null;}
 const r=object(input,'descriptor,cursor,more,batches,currentRole'),descriptor=object(r['descriptor'],'format,formatVersion,binding'),binding=reviewBinding(descriptor['binding']);if(descriptor['format']!=='breditor/relay-review'||descriptor['formatVersion']!==1||request.kind==='after'&&request.cursor.binding!==binding)throw fail();
 const cursor=reviewCursor(r['cursor'],binding),more=r['more'],raw=r['batches'],before=request.kind==='after'?request.cursor.after:'0';if(typeof more!=='boolean'||!Array.isArray(raw)||raw.length>4096||more&&!raw.length||BigInt(cursor.after)<BigInt(before))throw fail();
 let previous=before;const batches:SharedServerLogGenerationRecoveryAcceptedReviewBatch[]=raw.map(value=>{const row=object(value,'sequence,source,frame,receipt'),sequence=decimal(row['sequence']);if(BigInt(sequence)<=BigInt(previous)||BigInt(sequence)>BigInt(cursor.after))throw fail();previous=sequence;const source=object(row['source'],'actor,principal,role'),verified=reviewSource(source),receipt=reviewReceipt(row['receipt']),role=source['role'];if(receipt.actor!==verified.actor||role!=='comment'&&role!=='moderator')throw fail();return{sequence,source:{actor:verified.actor,principal:verified.principal,role},frame:frame(row['frame']),receipt};});
 if(batches.length&&cursor.after!==previous||!batches.length&&request.kind==='after'&&cursor.after!==before)throw fail();const page:SharedServerLogGenerationRecoveryAcceptedReviewPage={descriptor:{format:'breditor/relay-review',formatVersion:1,binding},cursor,more,batches,currentRole:reviewRole(r['currentRole'])};if(new TextEncoder().encode(JSON.stringify(page)).length>4*1024*1024)throw fail();return page;
}
