/** Verify actual intent bytes, HTTP publication, unchanged epoch, original
 * offline delivery and native histories. Green test counts alone are insufficient. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const parse=(log,marker)=>[...log.matchAll(new RegExp('^# '+marker+' (\\{[^\\n]+\\})$','gm'))].map(row=>JSON.parse(row[1]));
function exact(file,pin){const bytes=readFileSync(file);if(pin.bytes!==undefined)assert.equal(bytes.length,pin.bytes);assert.equal(sha(bytes),pin.sha256);return bytes;}
export function checkSdkNativePublicationEvidence(log){
 const rows=parse(log,'SDK_NATIVE_ACTIVATION_NATIVE');assert.equal(rows.length,1);const row=rows[0];assert.equal(row.format,'breditor/sdk-native-publication-observation');assert.equal(row.formatVersion,1);
 for(const [key,value]of Object.entries({participants:7,metadataSources:3,retainedOfflineLanes:14,actualCommitRequests:3,actualPublicationRequests:3,cacheCalls:0,originalPending:'pending',wholeRoomActivated:false}))assert.equal(row[key],value,key);
 for(const name of ['preparedBeforeRequests','fullIntentReadback','lostActualCommitReplyRemainedUnknown','approvalRefusalWithoutRequest','exactNativeReceipt','repeatReceiptUnchanged','actualNativeServiceResumed','actualDurableEpochObserved','nativeStampsUnchanged','metadataUnchanged','lostPublicationReplyRetriedAgainstSameOwner','observerDidNotStartNormalServing'])assert.equal(row[name],true,name);
 exact(row.file,row);const native=JSON.parse(exact(row.nativeObservation.file,row.nativeObservation));assert.equal(native.format,'breditor/sdk-native-publication-observation');assert.equal(native.formatVersion,1);assert.equal(native.normalServingStartedByAuthenticatedHttp,true);assert.equal(native.observerStartedNormalServing,false);assert.equal(native.wholeRoomActivated,false);
 const descriptorBytes=exact(join(dirname(row.file),'sdk-native-publication-independent-descriptor.json'),row.publicationDescriptor),descriptor=JSON.parse(descriptorBytes);assert.equal(descriptor.format,'breditor/test-native-service-publication-association');assert.equal(descriptor.formatVersion,1);
 const receipt=native.receipt;assert.equal(receipt.format,'breditor/native-room-publication-receipt');assert.equal(receipt.formatVersion,1);assert.equal(receipt.scope,'actual-held-native-service-and-bound-listener; joint-association-only');assert.deepEqual(receipt.selection,descriptor.publication);assert.equal(receipt.joint.bytes,descriptorBytes.length);assert.deepEqual(receipt.joint.sha256,[...createHash('sha256').update(descriptorBytes).digest()]);
 const index=JSON.parse(exact(join(row.disk.directory,'index.json'),{sha256:row.disk.indexSha256}));assert.equal(index.format,'breditor/actual-sdk-native-activation-intent-evidence');assert.equal(index.formatVersion,1);assert.equal(index.files.length,row.disk.completeObjects+3);assert.equal(row.disk.files,index.files.length+1);
 for(const pin of index.files){assert.match(pin.name,/^(?:choice\.json|graph\.json|state\.json|[a-f0-9]{64}\.bin)$/);exact(join(row.disk.directory,pin.name),pin);}
 const choice=JSON.parse(readFileSync(join(row.disk.directory,'choice.json'),'utf8')),state=JSON.parse(readFileSync(join(row.disk.directory,'state.json'),'utf8'));
 assert.equal(sha(JSON.stringify(choice)),row.choiceSha256);assert.equal(choice.graph.sha256,row.disk.graphSha256);assert.equal(choice.totalBytes,row.disk.totalBytes);assert.equal(choice.objects.length,row.disk.completeObjects);assert.equal(state.phase,'receipt-observed');assert.deepEqual(state.receipt.selection,choice.activation);assert.deepEqual(choice,descriptor.activation);assert.deepEqual(receipt.selection.activation,choice.activation);assert.deepEqual(native.actualDeployment,choice.activation.planned);assert.equal(BigInt(native.actualDeployment.generation),BigInt(choice.activation.previous.generation)+1n);
 for(const pin of choice.objects)exact(join(row.disk.directory,pin.sha256+'.bin'),pin);exact(join(row.disk.directory,'graph.json'),choice.graph);
 const cold=parse(log,'COLD_CURRENT_RECONCILIATION_NATIVE');assert.equal(cold.length,1);const end=cold[0];
 for(const [name,value]of Object.entries({nativeParticipants:7,freshNativeOwners:7,retainedRealUploadAcks:3,retainedOfflineLanes:14,authenticatedDeliveryPasses:2,originalVersionCachesStillPending:true,forbiddenBodyDownloads:0,actualCacheCalls:0,originalMetadataUnchanged:true,wholeRoomActivated:false,exactFutureDocumentAndCommentRestored:true}))assert.equal(end[name],value,name);
 for(const pin of end.files)exact(join(end.directory,pin.name),pin);
 const histories=parse(log,'INDEPENDENT_FUTURE_NATIVE_HISTORIES');assert.equal(histories.length,2);for(const item of histories){assert.equal(item.participants,7);assert.equal(item.rows.length,7);assert.equal(new Set(item.rows.map(row=>row.id)).size,7);for(const row of item.rows){assert.equal(row.exactFutureDocumentRestored,true);assert.equal(row.exactFutureCommentViewRestored,true);assert.match(row.documentSha256,/^[a-f0-9]{64}$/);assert.match(row.reviewViewSha256,/^[a-f0-9]{64}$/);}}
 return {publication:row,native,cold:end,histories};
}
