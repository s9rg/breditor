/** Exact identity selection is not a permission or a native ownership proof. */
import {SharedEditorError} from '../core.js';
import {readIndependentDeliveryIdentity} from '../independent_delivery/identity.js';
import {generationFields,freezeGeneration} from '../generation_source/identity.js';
import type {SharedIndependentDeliveryParticipantIdentity,SharedIndependentDeliveryParticipantSelection} from './contract.js';
export const independentDeliveryParticipantFailure=(code='independent_delivery_participant_format')=>new SharedEditorError(code,'Independent participant bytes require the exact complete native histories, delivery records and whole upload file');
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&!!v.trim()&&new TextEncoder().encode(v).length<=max&&!/[\u0000-\u001f\u007f-\u009f]/u.test(v)&&new TextDecoder('utf-8',{fatal:true}).decode(new TextEncoder().encode(v))===v;
export function independentDeliveryParticipantIdentity(input:unknown):SharedIndependentDeliveryParticipantIdentity{
 if(!generationFields(input,'assets,participant,principal,source'))throw independentDeliveryParticipantFailure();const value=input as unknown as SharedIndependentDeliveryParticipantIdentity;
 if(!text(value.participant,200)||!text(value.principal,256)||value.assets!=='whole-store')throw independentDeliveryParticipantFailure();const source=readIndependentDeliveryIdentity(value.source);
 if(source.history.review.principal!==value.principal)throw independentDeliveryParticipantFailure('independent_delivery_participant_policy');
 return freezeGeneration({participant:value.participant,principal:value.principal,source,assets:'whole-store' as const});
}
export function independentDeliveryParticipantSelection(input:unknown):SharedIndependentDeliveryParticipantSelection{
 if(!generationFields(input,'identity,sha256'))throw independentDeliveryParticipantFailure();const value=input as unknown as SharedIndependentDeliveryParticipantSelection;if(typeof value.sha256!=='string'||! /^[a-f0-9]{64}$/.test(value.sha256))throw independentDeliveryParticipantFailure();return freezeGeneration({identity:independentDeliveryParticipantIdentity(value.identity),sha256:value.sha256});
}
