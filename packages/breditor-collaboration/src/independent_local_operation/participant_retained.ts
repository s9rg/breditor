/** Re-admit completed first recovery and its exact retired native source.
 * These old databases remain immutable while the new operational source advances. */
import type {PreparedIndependentRecovery} from '../independent_recovery/prepare.js';
import {readIndependentRecoveryDatabase} from '../independent_recovery/database.js';
import {inspectIndependentDestination} from '../independent_recovery/destination.js';
import {independentParticipantDigest} from '../independent_participant/codec.js';
import {existingDatabase} from '../participant_recovery/journal.js';
import {readDedicatedOperationSourceDatabase} from '../independent_operation/read_source_database.js';
import {readOperationCut,sameOperationCut,operationCutDigest} from '../independent_operation/cut_codec.js';
import {localOperationJournalBinding,type IndependentLocalOperationCutJournal} from './cut_journal.js';
import {localOperationJournalIdentity} from './journal_identity.js';
import {readLocalOperationHead,wrapLocalOperationHead} from './operation_head.js';
import {readLocalJournalDatabase} from './journal_database.js';
import type {LocalParticipantChoice} from './participant_prepare.js';
import {localJournalFailure as fail} from './journal_failure.js';
export async function verifyLocalRetainedRecovery(p:PreparedIndependentRecovery,db:IDBDatabase):Promise<void>{
 p.guard();const saved=await readIndependentRecoveryDatabase(db,p.record,p.guard);p.guard();if(saved.record.phase!=='ready'||saved.record.source!=='complete'||saved.record.uploads!=='complete')throw fail('independent_local_participant_recovery_incomplete');
 if(await independentParticipantDigest(saved.file,p.options.signal)!==p.options.expected.sha256)throw fail('independent_local_participant_recovery_diverged');p.guard();if(await inspectIndependentDestination(p)!=='exact')throw fail('independent_local_participant_recovery_diverged');p.guard();
}
/** Preparing/prepared admits only the exact initial cut. An ancestry-valid later
 * native descendant cannot be silently adopted as initial participant publication. */
export async function verifyInitialLocalJournal(choice:LocalParticipantChoice,p:PreparedIndependentRecovery,journal:IndependentLocalOperationCutJournal):Promise<void>{
 const binding=localOperationJournalBinding(journal);choice.guard();if(binding.sourceDatabase!==choice.sourceDatabase||JSON.stringify(binding.expected)!==JSON.stringify(p.options.expected))throw fail('independent_local_participant_recovery_diverged');
 const id=await localOperationJournalIdentity(choice.journalDatabase,choice.sourceDatabase,p.options.expected);choice.guard();const baseline=await readOperationCut({head:wrapLocalOperationHead(p.cut.head,id),files:p.cut.files},head=>readLocalOperationHead(head,id));choice.guard();const hash=await operationCutDigest(baseline);choice.guard();const db=await existingDatabase(choice.journalDatabase);if(!db)throw fail('independent_local_participant_missing');let changed=false;db.onversionchange=()=>{changed=true;db.close();};const guard=()=>{choice.guard();if(changed)throw fail('independent_local_participant_storage_changed');};
 try{guard();const saved=await readLocalJournalDatabase(db,id,guard);guard();if(await independentParticipantDigest(saved.file,p.options.signal)!==p.options.expected.sha256)throw fail('independent_local_participant_recovery_diverged');guard();for(const[key,value]of saved.rows)if(key!==hash||!sameOperationCut(value,baseline))throw fail('independent_local_participant_initial_diverged');
  const n=p.options.expected.identity.source.native,actual=await readDedicatedOperationSourceDatabase(choice.sourceDatabase,[n.room,n.writer],head=>readLocalOperationHead(head,id),guard,'local-operation-v1');guard();if(actual===null?saved.record.current!==null:!sameOperationCut({head:actual.head,files:actual.files},baseline)||saved.record.current!==hash&&saved.record.pending!==hash)throw fail('independent_local_participant_initial_diverged');
 }finally{db.close();}
}
