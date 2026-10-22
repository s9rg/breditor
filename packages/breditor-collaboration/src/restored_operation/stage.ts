/** Acknowledge one exact native cut at a time. The cursor advances with that same
 * commit; a phase marker alone never authorizes source access or repairs lost data. */
import {generationFields} from '../generation_source/identity.js';
import {readOperationCutIntent,initialOperationCutIntent,checkOperationCutTransition,type IndependentOperationCutIntent,type IndependentOperationJournalIdentity} from '../independent_operation/cut_intent.js';
import {operationJournalFailure as fail} from '../independent_operation/journal_failure.js';
export interface RestoredOperationStage {
 readonly format:'breditor/shared-restored-operation-stage';readonly formatVersion:1;
 readonly intent:IndependentOperationCutIntent;readonly completed:number;
}
export function readRestoredOperationStage(value:unknown,id:IndependentOperationJournalIdentity,stages:number):RestoredOperationStage{
 if(!generationFields(value,'format,formatVersion,intent,completed'))throw fail('restored_operation_stage');
 const r=value as unknown as RestoredOperationStage;
 if(r.format!=='breditor/shared-restored-operation-stage'||r.formatVersion!==1||!Number.isSafeInteger(stages)||stages<1||stages>4||!Number.isSafeInteger(r.completed)||r.completed<0||r.completed>stages)throw fail('restored_operation_stage');
 const intent=readOperationCutIntent(r.intent,id);
 if(r.completed===0&&intent.current!==null||r.completed>0&&intent.current===null||BigInt(intent.sequence)<BigInt(r.completed)*2n||r.completed<stages&&BigInt(intent.sequence)!==BigInt(r.completed)*2n+(intent.pending===null?0n:1n))throw fail('restored_operation_stage');
 return{format:r.format,formatVersion:1,intent,completed:r.completed};
}
export const initialRestoredOperationStage=(id:IndependentOperationJournalIdentity):RestoredOperationStage=>({format:'breditor/shared-restored-operation-stage',formatVersion:1,intent:initialOperationCutIntent(id),completed:0});
export function checkRestoredOperationTransition(before:RestoredOperationStage,next:RestoredOperationStage,id:IndependentOperationJournalIdentity,targets:readonly string[]):void{
 readRestoredOperationStage(before,id,targets.length);readRestoredOperationStage(next,id,targets.length);checkOperationCutTransition(before.intent,next.intent,id);
 const acknowledging=before.intent.pending!==null,advance=acknowledging&&before.completed<targets.length;
 if(next.completed!==before.completed+(advance?1:0)||before.completed<targets.length&&(acknowledging?next.intent.current:next.intent.pending)!==targets[before.completed])throw fail('restored_operation_stage');
}
