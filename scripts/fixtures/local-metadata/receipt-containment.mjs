/** Genuine seven-family workflow. The negative case corrupts only a returned
 * transport page; the Native server and original client ACKs remain authentic. */
import assert from 'node:assert/strict';
import {testOriginalReceiptComparison} from './receipt-comparison.mjs';
import {omitFirstOriginalVersion} from './receipt-omission.mjs';
import {coreReadStamp} from '../../../packages/breditor-collaboration/dist/core_read_stamp.js';
import {writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function testReceiptContainment({scope,sources,metadata,fresh,host,oldMetadata,oldMetadataText,check}){
 let phase='family-aware Native stamps';
 try{
 const before=new Map(sources.map(row=>[row.id,coreReadStamp(row.source.core)])),beforeLanes=metadata.recovery().current.lanes;
 const assertNativeUnchanged=()=>{for(const row of sources){const actual=coreReadStamp(row.source.core),previous=before.get(row.id);assert.equal(actual.document,previous.document,row.id+' document mutation stamp');assert.equal(actual.review,previous.review,row.id+' review mutation stamp');}};
 const input={host:fresh.previous,inventory:fresh.inventory};
 await assert.rejects(metadata.captureReceiptContainment({...input,extra:true}));
 await assert.rejects(metadata.captureReceiptContainment({...input,host:{...fresh.previous}}));
 const publicPrototype=Object.getPrototypeOf(fresh.previous),publicRead=publicPrototype.readMetadata;
 let contained;
 try{
  publicPrototype.readMetadata=()=>{throw Error('Public shadow must not replace the actual held host port');};
  phase='actual all-family receipt capture';console.log('RECEIPT_CONTAINMENT_STEP capture-all-family-original-receipts');
  contained=await metadata.captureReceiptContainment(input);
 }finally{publicPrototype.readMetadata=publicRead;assert.equal(fresh.previous.readMetadata,publicRead);}
 assert.equal(contained.kind,'contained',JSON.stringify(contained.pending));
 assert.equal(contained.reconciliation.kind,'checked');assert.equal(contained.reconciliation.legacy.kind,'pending');
 assert.deepEqual(contained.pending,[]);
 assert.deepEqual([...new Set(contained.points.map(row=>row.participant))].sort(),sources.map(row=>row.id).sort());
 assert.ok(contained.points.reduce((n,row)=>n+row.examined,0)>0);
 assert.ok(contained.points.every(row=>row.examined===row.matched));
 for(const row of sources){
  const points=contained.points.filter(point=>point.participant===row.id).map(point=>point.point);
  if(row.family==='original')assert.ok(points.includes('operation-origin'));
  if(row.family==='generation')for(const name of ['committed','live','recovery-origin','operation-origin'])assert.ok(points.includes(name),row.id+':'+name);
  if(['independent-delivery','restored-graph'].includes(row.family)){assert.ok(points.includes('source-origin'));assert.ok(points.includes('current'));assert.ok(points.includes('live'));}
  if(row.family==='restored-graph')assert.ok(points.some(name=>name.startsWith('parent-input:')));
  if(['independent-local','local-operation-snapshot','local-operation-flat'].includes(row.family)){assert.ok(points.includes('local-before'));assert.ok(points.includes('local-current'));}
 }
 assert.ok(Object.isFrozen(contained));assert.ok(Object.isFrozen(contained.points));
 assertNativeUnchanged();assert.deepEqual(metadata.recovery().current.lanes,beforeLanes);
 assert.equal(await oldMetadata.metadata.file.text(),oldMetadataText);
 phase='focused original-fact comparison cases';
 const comparisonCases=await testOriginalReceiptComparison({contained,lane:metadata.recovery().current.lanes[0],core:sources.find(row=>row.id===metadata.recovery().current.lanes[0].id).source.core,check});
 assertNativeUnchanged();
 console.log('RECEIPT_CONTAINMENT_STEP actual-seven-families-original-saved-cuts-contained');
 const fetchOriginal=globalThis.fetch;let omittedId,alteredPages=0;
 globalThis.fetch=async(url,options)=>{
  const response=await fetchOriginal(url,options);
  if(!String(url).endsWith('/metadata/read')||!response.ok)return response;
  const omitted=await omitFirstOriginalVersion(response);omittedId=omitted.id;alteredPages++;return omitted.response;
 };
 let absent;phase='controlled omitted-receipt response';
 try{absent=await metadata.captureReceiptContainment(input);}finally{globalThis.fetch=fetchOriginal;}
 assert.ok(alteredPages>0);assert.equal(absent.kind,'pending');
 assert.equal(absent.reconciliation.kind,'checked','Outbox status alone must not bless a missing historical server receipt');
 assert.ok(absent.pending.some(row=>row.id===omittedId&&row.relation==='missing'&&['version','catalog-version'].includes(row.receipt)),JSON.stringify(absent.pending));
 assertNativeUnchanged();assert.deepEqual(metadata.recovery().current.lanes,beforeLanes);
 assert.equal(await oldMetadata.metadata.file.text(),oldMetadataText);check();scope.check();
 const report={format:'breditor/original-receipt-containment-native-observation',formatVersion:1,nativeParticipants:7,actualReceipts:true,comparisonCases,points:contained.points,containedKind:contained.kind,legacyKind:contained.reconciliation.legacy.kind,omission:{controlledTransportCorruption:true,id:omittedId,pages:alteredPages,kind:absent.kind,pending:absent.pending,oldReconciliationKind:absent.reconciliation.kind},nativeHistoriesUnchanged:true,originalReceiptRowsUnchanged:true,oldMetadataFileUnchanged:true,publicHostShadowIgnored:true,wholeRoomActivated:false};
 const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n'),file=join(host.directory,'original-receipt-containment.json');
 writeFileSync(file,bytes,{flag:'wx',mode:0o600});assert.deepEqual(readFileSync(file),bytes);
 console.log('RECEIPT_CONTAINMENT_NATIVE '+JSON.stringify({file,bytes:bytes.length,sha256:sha(bytes),participants:7,examined:contained.points.reduce((n,row)=>n+row.examined,0),missing:absent.pending.length}));
 }catch(error){throw new Error('Receipt containment phase '+phase+': '+String(error),{cause:error});}
}
