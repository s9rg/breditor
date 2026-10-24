/** Both protected files are independently re-admitted. Neither archive may be
 * replaced by cached origin objects, current packets or the other valid copy. */
import {SharedGenerationParticipantBackup} from '../generation_participant/backup.js';
import type {OperationalGenerationCustody} from './operation.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {GenerationReferenceOrigin} from '../generation_source/record_reference_capture.js';
import type {ParentRecordFile} from '../operation_read/parent_records.js';
import {generationOperationFailure as fail} from './policy.js';
const read=SharedGenerationParticipantBackup.read,records=SharedGenerationParticipantBackup.prototype.records,dispose=SharedGenerationParticipantBackup.prototype.dispose;
export async function generationHistoryRecords<P extends SharedSelectionPolicy>(s:OperationalGenerationCustody<P>,files:readonly ParentRecordFile[],check:()=>void,signal:AbortSignal|undefined):Promise<readonly GenerationReferenceOrigin[]>{
 if(files.length!==2||files[0]?.role!=='recovery-origin'||files[1]?.role!=='operation-origin')throw fail('generation_operation_diverged');const origins:GenerationReferenceOrigin[]=[];
 for(const value of files){check();const backup=await read.call(SharedGenerationParticipantBackup,value.file,s.p.options.expected,{...(s.p.options.limits?{limits:s.p.options.limits}:{}),...(signal?{signal}:{})});try{check();origins.push({role:value.role,records:records.call(backup)});}finally{dispose.call(backup);}}
 check();return origins;
}
