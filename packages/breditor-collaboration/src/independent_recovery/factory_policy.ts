/** Snapshot explicit local native factories before storage or authority awaits.
 * Current access is separate from historical source identity. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import type {SharedIndependentRecoveryFactory} from './contract.js';
import {independentOptionsIdentity} from '../independent_history/identity.js';
import {generationFields} from '../generation_source/identity.js';
import {independentRecoveryFields,independentRecoveryFailure as fail} from './policy.js';
const missing=()=>{throw fail('independent_recovery_missing');};
export function snapshotIndependentRecoveryFactory<P extends SharedSelectionPolicy>(expected:SharedIndependentParticipantSelection,provided:SharedIndependentRecoveryFactory<P>):SharedIndependentRecoveryFactory<P>{
 if(!provided||typeof provided!=='object')throw fail('independent_recovery_policy');const o={...provided};
 independentRecoveryFields(o,['room','writer','richLanguage','history','rangeEditing','selectionEditing','searchHistory','reviewedHistory','readOnly','review','documentHistory','reviewHistory'],['editor','onError','onState']);
 const review={...o.review},dh={...o.documentHistory},rh={...o.reviewHistory};
 if(o.readOnly!==true||!generationFields(review,'access,actor,principal')||review.access!=='read_only'||!['original','segmented-v1'].includes(dh.kind)||!['original','segmented-v1'].includes(rh.kind)||!generationFields(dh,dh.kind==='original'?'kind,restoreOriginal':'initialGenerations,kind,restoreSegmented')||!generationFields(rh,rh.kind==='original'?'kind':'initialGenerations,kind')||typeof(dh.kind==='original'?dh.restoreOriginal:dh.restoreSegmented)!=='function')throw fail('independent_recovery_policy');
 const documentHistory=dh.kind==='original'?dh:{...dh,initialGenerations:{...dh.initialGenerations}},reviewHistory=rh.kind==='original'?rh:{...rh,initialGenerations:{...rh.initialGenerations}};
 if(documentHistory.kind==='segmented-v1'&&!generationFields(documentHistory.initialGenerations,'active,root')||reviewHistory.kind==='segmented-v1'&&!generationFields(reviewHistory.initialGenerations,'active,root'))throw fail('independent_recovery_policy');
 const selected={...o,review,documentHistory,reviewHistory,...(o.editor?{editor:{...o.editor}}:{})},identity=independentOptionsIdentity({...selected,database:'identity-only',create:missing});if(JSON.stringify(identity)!==JSON.stringify(expected.identity.source))throw fail('independent_recovery_policy');return{...selected,...structuredClone(identity.native),selectionEditing:o.selectionEditing};
}
