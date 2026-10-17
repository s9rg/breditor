/** Actual packaged shared Wasm + SDK review workflows. No DOM, relay, accessibility or release claim. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,realpathSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {SharedRichEditor,createSharedDocumentEditor} from "../packages/breditor-collaboration/dist/core.js";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const alice={actor:"comments-alice",principal:"alice",access:"comment"};
const bob={actor:"comments-bob",principal:"bob",access:"comment"};
const create=(anchorJson,body)=>({kind:"create_thread",data:{anchorJson,body}});
const reply=(thread,body)=>({kind:"reply",data:{thread,body}});
const point=offset=>({block:"p",offset:String(offset),affinity:"after"});
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const nodeTarget={kind:"selection",selection:{kind:"node",block:"image-block"}};
export async function probeReviewSdk(directory){
 const bytes=readFileSync(resolve(directory,"breditor_shared_bg.wasm"));
 const wasm=await import(pathToFileURL(resolve(directory,"breditor_shared.js")));
 await wasm.default({module_or_path:bytes});
 const profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:3,schema:{name:"example/review-sdk",version:1},extensions:[]}));
 const descriptor=JSON.parse(profile.descriptor_json());
 const seed=JSON.stringify({format:"breditor/document",formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:canonical(JSON.parse(readFileSync(resolve(root,"crates/breditor-core/tests/fixtures/rich-local-root.json"),"utf8")))});
 let trials=0,restores=0,future=0,pendingTargets=0,duplicateEchoes=0,blockedReentrant=0,versionRestores=0;
 try{
  for(const document of [false,true])for(const natural of [false,true]){
   const errors=[];
   const facade=raw=>document?createSharedDocumentEditor(raw,{onError:e=>errors.push(e)}):new SharedRichEditor(raw,{onError:e=>errors.push(e)});
   const a=facade(profile.create(seed,"101")), b=facade(profile.join_frame("room","202",a.updateFrame()));let recovered;
   try{
    if(natural){a.enableTypingHistory();b.enableTypingHistory();}
    assert.equal(a.supportsReview(),true);
    assert.throws(()=>a.reviewSnapshot(),/Enable the complete/);
    a.enableReview(alice);b.enableReview(bob);
    assert.equal(a.supportsDocumentVersions(),true);
    const version=a.captureVersion("Named draft 日本 🙂","alice","1792200000000");
    assert.equal(a.compareVersion(version).identical,true);
    assert.equal(a.readVersion(version).name,"Named draft 日本 🙂");
    assert.throws(()=>a.enableReview(alice),/already has/);
    const before=a.checkpointJson(), rev=a.view().revision;
    const packet=a.captureReviewAnchor(nodeTarget,rev);
    assert.equal(a.resolveReviewAnchor(packet).kind,"resolved");
    const created=a.dispatchReview(create(packet,"Literal <b>日本 🙂</b>"),a.reviewSnapshot());assert.equal(created.kind,"committed");
    const thread=created.event;
    assert.equal(a.checkpointJson(),before);assert.equal(a.view().revision,rev);
    assert.equal(b.receiveReview(a.exportReview(),alice).kind,"applied");
    b.dispatchReview(reply(thread,"Independent peer reply"));
    assert.equal(a.receiveReview(b.exportReview(),bob).kind,"applied");
    const current=a.reviewSnapshot(),savedMetadata=a.reviewCheckpoint();
    assert.equal(a.receiveReview(b.exportReview(),bob).kind,"unchanged");
    assert.equal(a.reviewSnapshot().reviewRevision,current.reviewRevision);
    assert.equal(a.reviewCheckpoint(),savedMetadata);duplicateEchoes++;
    a.undoReview(current);
    assert.equal(a.reviewSnapshot().view.threads[0].thread.messages[0].versions.length,0);
    assert.equal(a.reviewSnapshot().view.threads[0].thread.messages[1].versions[0].text,"Independent peer reply");
    assert.throws(()=>a.redoReview(current),/older document or review/);
    a.redoReview();
    // Every listener gets a fresh native read; neither mutation nor reentrant authoring leaks.
    let observedBody;
    const off1=a.subscribeReview(s=>{s.view.threads[0].thread.messages[0].versions[0].text="Changed only callback copy";a.dispatchReview(reply(thread,"Reentrant must fail"));});
    const off2=a.subscribeReview(s=>{observedBody=s.view.threads[0].thread.messages[0].versions[0].text;});
    a.dispatchReview(reply(thread,"New branch"));
    assert.equal(observedBody,"Literal <b>日本 🙂</b>");
    assert.ok(errors.some(e=>e.code==="reentrant_publication"));blockedReentrant++;off1();off2();
    // Document dependencies can be delayed independently of the comment causal stream.
    b.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Offline "}}]});
    b.dispatchReview(create(b.captureReviewAnchor(nodeTarget),"After offline typing"));
    assert.equal(a.receiveReview(b.exportReview(),bob).kind,"applied");
    assert.equal(a.reviewSnapshot().view.threads[1].targets[0].resolution.kind,"pending");pendingTargets++;
    const metadata=a.reviewCheckpoint();await a.receiveFrame(b.updateFrame());assert.equal(a.reviewCheckpoint(),metadata);
    assert.equal(a.reviewSnapshot().view.threads[1].targets[0].resolution.kind,"resolved");
    // Accepted typing never enters review Undo, and comments never enter document Undo.
    a.select({kind:"text",anchor:point(0),focus:point(0)});
    if(natural){a.typeUser("A","1");a.typeUser("🙂","2");}else a.type("A🙂");
    const docBeforeUndo=a.documentJson(), reviewBeforeUndo=a.reviewCheckpoint();a.undo();assert.equal(a.reviewCheckpoint(),reviewBeforeUndo);a.redo();assert.equal(a.documentJson(),docBeforeUndo);
    // Version restore is a new accepted edit, not old writer/review recovery.
    assert.equal(a.compareVersion(version).identical,false);
    const pairBeforePlan=[a.checkpointJson(),a.reviewCheckpoint()];
    const plan=a.prepareVersionRestore(version,"review-version-restore");
    const preview=plan.documentJson();assert.equal(plan.version().name,"Named draft 日本 🙂");
    assert.equal(plan.comparison().versionAssets[0].asset,"asset");
    assert.deepEqual([a.checkpointJson(),a.reviewCheckpoint()],pairBeforePlan);
    assert.throws(()=>b.applyVersionRestore(plan),/another editor/);
    assert.equal(a.applyVersionRestore(plan),true);versionRestores++;
    assert.equal(a.documentJson(),preview);assert.equal(a.reviewCheckpoint(),pairBeforePlan[1]);
    assert.equal(a.reviewSnapshot().view.threads[0].targets[0].resolution.kind,"orphaned");
    assert.throws(()=>a.applyVersionRestore(plan),/stale or foreign shared observation/);
    plan.dispose();assert.equal(plan.documentJson(),preview);assert.throws(()=>a.applyVersionRestore(plan),/disposed/);
    const docSaved=a.checkpointJson(),reviewSaved=a.reviewCheckpoint();
    const restore=document?(natural?profile.restore_document_typing.bind(profile):profile.restore_document.bind(profile)):(natural?profile.restore_typing.bind(profile):profile.restore.bind(profile));
    recovered=facade(restore("room",docSaved));recovered.enableReview(alice,reviewSaved);restores++;
    assert.equal(recovered.checkpointJson(),docSaved);assert.equal(recovered.reviewCheckpoint(),reviewSaved);
    for(const method of ["undoReview","redoReview","undo","redo","undoReview","redoReview"]){
     a[method]();recovered[method]();assert.equal(a.checkpointJson(),recovered.checkpointJson());assert.equal(a.reviewCheckpoint(),recovered.reviewCheckpoint());assert.deepEqual(a.reviewSnapshot().view,recovered.reviewSnapshot().view);future++;
    }
    const policyGuard=a.reviewSnapshot();assert.equal(a.setReviewAccess("comment",policyGuard),false);assert.equal(a.reviewSnapshot().reviewRevision,policyGuard.reviewRevision);
    a.setReadOnly(true);assert.equal(a.view().readOnly,true);a.dispatchReview(reply(thread,"Document readonly still allows host-authorized comments"));
    a.setReviewAccess("read_only");const denied=a.reviewCheckpoint();assert.throws(()=>a.dispatchReview(reply(thread,"Denied")),/not permitted/);assert.equal(a.reviewCheckpoint(),denied);
    assert.throws(()=>a.receiveReview(b.exportReview(),{...bob,principal:"forged"}),/not permitted/);
    trials++;
   }finally{recovered?.dispose();b.dispose();a.dispose();}
  }
  // Native observations also guard the independent metadata lane, even with identical document JSON.
  const raw=profile.create(seed,"303");try{
   const initial=raw.observe();raw.enable_review(initial,JSON.stringify(alice),null);initial.free();
   const observed=raw.observe();const packet=raw.capture_review_anchor(observed,JSON.stringify(nodeTarget));
   raw.dispatch_review(observed,JSON.stringify(create(packet,"Native exact guard")));
   assert.throws(()=>raw.dispatch_review(observed,JSON.stringify(create(packet,"Stale"))),/stale or foreign review/);observed.free();
  }finally{raw.free();}
  // A partially paired runtime fails closed; no JavaScript metadata tree is fabricated.
  const partial=profile.create(seed,"404");partial.dispatch_review=undefined;const old=new SharedRichEditor(partial);try{assert.equal(old.supportsReview(),false);assert.throws(()=>old.enableReview(alice),/complete matching/);}finally{old.dispose();}
  const sealed=new SharedRichEditor(profile.create(seed,"505"));try{sealed.sealHistoryPolicy("explicit");assert.throws(()=>sealed.enableReview(alice),/stores document history only/);}finally{sealed.dispose();}
  const reviewFirst=new SharedRichEditor(profile.create(seed,"606"));try{reviewFirst.enableReview(alice);assert.throws(()=>reviewFirst.sealHistoryPolicy("explicit"),/paired durable storage/);}finally{reviewFirst.dispose();}
  const preattached=profile.create(seed,"707");const initial=preattached.observe();try{preattached.enable_review(initial,JSON.stringify(alice),null);}finally{initial.free();}assert.throws(()=>new SharedRichEditor(preattached),/explicitly enable\/restore review/);
  const left=new SharedRichEditor(profile.create(seed,"808")),right=new SharedRichEditor(profile.create(seed,"909"));try{left.enableReview(alice);right.enableReview({...alice,actor:"comments-other-owner"});const foreign=left.reviewSnapshot();assert.equal(foreign.documentRevision,right.reviewSnapshot().documentRevision);assert.equal(foreign.reviewRevision,right.reviewSnapshot().reviewRevision);assert.throws(()=>right.setReviewAccess("read_only",foreign),/older document or review|foreign/);assert.throws(()=>right.setReviewAccess("read_only",JSON.parse(JSON.stringify(right.reviewSnapshot()))),/foreign/);assert.equal(right.setReviewAccess("comment",right.reviewSnapshot()),false);}finally{left.dispose();right.dispose();}
 }finally{profile.free();}
 assert.equal(trials,4);assert.equal(future,24);assert.equal(restores,4);assert.equal(pendingTargets,4);assert.equal(duplicateEchoes,4);assert.equal(blockedReentrant,4);assert.equal(versionRestores,4);
 return {format:"breditor/review-programmatic-sdk-probe",formatVersion:1,sharedWasmSha256:createHash("sha256").update(bytes).digest("hex"),trials,exactRestores:restores,exactFuturePairedCheckpoints:future,pendingTargets,duplicateEchoes,blockedReentrant,versionRestores,ownerGuardRefusals:2,passed:true,scope:"Actual Wasm/native comment admission, strict anchors, peer frames, separate history, named version restore preserving current comments, exact paired manual recovery, owner-bound guards and SDK notifications across original/document selection and explicit/natural history. Paired local storage and vanilla/React controls have separate probes. This probe does not qualify physical browsers, authenticated review relay, shared version catalogs or suggestions."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==3)throw Error("Expected actual shared Wasm directory");console.log(JSON.stringify(await probeReviewSdk(process.argv[2]),null,2));}
