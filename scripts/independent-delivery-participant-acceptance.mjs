/** Shared unchanged acceptance driver for source and fresh installed packages. */
import assert from 'node:assert/strict';
import {probeIndependentDeliveryParticipant} from './probe-independent-delivery-participant.mjs';
import {probeIndependentRelay} from './probe-independent-relay.mjs';
import {probeSegmentedRetained} from './probe-segmented-retained.mjs';
import {probeSegmentedObserver} from './probe-segmented-observer.mjs';
export async function independentDeliveryParticipantAcceptance({api,rich,runtime,fixture,sdkModule,relayHost,revisionHost,participantRecovery=false}){
 const local=await probeIndependentDeliveryParticipant({api,rich,runtime,fixture,participantRecovery}),authors=await probeIndependentRelay(runtime,relayHost,{sdkModule,participantRoundTrip:true,participantRecovery}),advanced=[],observers=[];
 for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true]){const independentDelivery={documentSegmented,reviewSegmented};advanced.push(await probeSegmentedRetained(runtime,revisionHost,{sdkModule,independentDelivery,participantRoundTrip:true,participantRecovery}));observers.push(await probeSegmentedObserver(runtime,revisionHost,{sdkModule,independentDelivery,participantRoundTrip:true,participantRecovery}));}
 for(const[key,value]of Object.entries({passed:true,cases:40,coldReopens:120,participantRestores:40,wholeUploadComparisons:40,offlineReconnects:40,retainedReceipts:160,acknowledgementSaveRefusals:2,serverRollbackRefusals:2,futureHistorySteps:80,futureReviewSteps:80}))assert.equal(authors[key],value,key);
 for(const row of advanced)for(const[key,value]of Object.entries({passed:true,cases:6,coldReopens:18,participantRestores:12,wholeUploadComparisons:12,ownedAccepts:6,publishedVersions:6,futureHistorySteps:18,futureReviewSteps:12,hostRestarts:6,receiptSaveFailures:1}))assert.equal(row[key],value,key);
 for(const row of observers)for(const[key,value]of Object.entries({passed:true,cases:6,readers:12,coldReopens:24,participantRestores:12,wholeUploadComparisons:12,retainedRevisions:12,foreignAcceptImports:12,reviewerRejects:6,hostRestarts:6,sourceSaveFailures:1,editorGrantAcceptRefusals:6,readerAuthorRegistrations:0,readerAuthorResumes:0,readerDocumentSubmissions:0}))assert.equal(row[key],value,key);
 assert.deepEqual(observers.map(row=>row.observerSeals),[0,0,12,12]);assert.deepEqual(advanced.map(row=>row.independentBoundaries),[0,12,12,24]);for(const row of [authors,...advanced,...observers])assert.equal(row.sharedWasmSha256,local.sharedWasmSha256);
 return{format:'breditor/independent-delivery-participant-acceptance',passed:true,local,authors,advanced,observers,scope:'Real native histories/packets and portable selected raster/whole-upload bytes before fresh authenticated author or permanent-observer continuation. Synthetic IDB/locks, raster presentation and host mapping callback. Not physical whole-room adoption, provider-wide durable coordination, activation or platform crash durability.'};
}
