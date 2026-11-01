/** Component fault injections use copies of actual admitted records and real
 * Native packets. They construct no client owner, server receipt or authority. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {OriginalReceiptComparison} from '../../../packages/breditor-collaboration/dist/metadata_receipt_containment/compare.js';
import {withCheckedServerMetadataCatalog} from '../../../packages/breditor-collaboration/dist/server_metadata_read/collect.js';
const sha=value=>createHash('sha256').update(value).digest('hex');
const copy=structuredClone;
export async function testOriginalReceiptComparison({contained,lane,core,check}){
 const original=lane.records;
 const page=contained.catalog.pages[0].metadata,terminal=contained.catalog.terminal;
 const empty=()=>({versions:null,suggestions:null,revisions:null}),cases=[];
 await withCheckedServerMetadataCatalog(contained.catalog,async index=>{
  const run=(records,view=index,limit=terminal)=>{const comparison=new OriginalReceiptComparison(view,page,limit,original.versions.identity.room,check);comparison.inspect(lane.id,'controlled-component-record-copy',core,records);return comparison.result();};
  const version=original.versions.packets.find(row=>row.accepted);assert.ok(version);assert.ok(original.versions.catalog);
  const info=core.readVersion(version.packet),variant=JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(version.packet)).reverse()),null,2);
  assert.notEqual(variant,version.packet);assert.equal(core.readVersion(variant).id,info.id);
  assert.notEqual(sha(variant),sha(version.packet));
  const serverFingerprint=index.fingerprints.versions.find(row=>row.id===info.id);assert.ok(serverFingerprint);assert.notEqual(serverFingerprint.sha256,'sha256:'+sha(variant));
  const variants=empty();variants.versions=copy(original.versions);variants.versions.packets=[{...copy(version),packet:variant}];
  const publicRead=core.readVersion;core.readVersion=()=>{throw Error('Public packet reader shadow is not Native identity');};
  try{assert.deepEqual(run(variants).pending,[]);}finally{delete core.readVersion;assert.equal(core.readVersion,publicRead);}
  cases.push('Native-valid-byte-variant-retains-actual-original-receipt-and-ignores-public-reader-shadow');
  const cached=empty();cached.versions=copy(original.versions);cached.versions.packets=[];assert.deepEqual(run(cached).pending,[]);
  assert.ok(run(cached,{...index,versions:[]}).pending.some(row=>row.receipt==='catalog-version'&&row.relation==='missing'));
  cases.push('cached-original-catalog-receipts-checked-without-packet-rows');
  const missing=run(variants,{...index,versions:index.versions.filter(row=>row.version.id!==info.id)});assert.ok(missing.pending.some(row=>row.receipt==='version'&&row.id===info.id&&row.relation==='missing'));
  cases.push('missing-original-version-receipt');
  const changed=copy(variants);changed.versions.packets[0].accepted.sequence=String(BigInt(version.accepted.sequence)+1n);
  assert.ok(run(changed).pending.some(row=>row.receipt==='version'&&row.relation==='different'));cases.push('different-original-version-sequence');
  changed.versions.packets[0].accepted.version.name+=' changed';assert.throws(()=>run(changed),error=>error.code==='metadata_receipt_source');cases.push('packet-and-original-version-info-mismatch-refused');
  const behind=run(cached,index,{...terminal,versions:{...terminal.versions,through:'0'}});assert.ok(behind.pending.some(row=>row.receipt==='versions-cursor'&&row.relation==='server-behind'));cases.push('cached-cursor-server-rollback');
  const bound=copy(cached);bound.versions.identity.binding='0'.repeat(64);assert.throws(()=>run(bound),error=>error.code==='metadata_receipt_binding');cases.push('different-server-binding-refused');
  assert.ok(original.suggestions.retained.some(row=>row.publication));assert.ok(original.suggestions.retained.some(row=>row.decision));
  const proposals=empty();proposals.suggestions=copy(original.suggestions);
  assert.ok(run(proposals,{...index,publications:[]}).pending.some(row=>row.receipt==='publication'&&row.relation==='missing'));cases.push('missing-original-publication');
  assert.ok(run(proposals,{...index,decisions:[]}).pending.some(row=>row.receipt==='decision'&&row.relation==='missing'));cases.push('missing-original-final-decision');
  const revisions=empty();revisions.revisions=copy(original.revisions);const accepted=original.revisions.retained.find(row=>row.receipt);assert.ok(accepted);
  assert.ok(run(revisions,{...index,revisions:[]}).pending.some(row=>row.receipt==='revision'&&row.relation==='missing'));cases.push('missing-original-revision-receipt');
  const competing=core.captureSuggestionRevision(accepted.previousPacket,'Actual competing immutable proposal for receipt comparison','999',{scope:'commands',edit:{kind:'commands',data:[{kind:'insert_text',data:{block:'p',offset:0,text:'Competing proposal only '}}]}});
  assert.notEqual(core.readSuggestionRevision(accepted.previousPacket,competing).id,accepted.receipt.revision.id);
  const conflicts=empty();conflicts.revisions=copy(original.revisions);conflicts.revisions.retained=[{...copy(accepted),packet:competing,retry:false,receipt:null,conflict:{decision:accepted.receipt.previousDecision,successor:accepted.receipt}}];
  assert.deepEqual(run(conflicts).pending,[]);assert.equal(run(conflicts).points[0].matched,2);cases.push('actual-final-decision-and-different-committed-successor');
  const absent=run(conflicts,{...index,decisions:[],revisions:[]});assert.ok(absent.pending.some(row=>row.receipt==='conflict-decision'&&row.relation==='missing'));assert.ok(absent.pending.some(row=>row.receipt==='conflict-successor'&&row.relation==='missing'));cases.push('missing-original-conflict-decision-and-successor');
 });
 console.log('RECEIPT_COMPARISON_NATIVE '+JSON.stringify({cases,nativePacketVariant:true,actualServerAcknowledgements:true,componentCopiesOnly:true}));
 return cases;
}
