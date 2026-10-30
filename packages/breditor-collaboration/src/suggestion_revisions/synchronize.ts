/** The original authenticated revision algorithm, shared by ordinary and held
 * execution. All authority, original storage and pending-work custody remain
 * with the caller; this protocol function cannot construct any of them. */
import {SharedRelayError} from '../relay/validation.js';
import {same} from '../suggestions/validation.js';
import {readRevisionFeed,checkRevisionFeed} from './feed.js';
import {ensureRevisionPrevious} from './ensure_previous.js';
import {submitRevision} from './submit.js';
import {bridgeRevision} from './bridge.js';
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedSuggestionRevisionInfo} from '../suggestion_types.js';
import type {SuggestionSyncQueue} from '../suggestions/sync_queue.js';
import type {SharedSuggestionTransport} from '../suggestions/transport_port.js';
import type {SharedSuggestionQueueIdentity} from '../suggestions/types.js';
import type {SharedSuggestionRevisionReceipt,SharedSuggestionRevisionsRecord,SharedSuggestionRevisionRow,SharedSuggestionRevisionRequest} from './types.js';
export interface RevisionSynchronization<P extends SharedSelectionPolicy>{
 readonly core:SharedRichEditor<P>;readonly queue:SuggestionSyncQueue<P>;readonly transport:SharedSuggestionTransport<P>;
 readonly identity:SharedSuggestionQueueIdentity;readonly binding:string;
 check():void;flush():Promise<void>;persistSource():Promise<void>;
 record():SharedSuggestionRevisionsRecord;infos():readonly SharedSuggestionRevisionInfo[];
 row(id:string):SharedSuggestionRevisionRow;
 replace(id:string,change:(row:SharedSuggestionRevisionRow)=>SharedSuggestionRevisionRow):void;
 feed():ReadonlyMap<string,SharedSuggestionRevisionReceipt>;setFeed(feed:Map<string,SharedSuggestionRevisionReceipt>):void;
 request(input:SharedSuggestionRevisionRequest):Promise<Record<string,unknown>>;
}
export async function synchronizeRevisions<P extends SharedSelectionPolicy>(o:RevisionSynchronization<P>):Promise<void>{
 const check=()=>o.check();check();await o.flush();await o.transport.refreshDocument();check();
 const feed=await readRevisionFeed(input=>o.request(input),o.identity,o.binding);check();
 checkRevisionFeed([...o.feed().values(),...o.record().retained.flatMap(row=>row.receipt?[row.receipt]:[])],feed.revisions);o.setFeed(feed.revisions);
 for(const info of o.infos()){
  let row=o.row(info.id);const discovered=feed.revisions.get(info.id);
  if(discovered&&!row.receipt){if(!same(discovered.revision,info))throw new SharedRelayError('suggestion_revision_receipt_mismatch');o.replace(info.id,value=>({...value,receipt:discovered,retry:false,conflict:null}));await o.flush();row=o.row(info.id);}
  if(row.retry&&feed.permissions.canPropose){
   await o.transport.flush();check();await o.persistSource();await o.flush();check();if(!o.row(info.id).retry)continue;
   if(!await ensureRevisionPrevious(o.queue,o.transport,row.previousPacket,check))continue;
   const result=await submitRevision(input=>o.request(input),o.identity,o.binding,row,info);check();
   if(result){const effect=result.conflict?.decision.effect;if(effect&&o.core.retainedWriterReceiptV2(effect.writerGroup).kind!=='verified'){await o.transport.refreshDocument();check();if(o.core.retainedWriterReceiptV2(effect.writerGroup).kind!=='verified')continue;}
    // A conflict's predecessor winner is already authenticated and its
    // publication was retained by ensureRevisionPrevious. Retain its exact
    // native effect/owned history in the original queue BEFORE acknowledging
    // the dependent losing-revision receipt, even without a running base sync.
    if(result.conflict){let retained=await o.queue.receiveVerifiedDecision(info.previousSuggestionId,result.conflict.decision);check();if(retained==='waitingForDocument'){await o.transport.refreshDocument();check();retained=await o.queue.receiveVerifiedDecision(info.previousSuggestionId,result.conflict.decision);check();}if(retained==='waitingForDocument')continue;}
    o.replace(info.id,value=>({...value,...result,retry:false}));await o.flush();row=o.row(info.id);if(row.receipt)o.setFeed(new Map([...o.feed(),[info.id,row.receipt]]));
   }
  }
  if(row.receipt)await bridgeRevision(o.queue,o.transport,row.previousPacket,row.packet,row.receipt,check);
 }
}
