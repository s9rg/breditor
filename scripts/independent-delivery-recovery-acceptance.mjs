/** Same full native/network assertions with actual durable, readonly-first participant coordination. */
import assert from 'node:assert/strict';
import {independentDeliveryParticipantAcceptance} from './independent-delivery-participant-acceptance.mjs';
import {resetRecoveryEvidence,recoveryEvidence} from './fixtures/independent-delivery-recovery/session.mjs';
export async function independentDeliveryRecoveryAcceptance(options){
 resetRecoveryEvidence();const workflows=await independentDeliveryParticipantAcceptance({...options,participantRecovery:true}),coordinator=recoveryEvidence();
 assert.deepEqual(coordinator,{cuts:256,finishes:512,handoffs:512,wholeUploads:512,retainedOriginalFiles:512,readOnlyRefusals:1024,currentPolicyReopens:256});
 return{format:'breditor/independent-delivery-recovery-acceptance',passed:true,workflows,coordinator,scope:'Actual readonly-first source/upload coordination, retained original files, cold attempt resume, explicit fresh current-policy reopen and all unchanged native/authenticated workflow assertions. Synthetic IDB/locks/raster presentation and host mapping callback. Not durable operational-descendant intent, physical whole-room adoption, provider-wide reconciliation, authenticated activation, platform crash durability or V1 approval.'};
}
