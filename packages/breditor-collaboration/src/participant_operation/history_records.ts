/** Decode only a freshly admitted actual original archive. No old job guard,
 * cached origin reader, current upload store or native writer is used here. */
import {SharedParticipantBackup} from '../participant_backup/archive.js';
import {readPairedBackupRecord} from '../backups/paired.js';
import {checkCatalogRecord} from '../versions/database.js';
import {checkQueueRecord} from '../suggestions/database.js';
import {checkRevisionRecord} from '../suggestion_revisions/database.js';
import {operationFailure as fail} from './errors.js';
import type {OperationalParticipantCustody} from './operation.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {OriginalReferenceOrigin} from '../persistence/original_record_reference_capture.js';
import type {OriginalReferencePacketRows} from '../persistence/original_reference_packets.js';
const read=SharedParticipantBackup.read,records=SharedParticipantBackup.prototype.records,dispose=SharedParticipantBackup.prototype.dispose;
export async function originalHistoryRecords<P extends SharedSelectionPolicy>(s:OperationalParticipantCustody<P>,file:Blob,check:()=>void,signal:AbortSignal|undefined):Promise<readonly OriginalReferenceOrigin[]>{
 check();const backup=await read.call(SharedParticipantBackup,file,s.p.expected,{limits:s.p.limits,...(signal?{signal}:{})});
 try{check();const rows=new Map(records.call(backup).map(row=>[row.kind,row.json])),get=<T>(kind:Parameters<typeof rows.get>[0],admit:(text:string)=>T):T=>{const text=rows.get(kind);if(text===undefined)throw fail('operation_diverged');const value=admit(text);if(JSON.stringify(value)!==text)throw fail('operation_diverged');return value;};
  const source=s.p.expected.identity.source,paired=rows.has('paired-session')?get('paired-session',text=>readPairedBackupRecord(text,source)):null,checkpoint=rows.get('document');if(!checkpoint||paired&&paired.documentCheckpointJson!==checkpoint)throw fail('operation_diverged');
  const packets:OriginalReferencePacketRows={};if(rows.has('version-catalog')){if(!s.p.versions)throw fail('operation_diverged');packets.versions=get('version-catalog',text=>checkCatalogRecord(JSON.parse(text),s.p.versions!.identity));}if(rows.has('suggestions')){if(!s.p.suggestions)throw fail('operation_diverged');packets.suggestions=get('suggestions',text=>checkQueueRecord(JSON.parse(text),s.p.suggestions!.identity,s.p.suggestions!.ownedHistory));}if(rows.has('suggestion-revisions')){if(!s.p.suggestions||!s.p.revisions)throw fail('operation_diverged');packets.revisions=get('suggestion-revisions',text=>checkRevisionRecord(JSON.parse(text),s.p.suggestions!.identity,s.p.revisions!.binding));}
  const reviewedHistory=paired&&'reviewedHistory'in paired?paired.reviewedHistory:null;if(reviewedHistory)packets.reviewedHistory='reviewed-v1';check();return[{role:'operation-origin',native:{slot:'committed',checkpoint,...source,reviewedHistory,paired},packets}];
 }finally{dispose.call(backup);}
}
