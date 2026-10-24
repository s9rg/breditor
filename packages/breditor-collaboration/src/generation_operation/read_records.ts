/** Both actual retained generation archives are required. Cached origin files,
 * phase flags or one matching copy cannot replace the other protected store. */
import {SharedGenerationParticipantBackup} from '../generation_participant/backup.js';
import {generationParticipantSelection} from '../generation_participant/policy.js';
import {readGenerationRecoveryDatabase} from '../generation_participant/recovery_database.js';
import {readGenerationOperationDatabase} from './database.js';
import {generationOperationFailure as fail} from './policy.js';
import type {OperationalGenerationCustody} from './operation.js';
import type {SharedSelectionPolicy} from '../types.js';
const readBackup=SharedGenerationParticipantBackup.read,selection=SharedGenerationParticipantBackup.prototype.selection,dispose=SharedGenerationParticipantBackup.prototype.dispose;
export async function readGenerationOperationalRecords<P extends SharedSelectionPolicy>(s:OperationalGenerationCustody<P>,check:()=>void,signal:AbortSignal|undefined){
 check();const recovered=await readGenerationRecoveryDatabase(s.recoveryDb,s.p.record);check();if(recovered.record.phase!=='ready')throw fail('generation_operation_diverged');const operation=await readGenerationOperationDatabase(s.db,s.record);check();if(operation.record.phase!==s.record.phase)throw fail('generation_operation_diverged');
 const expected=generationParticipantSelection(s.p.options.expected),files=Object.freeze([Object.freeze({role:'recovery-origin' as const,file:recovered.file}),Object.freeze({role:'operation-origin' as const,file:operation.file})]);
 for(const value of files){check();const backup=await readBackup.call(SharedGenerationParticipantBackup,value.file,expected,{...(s.p.options.limits?{limits:s.p.options.limits}:{}),...(signal?{signal}:{})});try{check();if(JSON.stringify(selection.call(backup))!==JSON.stringify(expected))throw fail('generation_operation_diverged');}finally{dispose.call(backup);}}
 check();return{metadata:{format:'breditor/generation-operational-record-read' as const,formatVersion:1 as const,scope:'held-generation-parent-markers-and-two-archives' as const,selection:expected,operation:operation.record,recovery:recovered.record,files:files.map(value=>({role:value.role,bytes:value.file.size,sha256:expected.sha256}))},files};
}
