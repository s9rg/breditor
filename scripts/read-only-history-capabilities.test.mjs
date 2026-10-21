/** Partial new capabilities cannot relabel old native owners or grant edit permission. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {SharedRichEditor} from '../packages/breditor-collaboration/dist/index.js';
const runtime=process.env.BREDITOR_READ_ONLY_TEST_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;
let native,profile,document;
before(async()=>{
 native=await import(pathToFileURL(runtime+'/breditor_shared.js').href);await native.default({module_or_path:readFileSync(runtime+'/breditor_shared_bg.wasm')});
 profile=native.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:3,schema:{name:'example/read-only-capability-contract',version:1},extensions:[]}));const descriptor=JSON.parse(profile.descriptor_json());
 document=JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:{kind:'element',type:'breditor/document',entityId:null,properties:{'breditor/document-id':'room'},children:[{kind:'element',type:'breditor/paragraph',entityId:null,properties:{'breditor/block-id':'p'},children:[{kind:'text',text:'seed',formats:[]}]}]}});
});
after(()=>profile?.free());
const insert=core=>core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'Retained '}}]});
const variations=[['read_only_history_lifecycle_version',undefined],['enable_read_only_segmented_history',undefined],['seal_read_only_history_segment',undefined],['read_only_history_lifecycle_version',()=> '2'],['read_only_history_lifecycle_version',()=> 1]];

test('missing or future read-only capability sets never enable a family and original editing remains available',()=>{
 for(const [name,replacement]of variations){
  const raw=profile.create(document,'101'),core=new SharedRichEditor(raw);try{
   assert.equal(core.supportsReadOnlyHistoryLifecycle(),true);core.setReadOnly(true);const before=core.checkpointJson();raw[name]=replacement;
   assert.equal(core.supportsReadOnlyHistoryLifecycle(),false);assert.throws(()=>core.enableReadOnlySegmentedHistory('root','active'),error=>error.code==='read_only_history_unavailable');assert.equal(core.segmentedHistoryPolicy(),null);assert.equal(core.checkpointJson(),before);assert.equal(core.view().readOnly,true);
   core.setReadOnly(false);insert(core);assert.ok(core.documentJson().includes('Retained'));
  }finally{core.dispose();}
 }
});

test('partial sealing capabilities retain the active native files and strict observer author-prefix checks',()=>{
 for(const [name,replacement]of variations){
  const raw=profile.create(document,'101'),core=new SharedRichEditor(raw);try{
   core.setReadOnly(true);core.enableReadOnlySegmentedHistory('root','active');core.setReadOnly(false);insert(core);core.setReadOnly(true);const before=core.checkpointJson();raw[name]=replacement;
   assert.equal(core.supportsReadOnlyHistoryLifecycle(),false);assert.throws(()=>core.sealReadOnlyHistoryGeneration('next'),error=>error.code==='read_only_history_unavailable');assert.equal(core.checkpointJson(),before);assert.equal(core.view().readOnly,true);
   assert.throws(()=>core.sealObserverHistoryGeneration('next'));assert.equal(core.checkpointJson(),before);delete raw[name];assert.equal(core.supportsReadOnlyHistoryLifecycle(),true);core.sealReadOnlyHistoryGeneration('next');assert.equal(core.view().readOnly,true);assert.throws(()=>insert(core),/read-only/);
  }finally{core.dispose();}
 }
});

test('original pinned storage cannot silently migrate and writable policy is not read-only archival authority',()=>{
 for(const sealed of [false,true]){
  const raw=profile.create(document,'101'),core=new SharedRichEditor(raw);try{
   if(sealed){core.sealHistoryPolicy('explicit');core.setReadOnly(true);}const before=core.checkpointJson();
   if(sealed)assert.throws(()=>core.enableReadOnlySegmentedHistory('root','active'),error=>error.code==='segmented_storage_required');
   else assert.throws(()=>core.enableReadOnlySegmentedHistory('root','active'),/read-only/);
   assert.equal(core.segmentedHistoryPolicy(),null);assert.equal(core.checkpointJson(),before);assert.equal(core.view().readOnly,sealed?true:undefined);
  }finally{core.dispose();}
 }
});
