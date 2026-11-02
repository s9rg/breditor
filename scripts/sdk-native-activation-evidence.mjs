/** Require genuine native activation, full actual intent bytes, ordinary cold
 * delivery and exact future history evidence. No generic green test count suffices. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const parse=(log,marker)=>[...log.matchAll(new RegExp('^# '+marker+' (\\{[^\\n]+\\})$','gm'))].map(row=>JSON.parse(row[1]));
function exact(file,pin){const bytes=readFileSync(file);if(pin.bytes!==undefined)assert.equal(bytes.length,pin.bytes);assert.equal(sha(bytes),pin.sha256);return bytes;}
export function checkSdkNativeActivationEvidence(log){
 const rows=parse(log,'SDK_NATIVE_ACTIVATION_NATIVE');assert.equal(rows.length,1);const row=rows[0];
 assert.equal(row.participants,7);assert.equal(row.metadataSources,3);assert.equal(row.retainedOfflineLanes,14);assert.equal(row.actualCommitRequests,3);assert.equal(row.cacheCalls,0);assert.equal(row.originalPending,'pending');assert.equal(row.wholeRoomActivated,false);
 for(const name of ['preparedBeforeRequests','fullIntentReadback','lostActualCommitReplyRemainedUnknown','approvalRefusalWithoutRequest','exactNativeReceipt','repeatReceiptUnchanged','actualNativeServiceResumed','actualDurableEpochObserved','nativeStampsUnchanged','metadataUnchanged'])assert.equal(row[name],true,name);
 exact(row.file,row);const native=JSON.parse(exact(row.nativeObservation.file,row.nativeObservation));assert.equal(native.actualNativeServiceRouterReturned,true);assert.equal(native.wholeRoomActivated,false);
 const index=JSON.parse(exact(join(row.disk.directory,'index.json'),{sha256:row.disk.indexSha256}));assert.equal(index.format,'breditor/actual-sdk-native-activation-intent-evidence');assert.equal(index.formatVersion,1);assert.equal(index.files.length,row.disk.completeObjects+3);assert.equal(row.disk.files,index.files.length+1);
 for(const pin of index.files){assert.match(pin.name,/^(?:choice\.json|graph\.json|state\.json|[a-f0-9]{64}\.bin)$/);exact(join(row.disk.directory,pin.name),pin);}
 const choice=JSON.parse(readFileSync(join(row.disk.directory,'choice.json'),'utf8')),state=JSON.parse(readFileSync(join(row.disk.directory,'state.json'),'utf8'));
 assert.equal(sha(JSON.stringify(choice)),row.choiceSha256);assert.equal(choice.graph.sha256,row.disk.graphSha256);assert.equal(choice.totalBytes,row.disk.totalBytes);assert.equal(choice.objects.length,row.disk.completeObjects);assert.equal(state.phase,'receipt-observed');assert.deepEqual(state.receipt.selection,choice.activation);assert.deepEqual(native.choice,choice.activation);assert.deepEqual(native.actualDeployment,choice.activation.planned);assert.equal(BigInt(native.actualDeployment.generation),BigInt(choice.activation.previous.generation)+1n);
 for(const pin of choice.objects)exact(join(row.disk.directory,pin.sha256+'.bin'),pin);exact(join(row.disk.directory,'graph.json'),choice.graph);
 const cold=parse(log,'COLD_CURRENT_RECONCILIATION_NATIVE');assert.equal(cold.length,1);const end=cold[0];
 for(const [name,value] of Object.entries({nativeParticipants:7,freshNativeOwners:7,retainedRealUploadAcks:3,retainedOfflineLanes:14,authenticatedDeliveryPasses:2,originalVersionCachesStillPending:true,forbiddenBodyDownloads:0,actualCacheCalls:0,originalMetadataUnchanged:true,wholeRoomActivated:false,exactFutureDocumentAndCommentRestored:true}))assert.equal(end[name],value,name);
 for(const pin of end.files)exact(join(end.directory,pin.name),pin);
 const histories=parse(log,'INDEPENDENT_FUTURE_NATIVE_HISTORIES');assert.equal(histories.length,2);
 for(const item of histories){assert.equal(item.participants,7);assert.equal(item.rows.length,7);assert.equal(new Set(item.rows.map(row=>row.id)).size,7);for(const row of item.rows){assert.equal(row.exactFutureDocumentRestored,true);assert.equal(row.exactFutureCommentViewRestored,true);assert.match(row.documentSha256,/^[a-f0-9]{64}$/);assert.match(row.reviewViewSha256,/^[a-f0-9]{64}$/);}}
 return {activation:row,cold:end,histories};
}
