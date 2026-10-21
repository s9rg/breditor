/** Exact identity selection is not a permission or a native ownership proof. */
import {SharedEditorError} from '../core.js';
import {canonicalIndependentHistoryIdentity} from '../independent_history/cut.js';
import {generationFields,freezeGeneration} from '../generation_source/identity.js';
import type {SharedIndependentParticipantIdentity,SharedIndependentParticipantSelection} from './contract.js';
export const independentParticipantFailure=(code='independent_participant_format')=>new SharedEditorError(code,'Independent participant bytes require the exact selected two-lane source and complete upload file');
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&!!v.trim()&&new TextEncoder().encode(v).length<=max&&!/[\u0000-\u001f\u007f-\u009f]/u.test(v)&&new TextDecoder('utf-8',{fatal:true}).decode(new TextEncoder().encode(v))===v;
export function independentParticipantIdentity(input:unknown):SharedIndependentParticipantIdentity{
 if(!generationFields(input,'assets,participant,principal,source'))throw independentParticipantFailure();const value=input as unknown as SharedIndependentParticipantIdentity;
 if(!text(value.participant,200)||!text(value.principal,256)||value.assets!=='whole-store')throw independentParticipantFailure();const source=canonicalIndependentHistoryIdentity(value.source);
 if(source.review.principal!==value.principal)throw independentParticipantFailure('independent_participant_policy');
 return freezeGeneration({participant:value.participant,principal:value.principal,source,assets:'whole-store' as const});
}
export function independentParticipantSelection(input:unknown):SharedIndependentParticipantSelection{
 if(!generationFields(input,'identity,sha256'))throw independentParticipantFailure();const value=input as unknown as SharedIndependentParticipantSelection;if(typeof value.sha256!=='string'||! /^[a-f0-9]{64}$/.test(value.sha256))throw independentParticipantFailure();return freezeGeneration({identity:independentParticipantIdentity(value.identity),sha256:value.sha256});
}
