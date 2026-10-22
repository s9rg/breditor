/** Snapshot explicit host factories/policy before awaiting; historical identity grants nothing. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliveryOptions} from '../independent_delivery/contract.js';
import {independentOptionsIdentity} from '../independent_history/identity.js';
import {makeIndependentHistoryCut} from '../independent_history/cut.js';
import {IndependentDeliveryCompanion} from '../independent_delivery/companion.js';
import {independentDeliveryIdentity} from '../independent_delivery/identity.js';
import {generationFields,freezeGeneration} from '../generation_source/identity.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {checkAssetBytesSignal} from '../asset_bytes/guards.js';
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {independentDeliveryParticipantSelection} from '../independent_delivery_participant/policy.js';
import {checkIndependentDeliveryRecords} from '../independent_delivery_source/records.js';
import {deliveryRecoveryArchive as archive} from './archive.js';
import {independentDeliveryRecoveryFailure as fail,independentDeliveryRecoveryName as name} from './policy.js';
import type {SharedIndependentDeliveryParticipantResumeOptions,SharedIndependentDeliveryRecoveryFactory} from './contract.js';
import type {IndependentDeliveryRecoveryRecord} from './record.js';
const missing=()=>{throw fail('independent_delivery_recovery_missing');};
export function snapshotIndependentDeliveryRecovery<P extends SharedSelectionPolicy>(provided:SharedIndependentDeliveryParticipantResumeOptions<P>,begin:boolean,requireReadOnly=true){
 if(!provided||typeof provided!=='object'||Object.keys(provided).some(k=>!['database','expected','destinations','session','checkAuthority','signal','limits',...(begin?['backup']:[])].includes(k)))throw fail('independent_delivery_recovery_policy');
 const input={...provided},database=name(input.database),expected=independentDeliveryParticipantSelection(input.expected),d=input.destinations;if(!generationFields(d,'source,uploads'))throw fail('independent_delivery_recovery_policy');const destinations=freezeGeneration({source:name(d.source),uploads:name(d.uploads)});if(new Set([database,...Object.values(destinations)]).size!==3)throw fail('independent_delivery_recovery_policy');
 const o=input.session,required=['room','writer','richLanguage','history','rangeEditing','selectionEditing','searchHistory','reviewedHistory','readOnly','review','documentHistory','reviewHistory','binding','retained'],allowed=[...required,'editor','onError','onState'];
 if(!o||Object.keys(o).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(o,k))||typeof o.readOnly!=='boolean'||!generationFields(o.review,'access,actor,principal')||!['read_only','comment','moderate'].includes(o.review.access)||requireReadOnly&&(o.readOnly!==true||o.review.access!=='read_only'))throw fail('independent_delivery_recovery_policy');
 const dh=o.documentHistory,rh=o.reviewHistory;if(!dh||!rh||!['original','segmented-v1'].includes(dh.kind)||!['original','segmented-v1'].includes(rh.kind)||!generationFields(dh,dh.kind==='original'?'kind,restoreOriginal':'initialGenerations,kind,restoreSegmented')||!generationFields(rh,rh.kind==='original'?'kind':'initialGenerations,kind')||typeof (dh.kind==='original'?dh.restoreOriginal:dh.restoreSegmented)!=='function'||dh.kind==='segmented-v1'&&!generationFields(dh.initialGenerations,'active,root')||rh.kind==='segmented-v1'&&!generationFields(rh.initialGenerations,'active,root'))throw fail('independent_delivery_recovery_policy');
 const identity=independentDeliveryIdentity(independentOptionsIdentity({...o,database:'identity-only',create:missing}),o.binding,o.retained);if(JSON.stringify(identity)!==JSON.stringify(expected.identity.source)||identity.binding.review.reviewEditing==='read_only'&&o.review.access!=='read_only')throw fail('independent_delivery_recovery_policy');
 const session={...o,...structuredClone(identity.history.native),selectionEditing:o.selectionEditing,readOnly:o.readOnly,review:{...o.review},documentHistory:dh.kind==='original'?{...dh}:{...dh,initialGenerations:{...dh.initialGenerations}},reviewHistory:rh.kind==='original'?{...rh}:{...rh,initialGenerations:{...rh.initialGenerations}},binding:structuredClone(identity.binding),retained:structuredClone(identity.retained),...(o.editor?{editor:{...o.editor}}:{})} as unknown as SharedIndependentDeliveryRecoveryFactory<P>;
 const authority=participantAuthority(input.checkAuthority),options={database,expected,destinations,session,checkAuthority:input.checkAuthority,...(input.signal?{signal:input.signal}:{}),limits:checkRichAssetLimits(input.limits)},guard=()=>{checkAssetBytesSignal(options.signal);authority();checkAssetBytesSignal(options.signal);};guard();
 const plan=JSON.stringify({format:'breditor/shared-independent-delivery-participant-plan',formatVersion:1,expected,destinations});if(new TextEncoder().encode(plan).length>128*1024)throw fail('independent_delivery_recovery_policy');
 const record:IndependentDeliveryRecoveryRecord={format:'breditor/shared-independent-delivery-participant-recovery',formatVersion:1,plan,phase:'preparing',source:'reserved',uploads:'reserved'};return{options,guard,record};
}
export async function prepareIndependentDeliveryRecovery<P extends SharedSelectionPolicy>(base:ReturnType<typeof snapshotIndependentDeliveryRecovery<P>>,file:Blob){
 const {options,guard,record}=base;guard();let backup:Awaited<ReturnType<typeof archive.read>>|undefined,complete=false;
 try{backup=await archive.read(file,options.expected,{limits:options.limits,...(options.signal?{signal:options.signal}:{})});guard();const recovery=await checkIndependentDeliveryRecords(options.expected.identity.source,archive.records.call(backup));guard();const factory={...options.session,database:options.destinations.source,create:missing} as SharedIndependentDeliveryOptions<P>,companion=new IndependentDeliveryCompanion(factory,recovery),native=await makeIndependentHistoryCut(recovery.source.documentCheckpoint,recovery.source.reviewCheckpoint,recovery.source.identity,recovery.source.versions);guard();const cut={head:companion.wrap(JSON.parse(native.head),companion.capture()),files:native.files};complete=true;return{options,guard,record,backup,recovery,cut,companion,factory};}
 finally{if(!complete&&backup)archive.dispose.call(backup);}
}
export type PreparedIndependentDeliveryRecovery<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Awaited<ReturnType<typeof prepareIndependentDeliveryRecovery<P>>>;
