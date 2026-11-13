import {SharedEditorError} from '../core.js';
import {canonicalContinuedPairIdentity} from '../continued_pair/cut.js';
import type {ContinuedPairIdentity} from '../continued_pair/contract.js';
import {freezeGeneration,generationFields} from '../generation_source/identity.js';
import type {ContinuedParticipantIdentity,ContinuedParticipantSelection} from './contract.js';

export const participantFailure=(suffix='integrity')=>new SharedEditorError(
 'continued_participant_'+suffix,'Select the exact continued participant, paired histories, and upload archive',
);
export const participantDigest=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function continuedParticipantIdentity(input:unknown):ContinuedParticipantIdentity{
 if(!generationFields(input,'assets,participant,principal,source'))throw participantFailure('policy');
 const {assets,participant,principal,source}=input;
 if(assets!=='whole-store'||typeof participant!=='string'||!participant.trim()||
    new TextEncoder().encode(participant).byteLength>200||/[\u0000-\u001f\u007f-\u009f]/u.test(participant)||
    new TextDecoder().decode(new TextEncoder().encode(participant))!==participant)
  throw participantFailure('policy');
 const selected=canonicalContinuedPairIdentity(source as ContinuedPairIdentity);
 if(principal!==selected.review.principal||new TextDecoder().decode(new TextEncoder().encode(selected.review.principal))!==principal)throw participantFailure('policy');
 return freezeGeneration({participant,principal,source:selected,assets});
}
export function continuedParticipantSelection(input:unknown):ContinuedParticipantSelection{
 if(!generationFields(input,'identity,sha256')||!participantDigest(input['sha256']))throw participantFailure('policy');
 return freezeGeneration({identity:continuedParticipantIdentity(input['identity']),sha256:input['sha256']});
}
