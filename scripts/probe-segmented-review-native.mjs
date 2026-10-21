/** Real normal application Wasm: independent document/comment families and native cold history. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {segmentedReviewMethods,checkApplicationRuntime} from './check-collaboration-runtime-surface.mjs';

const fingerprint=bytes=>createHash('sha256').update(bytes).digest('hex');
// Only the input AST fixture is canonicalized. Native checkpoint strings remain opaque.
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const root=canonical(JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8')));
const policy=(actor,principal,access='comment')=>JSON.stringify({actor,principal,access});
function guarded(owner,action){const observed=owner.document_selection_enabled()?owner.observe_document():owner.observe();try{return action(observed);}finally{observed.free();}}
const review=(owner,action)=>JSON.parse(guarded(owner,o=>owner.dispatch_review(o,JSON.stringify(action))));
const exported=owner=>guarded(owner,o=>owner.export_review(o,'0'));
const savedReview=owner=>guarded(owner,o=>owner.review_segmented_checkpoint(o));
const view=owner=>JSON.parse(guarded(owner,o=>owner.review_view_json(o)));
function savedDocument(owner,scope,natural,segmented){return guarded(owner,o=>{
 if(segmented)return owner.segmented_checkpoint(o);
 if(scope===2)return natural?owner.document_typing_checkpoint(o):owner.document_checkpoint(o);
 if(scope===1)return natural?owner.general_typing_checkpoint(o):owner.general_checkpoint(o);
 return natural?owner.typing_checkpoint(o):owner.checkpoint(o);
});}
function coldDocument(profile,room,input,scope,natural,segmented){
 if(segmented)return profile.restore_segmented(room,input);
 if(scope===2)return natural?profile.restore_document_typing(room,input):profile.restore_document(room,input);
 if(scope===1)return natural?profile.restore_general_typing(room,input):profile.restore_general(room,input);
 return natural?profile.restore_typing(room,input):profile.restore(room,input);
}

export async function probeSegmentedReviewNative(directory){
 const previousFetch=Object.getOwnPropertyDescriptor(globalThis,'fetch');let networkCalls=0;
 Object.defineProperty(globalThis,'fetch',{configurable:true,writable:true,value(){networkCalls++;throw Error('Native history qualification must not initiate network access');}});
 try{return await runNativeProbe(directory,()=>networkCalls);}finally{if(previousFetch)Object.defineProperty(globalThis,'fetch',previousFetch);else delete globalThis.fetch;}
}
async function runNativeProbe(directory,networkCalls){
 await checkApplicationRuntime(directory);
 const native=await import(pathToFileURL(resolve(directory,'breditor_shared.js')).href),bytes=readFileSync(resolve(directory,'breditor_shared_bg.wasm'));
 await native.default({module_or_path:bytes});
 const counts={cases:0,coldReopens:0,sourceFileComparisons:0,futureHistoryComparisons:0,oldGetterRefusals:0,readonlyRefusals:0,nativeReceiptComparisons:0,staleRefusals:0,documentCutComparisons:0,observerCases:0,observerColdReopens:0};
 for(const language of [1,2,3])for(const standard of [false,true]){
  const configuration=JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:language,schema:{name:'example/native-comment-generations',version:1},extensions:[]});
  const constructor=language===1?(standard?'from_standard_configuration_json_v1':'from_configuration_json'):(standard?`from_standard_configuration_json_v${language}`:`from_configuration_json_v${language}`);
  const profile=native.SharedRichProfile[constructor](configuration),descriptor=JSON.parse(profile.descriptor_json());
  const input=JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root});
  try{for(const scope of [0,1,2])for(const natural of [false,true])for(const segmented of [false,true]){
   let owner,peer,cold,locked,observer,observerCold;
   try{
    owner=profile.create(input,'101');peer=profile.join_frame('room','202',owner.update_frame());
    for(const name of segmentedReviewMethods)assert.equal(typeof owner[name],'function');
    assert.equal(owner.review_history_generation_version(),'1');assert.equal(owner.review_history_family(),'none');
    if(scope===1)guarded(owner,o=>owner.enable_general_ranges(o));
    if(scope===2)guarded(owner,o=>owner.enable_document_selection(o));
    if(natural)guarded(owner,o=>owner.enable_typing_history(o));
    if(segmented)guarded(owner,o=>owner.enable_segmented_history(o,'document-root','document-one'));
    const pa=policy('review-a','alice'),pb=policy('review-b','bob');
    guarded(owner,o=>owner.enable_review(o,pa,undefined));guarded(peer,o=>peer.enable_review(o,pb,undefined));
    assert.equal(owner.review_history_family(),'original');
    const anchor=guarded(owner,o=>owner.capture_review_anchor(o,JSON.stringify({kind:'selection',selection:{kind:'node',block:'image-block'}})));
    const born=review(owner,{kind:'create_thread',data:{anchorJson:anchor,body:'Original native 🙂'}});assert.equal(born.kind,'committed');
    guarded(peer,o=>peer.receive_review(o,pa,exported(owner)));
    const original=guarded(owner,o=>owner.review_checkpoint(o)),documentBefore=savedDocument(owner,scope,natural,segmented);
    const stale=owner.document_selection_enabled()?owner.observe_document():owner.observe();
    try{guarded(owner,o=>owner.enable_review_history_generations(o,'review-root','review-one'));assert.throws(()=>owner.review_segmented_checkpoint(stale));counts.staleRefusals++;}finally{stale.free();}
    assert.equal(owner.review_history_family(),'segmented-v1');assert.equal(JSON.parse(savedReview(owner)).root,original);
    assert.equal(savedDocument(owner,scope,natural,segmented),documentBefore);counts.documentCutComparisons++;
    review(owner,{kind:'reply',data:{thread:born.event,body:'Saved author Redo'}});
    guarded(owner,o=>owner.seal_review_history_generation(o,'review-two'));guarded(owner,o=>owner.undo_review(o));
    guarded(owner,o=>owner.seal_review_history_generation(o,'review-three'));
    if(scope===0&&!natural&&!segmented){
     observer=profile.join_frame('room','303',owner.update_frame());
     const po=policy('review-observer','reader','read_only');guarded(observer,o=>observer.enable_review(o,po,undefined));
     guarded(observer,o=>observer.enable_observer_review_history_generations(o,'observer-root','observer-one'));
     guarded(observer,o=>observer.receive_review(o,pa,exported(owner)));
     const clock=guarded(observer,o=>observer.local_review_clock(o)),document=observer.checkpoint();
     guarded(observer,o=>observer.seal_observer_review_history_generation(o,'observer-two'));
     assert.equal(guarded(observer,o=>observer.local_review_clock(o)),clock);assert.equal(JSON.parse(clock).through,'0');
     const exact=savedReview(observer);observerCold=profile.restore('room',document);
     guarded(observerCold,o=>observerCold.enable_segmented_review(o,po,exact));
     assert.equal(savedReview(observerCold),exact);assert.deepEqual(view(observerCold),view(observer));
     assert.throws(()=>guarded(observerCold,o=>observerCold.undo_review(o)));assert.equal(savedReview(observerCold),exact);counts.readonlyRefusals++;
     assert.throws(()=>guarded(observerCold,o=>observerCold.review_checkpoint(o)));counts.oldGetterRefusals++;
     counts.observerCases++;counts.observerColdReopens++;
    }
    review(peer,{kind:'reply',data:{thread:born.event,body:'Offline peer survives'}});
    const peerFrame=exported(peer);guarded(owner,o=>owner.receive_review(o,pb,peerFrame));
    const receipt=guarded(owner,o=>owner.retained_review_receipt(o,pb,peerFrame));
    guarded(owner,o=>owner.seal_review_history_generation(o,'review-four'));
    assert.throws(()=>guarded(owner,o=>owner.review_checkpoint(o)));counts.oldGetterRefusals++;
    guarded(owner,o=>owner.dispatch(o,JSON.stringify({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'Later document '}}]})));
    if(segmented)guarded(owner,o=>owner.seal_history_segment(o,'document-two'));
    const document=savedDocument(owner,scope,natural,segmented),checkpoint=savedReview(owner),files=JSON.parse(checkpoint);
    cold=coldDocument(profile,'room',document,scope,natural,segmented);
    guarded(cold,o=>cold.enable_segmented_review(o,pa,checkpoint));counts.coldReopens++;
    assert.equal(savedReview(cold),checkpoint);assert.deepEqual(view(cold),view(owner));
    assert.equal(guarded(cold,o=>cold.retained_review_receipt(o,pb,peerFrame)),receipt);counts.nativeReceiptComparisons++;
    for(const method of ['redo_review','undo_review','redo_review']){
     assert.equal(guarded(owner,o=>owner[method](o)),guarded(cold,o=>cold[method](o)));
     assert.equal(savedReview(owner),savedReview(cold));assert.deepEqual(view(owner),view(cold));counts.futureHistoryComparisons++;
     assert.equal(savedDocument(owner,scope,natural,segmented),document);assert.equal(savedDocument(cold,scope,natural,segmented),document);counts.documentCutComparisons+=2;
    }
    const after=JSON.parse(savedReview(owner));assert.equal(after.root,files.root);assert.deepEqual(after.sealed,files.sealed);counts.sourceFileComparisons+=files.sealed.length+1;
    const final=savedReview(owner);locked=coldDocument(profile,'room',document,scope,natural,segmented);
    guarded(locked,o=>locked.enable_segmented_review(o,policy('review-a','alice','read_only'),final));counts.coldReopens++;
    assert.throws(()=>guarded(locked,o=>locked.undo_review(o)));assert.equal(savedReview(locked),final);counts.readonlyRefusals++;
    assert.throws(()=>guarded(locked,o=>locked.review_checkpoint(o)));counts.oldGetterRefusals++;
    counts.cases++;
   }catch(error){throw new Error(`Native comment generations language=${language} standard=${standard} scope=${scope} natural=${natural} documentGenerations=${segmented}`,{cause:error});}
   finally{observerCold?.free();observer?.free();locked?.free();cold?.free();peer?.free();owner?.free();}
  }}finally{profile.free();}
 }
 assert.equal(counts.cases,72);assert.equal(counts.coldReopens,144);assert.equal(counts.futureHistoryComparisons,216);assert.equal(counts.nativeReceiptComparisons,72);assert.equal(counts.sourceFileComparisons,288);assert.equal(counts.documentCutComparisons,504);assert.equal(counts.oldGetterRefusals,150);assert.equal(counts.staleRefusals,72);assert.equal(counts.readonlyRefusals,78);assert.equal(counts.observerCases,6);assert.equal(counts.observerColdReopens,6);
 assert.equal(networkCalls(),0);
 return{format:'breditor/native-segmented-review-probe',formatVersion:1,passed:true,...counts,networkCalls:networkCalls(),sharedWasmSha256:fingerprint(bytes),scope:'Actual normal application Wasm, separate document/review families, original offline peer, real image anchors, native receipts, exact cold current-policy recovery and future review history. No synthetic storage, sockets, SDK persistence or room activation is inferred.'};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3)throw Error('Expected the current normal shared application runtime directory');
 console.log(JSON.stringify(await probeSegmentedReviewNative(process.argv[2]),null,2));
}
