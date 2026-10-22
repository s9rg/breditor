/** Genuine source witness and whole-upload custody. The final check invokes
 * authority first, then compares exact native values with no further callback. */
import {SharedIndependentHistoryPersistentSession as Session} from '../independent_history/session.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {PreparedIndependentRecovery} from '../independent_recovery/prepare.js';
import {localOperationJournalBinding,IndependentLocalOperationCutJournal} from './cut_journal.js';
import {checkLocalUploads,verifyLocalUploads,localUploadCustody,type LocalParticipantUploadOwners,type LocalParticipantBaseline} from './participant_assets.js';
import {localJournalFailure as fail} from './journal_failure.js';
export interface LocalParticipantOwners<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends LocalParticipantUploadOwners{session?:Session<P>}
const close=Session.prototype.close,discard=Session.prototype.discardAndClose,closeJournal=IndependentLocalOperationCutJournal.prototype.close;
export async function localParticipantWitness(p:PreparedIndependentRecovery,baseline:LocalParticipantBaseline,owners:LocalParticipantOwners,journal:IndependentLocalOperationCutJournal,initial:boolean){
 p.guard();if(!owners.session)throw fail('independent_local_participant_missing');const source=owners.session,port=independentHistoryNative(source),scope=localOperationJournalBinding(journal).borrowRead(source,p.guard,p.options.signal);let returned=false;
 try{const data=scope.readSource(),stamp=port.stamp(),check=()=>{scope.check();checkLocalUploads(owners);port.checkManaged();const actual=port.read();if(port.stamp()!==stamp||actual.documentCheckpoint!==data.documentCheckpoint||actual.reviewCheckpoint!==data.reviewCheckpoint||actual.versions.length!==data.versions.length||actual.versions.some((packet,index)=>packet!==data.versions[index]))throw fail('independent_local_participant_source_changed');};
  check();if(initial&&(data.documentCheckpoint!==p.recovery.documentCheckpoint||data.reviewCheckpoint!==p.recovery.reviewCheckpoint||data.versions.length!==p.recovery.versions.length||data.versions.some((packet,index)=>packet!==p.recovery.versions[index])))throw fail('independent_local_participant_initial_diverged');
  await scope.readSnapshot();check();await verifyLocalUploads(p,baseline,owners,check,initial);check();returned=true;return Object.freeze({data,check,release:scope.release});
 }finally{if(!returned)scope.release();}
}
/** Preserve ordering: native persistence/author leases, actual upload callback,
 * then parent namespace release. Each owner stays reachable after failure. */
export async function closeLocalParticipantOwners(owners:LocalParticipantOwners,journal:IndependentLocalOperationCutJournal|undefined,discardMemory:boolean):Promise<void>{
 if(owners.session){await(discardMemory?discard:close).call(owners.session);delete owners.session;}if(journal)await closeJournal.call(journal);if(owners.uploadCustody){await localUploadCustody.close.call(owners.uploadCustody);delete owners.uploadCustody;}if(owners.uploads){localUploadCustody.closeStore.call(owners.uploads);delete owners.uploads;}
}
