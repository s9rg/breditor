/** One acceptance driver shared unchanged by source and fresh installed public packages. */
import assert from 'node:assert/strict';
import {probeIndependentDelivery} from './probe-independent-delivery.mjs';
import {probeIndependentRelay} from './probe-independent-relay.mjs';
import {probeSegmentedRetained} from './probe-segmented-retained.mjs';
import {probeSegmentedObserver} from './probe-segmented-observer.mjs';

export async function independentDeliveryAcceptance({api,sdkModule,runtime,relayHost,revisionHost}){
 const local=await probeIndependentDelivery({api,runtime}),authors=await probeIndependentRelay(runtime,relayHost,{sdkModule}),advanced=[],observers=[];
 for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true]){
  const independentDelivery={documentSegmented,reviewSegmented};
  advanced.push(await probeSegmentedRetained(runtime,revisionHost,{sdkModule,independentDelivery}));
  observers.push(await probeSegmentedObserver(runtime,revisionHost,{sdkModule,independentDelivery}));
 }
 for(const[key,value]of Object.entries({passed:true,cases:40,coldReopens:120,offlineReconnects:40,retainedReceipts:160,oldAdapterRefusals:120,acknowledgementSaveRefusals:2,serverRollbackRefusals:2,futureHistorySteps:80,futureReviewSteps:80,independentBoundaries:80}))assert.equal(authors[key],value,key);
 for(const row of advanced)for(const[key,value]of Object.entries({passed:true,cases:6,coldReopens:18,ownedAccepts:6,publishedVersions:6,futureHistorySteps:18,futureReviewSteps:12,hostRestarts:6,receiptSaveFailures:1}))assert.equal(row[key],value,key);
 for(const row of observers)for(const[key,value]of Object.entries({passed:true,cases:6,readers:12,coldReopens:24,retainedRevisions:12,foreignAcceptImports:12,reviewerRejects:6,hostRestarts:6,sourceSaveFailures:1,editorGrantAcceptRefusals:6,readerAuthorRegistrations:0,readerAuthorResumes:0,readerDocumentSubmissions:0}))assert.equal(row[key],value,key);
 assert.deepEqual(observers.map(row=>row.observerSeals),[0,0,12,12]);assert.deepEqual(advanced.map(row=>row.independentBoundaries),[0,12,12,24]);
 for(const row of [authors,...advanced,...observers])assert.equal(row.sharedWasmSha256,local.sharedWasmSha256);
 return{format:'breditor/independent-delivery-acceptance',passed:true,local,authors,advanced,observers,scope:'Exact public implementation and native functional assertions. Storage/locks/fault injection are synthetic. The loopback hosts provide real authenticated server order. Not platform durability, physical independent room/asset adoption, independent server-log generations or V1 approval.'};
}
