/** Closed monotone intent grammar, not stored native readiness. */
import type {SharedIndependentParticipantRecoveryProgress} from './contract.js';
import {generationFields} from '../generation_source/identity.js';
import {independentRecoveryFailure as fail} from './policy.js';
export interface IndependentRecoveryRecord extends SharedIndependentParticipantRecoveryProgress{readonly format:'breditor/shared-independent-participant-recovery';readonly formatVersion:1;readonly plan:string}
export function checkIndependentRecoveryRecord(raw:unknown,expected:IndependentRecoveryRecord):IndependentRecoveryRecord{
 if(!generationFields(raw,'format,formatVersion,phase,plan,source,uploads'))throw fail('independent_recovery_diverged');const r=raw as unknown as IndependentRecoveryRecord;
 if(r.format!==expected.format||r.formatVersion!==1||r.plan!==expected.plan||!['preparing','ready'].includes(r.phase)||!['reserved','started','complete'].includes(r.source)||!['reserved','started','complete'].includes(r.uploads)||r.source!=='complete'&&r.uploads!=='reserved'||r.phase==='ready'&&(r.source!=='complete'||r.uploads!=='complete'))throw fail('independent_recovery_diverged');return{format:r.format,formatVersion:1,plan:r.plan,phase:r.phase,source:r.source,uploads:r.uploads};
}
export function checkIndependentRecoveryTransition(before:IndependentRecoveryRecord,next:IndependentRecoveryRecord):void{
 checkIndependentRecoveryRecord(next,before);const rank=(value:string)=>['reserved','started','complete'].indexOf(value),advance=Number(next.source!==before.source)+Number(next.uploads!==before.uploads)+Number(next.phase!==before.phase);
 if(advance!==1||before.phase==='ready'||rank(next.source)<rank(before.source)||rank(next.source)>rank(before.source)+1||rank(next.uploads)<rank(before.uploads)||rank(next.uploads)>rank(before.uploads)+1)throw fail('independent_recovery_diverged');
}
