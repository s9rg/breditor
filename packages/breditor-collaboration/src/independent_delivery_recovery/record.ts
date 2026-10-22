/** Closed monotone attempt grammar. A ready record is intent, never native readiness. */
import {generationFields} from '../generation_source/identity.js';
import type {SharedIndependentDeliveryParticipantRecoveryProgress} from './contract.js';
import {independentDeliveryRecoveryFailure as fail} from './policy.js';
export interface IndependentDeliveryRecoveryRecord extends SharedIndependentDeliveryParticipantRecoveryProgress{readonly format:'breditor/shared-independent-delivery-participant-recovery';readonly formatVersion:1;readonly plan:string}
export function checkIndependentDeliveryRecoveryRecord(raw:unknown,expected:IndependentDeliveryRecoveryRecord):IndependentDeliveryRecoveryRecord{
 if(!generationFields(raw,'format,formatVersion,phase,plan,source,uploads'))throw fail('independent_delivery_recovery_diverged');const r=raw as unknown as IndependentDeliveryRecoveryRecord;
 if(r.format!==expected.format||r.formatVersion!==1||r.plan!==expected.plan||!['preparing','ready'].includes(r.phase)||!['reserved','started','complete'].includes(r.source)||!['reserved','started','complete'].includes(r.uploads)||r.source!=='complete'&&r.uploads!=='reserved'||r.phase==='ready'&&(r.source!=='complete'||r.uploads!=='complete'))throw fail('independent_delivery_recovery_diverged');
 return{format:r.format,formatVersion:1,plan:r.plan,phase:r.phase,source:r.source,uploads:r.uploads};
}
export function checkIndependentDeliveryRecoveryTransition(before:IndependentDeliveryRecoveryRecord,next:IndependentDeliveryRecoveryRecord):void{
 checkIndependentDeliveryRecoveryRecord(next,before);const rank=(v:string)=>['reserved','started','complete'].indexOf(v);
 const advance=Number(rank(next.source)!==rank(before.source))+Number(rank(next.uploads)!==rank(before.uploads))+Number(next.phase!==before.phase);
 if(advance!==1||rank(next.source)<rank(before.source)||rank(next.source)>rank(before.source)+1||rank(next.uploads)<rank(before.uploads)||rank(next.uploads)>rank(before.uploads)+1||before.phase==='ready')throw fail('independent_delivery_recovery_diverged');
}
