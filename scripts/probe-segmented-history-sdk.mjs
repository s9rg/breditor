/** Actual shared Wasm and SDK with isolated synthetic IndexedDB/Web Locks; no physical/storage-durability claim. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
import {SharedRichEditor,createSharedDocumentEditor,SharedSegmentedPersistentSession,SharedPersistentSession,restoreSharedSegmentedEditor} from '../packages/breditor-collaboration/dist/index.js';
const fixture=new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url);
// Independent fixture inspection uses browser storage, not production-private module imports.
function openSegmentedDatabase(name){return new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function readSegmentedCut(db,key){return new Promise((resolve,reject)=>{
 const tx=db.transaction(['generation_files','generation_heads'],'readonly'),r=tx.objectStore('generation_heads').get(key);let h,files=[];
 r.onsuccess=()=>{h=JSON.parse(r.result);for(const ref of [h.root,...h.sealed]){const q=tx.objectStore('generation_files').get([...key,ref.generation]);q.onsuccess=()=>files.push(JSON.parse(q.result));}};
 tx.oncomplete=()=>resolve({files,checkpoint:JSON.stringify({format:'breditor/shared-segmented-history-session',formatVersion:1,family:h.family,rootGeneration:files[0].generation,rootCheckpoint:files[0].json,sealed:files.slice(1).map(f=>f.json),active:h.active})});tx.onabort=()=>reject(tx.error);
});}
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const reviewed={binding:'a'.repeat(64),principal:'alice',effectWriter:'900'};
const review={actor:'generation-review',principal:'alice',access:'comment'};
function locks(){const held=new Set();return {held,request(name,options,callback){assert.deepEqual(options,{mode:'exclusive',ifAvailable:true});return Promise.resolve().then(async()=>{if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}});}};}
const insert=(core,text)=>core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text}}]});
const optionsFor=(profile,document,{database,version,scope,mask,paired,writer='101'})=>({database,room:'room',writer,richLanguage:version,history:mask&1?'typing-v1':'explicit',rangeEditing:scope?'general-v1':'original',selectionEditing:scope===2?'document-v1':'original',searchHistory:mask&4?'search-v1':null,reviewedHistory:mask&2?reviewed:null,readOnly:false,initialGenerations:{root:'gen-root',active:'gen-1'},...(paired?{review}:{}),create:()=>profile.create(document,writer),restoreSegmented:json=>restoreSharedSegmentedEditor(profile,'room',json),onError:()=>{}});
function twin(profile,session,options){const raw=restoreSharedSegmentedEditor(profile,'room',session.core.checkpointJson()),o={segmentedHistory:'segmented-v1',...(options.searchHistory?{searchHistory:options.searchHistory}:{}),...(options.reviewedHistory?{reviewedHistory:options.reviewedHistory}:{})};const core=options.selectionEditing==='document-v1'?createSharedDocumentEditor(raw,o):new SharedRichEditor(raw,o);if(options.review)core.enableReview(options.review,session.core.reviewCheckpoint());return core;}
const pair=(core,paired)=>[core.checkpointJson(),paired?core.reviewCheckpoint():null];
export async function probeSegmentedHistorySdk(directory,{smoke=false}={}){
 const globals=new Map(['indexedDB','navigator'].map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)])),host=locks();
 Object.defineProperty(globalThis,'indexedDB',{value:new IDBFactory(),configurable:true});Object.defineProperty(globalThis,'navigator',{value:{locks:host},configurable:true});
 const bytes=readFileSync(resolve(directory,'breditor_shared_bg.wasm')),wasm=await import(pathToFileURL(resolve(directory,'breditor_shared.js')));await wasm.default({module_or_path:bytes});
 let cases=0,pairedCases=0,exactColdRestores=0,exactFuturePairs=0,oldFamilyRefusals=0,readonlyReopens=0,retainedVersions=0;
 const versions=smoke?[3]:[1,2,3],presets=smoke?[true]:[false,true],scopes=smoke?[2]:[0,1,2],masks=smoke?[7]:[0,1,2,3,4,5,6,7];
 try{
  for(const version of versions)for(const standard of presets){
   const factory=version===1?(standard?'from_standard_configuration_json_v1':'from_configuration_json'):(standard?'from_standard_configuration_json_v':'from_configuration_json_v')+version;
   const profile=wasm.SharedRichProfile[factory](JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:version,schema:{name:'example/segmented-sdk',version:1},extensions:[]}));
   try{const d=JSON.parse(profile.descriptor_json()),document=JSON.stringify({format:'breditor/document',formatVersion:2,schema:d.schema,schemaFingerprint:d.schemaFingerprint,root:canonical(JSON.parse(readFileSync(fixture,'utf8')))});
    for(const scope of scopes)for(const mask of masks)for(const paired of mask&2?[true]:[false,true]){
     const writer=!smoke&&version===1&&!standard&&scope===0&&mask===0&&!paired?'18446744073709551614':'101';
     const options=optionsFor(profile,document,{database:`segmented-${version}-${standard}-${scope}-${mask}-${paired}`,version,scope,mask,paired,writer});
     let session=await SharedSegmentedPersistentSession.open(options),db,oracle,peer;
     try{
      assert.equal(session.recovered,false);assert.equal(session.core.segmentedHistoryPolicy(),'segmented-v1');assert.equal(session.core.supportsRecoveryOrigin(),false);
      await assert.rejects(SharedSegmentedPersistentSession.open({...options,database:options.database+'-competing'}),/already active/);
      db=await openSegmentedDatabase(options.database);const original=JSON.parse(session.core.checkpointJson()).rootCheckpoint;
      if(paired){const anchor=session.core.captureReviewAnchor({kind:'selection',selection:{kind:'node',block:'p'}});assert.equal(session.core.dispatchReview({kind:'create_thread',data:{anchorJson:anchor,body:'Retained comment'}}).kind,'committed');const info=session.saveVersion('Before generation','1792450000000');assert.ok(session.versionPacket(info.id));retainedVersions++;}
      insert(session.core,'first ');insert(session.core,'redo ');assert.equal(session.core.undo(),true);
      await session.sealGeneration('gen-2');const saved=pair(session.core,paired);assert.equal(session.core.view().redoDepth,1);await session.close();
      session=await SharedSegmentedPersistentSession.open(options);assert.deepEqual(pair(session.core,paired),saved);assert.equal(session.core.view().redoDepth,1);exactColdRestores++;
      assert.equal(session.core.redo(),true);assert.equal(session.core.undo(),true);
      peer=new SharedRichEditor(profile.join_frame('room','202',session.core.updateFrame()));insert(peer,'peer ');insert(session.core,'offline ');await session.core.receiveFrame(peer.updateFrame());peer.dispose();peer=undefined;
      if(version===3){session.core.dispatch({commands:[{kind:'set_heading',data:{block:'p',level:3}},{kind:'set_image_alt',data:{block:'image-block',text:'Generation image',decorative:false}}]});}
      if(mask&4){const result=session.core.findText({pattern:'offline',mode:'literal',caseSensitive:true,wholeWords:false});assert.equal(result.metadata().count,'1');session.core.replaceSearchAll(result,{text:'retained',mode:'literal'});result.dispose();}
      await session.sealGeneration('gen-3');const info=session.core.segmentedHistoryInfo();assert.equal(info.sealedGenerations,3);assert.ok(Object.isFrozen(info));
      const stored=await readSegmentedCut(db,['room',writer]);assert.equal(stored.checkpoint,session.core.checkpointJson());assert.equal(stored.files[0].json,original);assert.equal(stored.files.length,3);
      oracle=twin(profile,session,options);const complete=pair(session.core,paired);await session.close();session=await SharedSegmentedPersistentSession.open(options);assert.deepEqual(pair(session.core,paired),complete);exactColdRestores++;
      for(const method of ['undo','redo','undo','redo']){assert.equal(session.core[method](),oracle[method]());if(paired){const r=method==='undo'?'undoReview':'redoReview';assert.deepEqual(session.core[r](),oracle[r]());}assert.deepEqual(pair(session.core,paired),pair(oracle,paired));assert.ok(session.core.documentJson().includes('peer'));await session.flush();const current=pair(session.core,paired);await session.close();session=await SharedSegmentedPersistentSession.open(options);assert.deepEqual(pair(session.core,paired),current);exactFuturePairs++;exactColdRestores++;}
      const oldOptions={...(options.searchHistory?{searchHistory:options.searchHistory}:{}),...(options.reviewedHistory?{reviewedHistory:options.reviewedHistory}:{})};
      assert.throws(()=>scope===2?createSharedDocumentEditor(profile.restore_segmented('room',session.core.checkpointJson()),oldOptions):new SharedRichEditor(profile.restore_segmented('room',session.core.checkpointJson()),oldOptions),e=>e.code==='segmented_history_policy');oldFamilyRefusals++;
      assert.throws(()=>session.core.sealHistoryPolicy(options.history),/generation-aware/);if(paired)assert.throws(()=>session.core.sealReviewPolicies(options.history,options.rangeEditing),/generation-aware/);
      const exact=pair(session.core,paired);await session.close();let called=false;await assert.rejects(SharedPersistentSession.open({database:options.database,room:'room',writer,create:()=>{called=true;throw Error('no fallback');},restore:()=>{called=true;throw Error('no fallback');}}));assert.equal(called,false);oldFamilyRefusals++;
      session=await SharedSegmentedPersistentSession.open({...options,readOnly:true,...(paired?{review:{...review,access:'read_only'}}:{})});assert.deepEqual(pair(session.core,paired),exact);assert.equal(session.core.view().readOnly,true);assert.throws(()=>insert(session.core,'forbidden'),/read-only/);assert.throws(()=>session.core.sealHistoryGeneration('forbidden'),/read-only/);if(paired){assert.ok(session.core.reviewSnapshot().view.undoDepth>0);assert.throws(()=>session.core.undoReview());}assert.deepEqual(pair(session.core,paired),exact);readonlyReopens++;
      cases++;if(paired)pairedCases++;
     }finally{oracle?.dispose();peer?.dispose();await session.discardAndClose();db?.close();}
    }
   }finally{profile.free();}
  }
  assert.equal(host.held.size,0);if(!smoke)assert.equal(cases,216);
  return {format:'breditor/segmented-history-sdk-probe',passed:true,smoke,sharedWasmSha256:createHash('sha256').update(bytes).digest('hex'),cases,pairedCases,exactColdRestores,exactFuturePairs,oldFamilyRefusals,readonlyReopens,retainedVersions,scope:'Actual native generation Wasm/SDK with synthetic storage/locks only; not physical durability, relay activation or unlimited comment-history generations.'};
 }finally{for(const[n,v]of globals){if(v)Object.defineProperty(globalThis,n,v);else delete globalThis[n];}}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length<1||args.length>2||args[1]!==undefined&&args[1]!=='--smoke')throw Error('Expected generated shared runtime directory and optional --smoke');console.log(JSON.stringify(await probeSegmentedHistorySdk(args[0],{smoke:args[1]==='--smoke'}),null,2));}
