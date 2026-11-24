import init,* as wasm from '@breditor/collaboration/wasm';
import wasmUrl from '@breditor/collaboration/wasm-binary?url';
import {SharedReviewPersistentSession,restoreSharedDocumentEditor} from '@breditor/collaboration';
import {fullscreenSeed} from './fullscreen-seed.mjs';
await init({module_or_path:wasmUrl});
const check=(condition,message)=>{if(!condition)throw Error(message);};
const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),value=>value.toString(16).padStart(2,'0')).join('');
window.runPairedSave=async()=>{
 const profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:3,schema:{name:'example/paired-save-admission',version:1},extensions:[]}));
 const seed=JSON.parse(fullscreenSeed(JSON.parse(profile.descriptor_json()),3));
 for(let index=0;index<38;index++)seed.root.children.push({kind:'element',type:'breditor/paragraph',entityId:null,properties:{'breditor/block-id':`measure-${index}`},children:[{kind:'text',text:`${index} `+'native document measuring text '.repeat(90),formats:[]}]});
 const document=JSON.stringify(seed),database='measure-paired-admission',room='room',writer='101';
 const options={database,room,writer,richLanguage:3,history:'explicit',rangeEditing:'general-v1',selectionEditing:'document-v1',review:{actor:'paired-measure',principal:'alice',access:'comment'},create:()=>profile.create(document,writer),restore:input=>restoreSharedDocumentEditor(profile,room,input)};
 const reads=()=>new Promise((resolve,reject)=>{
  const open=indexedDB.open(database,1);
  open.onsuccess=()=>{const db=open.result,tx=db.transaction('journals','readonly'),read=tx.objectStore('journals').get([room,writer]);tx.oncomplete=()=>{db.close();resolve(read.result);};tx.onabort=()=>{db.close();reject(tx.error);};};
  open.onerror=()=>reject(open.error);
 });
 let owner,reopened;
 const samples=[];
 try{
  owner=await SharedReviewPersistentSession.open(options);
  owner.core.select({kind:'text',anchor:{block:'z-intro',offset:'0',affinity:'after'},focus:{block:'z-intro',offset:'0',affinity:'after'}});
  const comment=body=>{
   const anchorJson=owner.core.captureReviewAnchor({kind:'document'});
   check(owner.core.dispatchReview({kind:'create_thread',data:{anchorJson,body}}).kind==='committed','Native comment must commit');
  };
  for(let index=0;index<10;index++){owner.saveVersion(`Saved version ${index}`,String(1792450000000+index));comment(`Retained comment ${index} 🙂`);}
  await owner.flush();
  for(let index=-2;index<16;index++){
   const stats={serializations:0,encodes:0,parses:0,pairedBytes:0},lane=index%2===0?'document':'review';
   const stringify=JSON.stringify,parse=JSON.parse,encode=TextEncoder.prototype.encode;
   JSON.stringify=function(input,...args){const result=stringify.call(this,input,...args);if(input?.format==='breditor/shared-review-checkpoint-record'){stats.serializations++;}return result;};
   JSON.parse=function(input,...args){if(typeof input==='string'&&(input.startsWith('{"format":"breditor/review-session"')||input.startsWith('{"format":"breditor/rich-replica-document-journal"')))stats.parses++;return parse.call(this,input,...args);};
   TextEncoder.prototype.encode=function(input){const result=encode.call(this,input);if(typeof input==='string'&&input.startsWith('{"format":"breditor/shared-review-checkpoint-record"')){stats.encodes++;stats.pairedBytes=result.byteLength;}return result;};
   try{
    const started=performance.now();
    if(lane==='document')check(owner.core.type(`Document edit ${index} 🙂`),'Native document must commit');
    else comment(`Review edit ${index} 🙂`);
    const published=performance.now();
    await owner.flush();
    if(index>=0)samples.push({lane,...stats,publishMs:published-started,commitMs:performance.now()-started});
   }finally{JSON.stringify=stringify;JSON.parse=parse;TextEncoder.prototype.encode=encode;}
  }
  let held;
  try{const clone=await SharedReviewPersistentSession.open({...options,database:database+'-competing'});await clone.discardAndClose();}
  catch(error){held=error.code;}
  check(held==='writer_in_use','The measuring owner must hold its genuine writer lease until close');
  const exact=JSON.stringify(owner.exportRecovery()),committed=JSON.stringify(await reads());
  check(exact===committed,'Both native histories and the named catalog must match the durable record');
  await owner.close();owner=undefined;
  reopened=await SharedReviewPersistentSession.open(options);
  check(reopened.recovered&&JSON.stringify(reopened.exportRecovery())===exact,'The paired history must reopen byte-for-byte');
  check(reopened.versions().length===10,'The immutable catalog must reopen');
  const documentView=reopened.core.documentJson(),reviewView=JSON.stringify(reopened.core.reviewSnapshot().view);
  check(reopened.core.undo()&&reopened.core.documentJson()!==documentView,'Document Undo must change the restored content');
  check(reopened.core.redo()&&reopened.core.documentJson()===documentView,'Document Redo must restore exact content');
  check(reopened.core.undoReview().kind==='committed'&&JSON.stringify(reopened.core.reviewSnapshot().view)!==reviewView,'Comment Undo must change the restored review view');
  check(reopened.core.redoReview().kind==='committed'&&JSON.stringify(reopened.core.reviewSnapshot().view)===reviewView,'Comment Redo must restore exact view');
  return{passed:true,samples,catalog:10,writerLeaseRefusal:true,exactReopen:true,documentAndReviewUndoRedo:true,recordSha256:await sha(exact)};
 }finally{await Promise.all([owner?.discardAndClose(),reopened?.discardAndClose()]);profile.free();}
};
