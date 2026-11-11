/** Exercise normal document and comment synchronization against a published relay. */
import assert from 'node:assert/strict';
import {SharedRichEditor,SharedRelaySync,SharedReviewRelaySync} from '../../../packages/breditor-collaboration/dist/index.js';
import * as native from '../../../packages/breditor-collaboration/dist/runtime/breditor_shared.js';

export const publishedDocumentText='Accepted document edit after publication ';
export const publishedCommentText='Accepted comment after publication';

export async function withPublishedEditor(fixture,client,auth,visit,retained=client){
 const profile=native.SharedRichProfile.from_standard_configuration_json_v3(fixture.configuration);
 let core,document,comments;
 try{
  core=new SharedRichEditor(profile.restore('room',retained.documentCheckpoint),{richLanguage:3});
  core.enableReview({actor:client.actor,principal:client.principal,access:'comment'},retained.reviewCheckpoint);
  let progress={accepted:null,cursor:null,sequence:null};
  const common={getToken:auth.getToken,autoConnect:false,requestTimeoutMs:10_000};
  document=new SharedRelaySync(core,{...common,identity:auth.document,persistLocal:async()=>{}});
  comments=new SharedReviewRelaySync({...common,identity:auth.review,flushDocument:()=>document.flush(),storage:{
   core,reviewRelayIdentity:()=>auth.review,reviewRelayProgress:()=>progress,
   async persistReviewRelayProgress(value){progress=value;},async flush(){},
  }});
  await document.connect();
  await document.flush();
  await comments.connect();
  await comments.flush();
  return await visit({core,document,comments,commentProgress:()=>progress,disconnect(){comments.dispose();document.dispose();}});
 }finally{comments?.dispose();document?.dispose();core?.dispose();profile.free();}
}

export async function acknowledgePublishedEdits(fixture,client,auth){
 return withPublishedEditor(fixture,client,auth,async({core,document,comments,commentProgress})=>{
  const documentFloor=document.state().serverThrough,commentFloor=comments.state().serverThrough;
  core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:publishedDocumentText}}]});
  await document.flush();
  assert.ok(core.documentJson().includes(publishedDocumentText));
  assert.equal(document.state().pending,false);
  assert.ok(BigInt(document.state().serverThrough)>BigInt(documentFloor));
  const changed=core.dispatchReview({kind:'create_thread',data:{anchorJson:core.captureReviewAnchor({kind:'document'}),body:publishedCommentText}});
  assert.equal(changed.kind,'committed');
  await comments.flush();
  assert.ok(JSON.stringify(core.reviewSnapshot().view).includes(publishedCommentText));
  assert.equal(comments.state().pending,false);
  assert.ok(comments.state().lastReceipt);
  assert.ok(BigInt(comments.state().serverThrough)>BigInt(commentFloor));
  return {
   documentCheckpoint:core.checkpointJson(),reviewCheckpoint:core.reviewCheckpoint(),
   documentClock:document.state().serverThrough,documentPrefix:document.state().serverPrefixDigest,
   commentClock:commentProgress().accepted,
  };
 });
}
