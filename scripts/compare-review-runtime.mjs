/** Original native review contracts across real old/new application builds, never new-family fallback. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const root=canonical(JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8')));
const policy=(actor,principal)=>JSON.stringify({actor,principal,access:'comment'});
function guarded(owner,action){const o=owner.document_selection_enabled()?owner.observe_document():owner.observe();try{return action(o);}finally{o.free();}}
const checkpoint=owner=>guarded(owner,o=>owner.review_checkpoint(o));
const frame=owner=>guarded(owner,o=>owner.export_review(o,'0'));
const dispatch=(owner,action)=>guarded(owner,o=>owner.dispatch_review(o,JSON.stringify(action)));
function savedDocument(owner,scope,natural,segmented){if(segmented)return owner.segmented_checkpoint();if(scope===2)return natural?owner.document_typing_checkpoint():owner.document_checkpoint();if(scope===1)return natural?owner.general_typing_checkpoint():owner.general_checkpoint();return natural?owner.typing_checkpoint():owner.checkpoint();}
function restore(profile,input,scope,natural,segmented){if(segmented)return profile.restore_segmented('room',input);if(scope===2)return natural?profile.restore_document_typing('room',input):profile.restore_document('room',input);if(scope===1)return natural?profile.restore_general_typing('room',input):profile.restore_general('room',input);return natural?profile.restore_typing('room',input):profile.restore('room',input);}
async function load(directory){const bytes=readFileSync(resolve(directory,'breditor_shared_bg.wasm')),module=await import(pathToFileURL(resolve(directory,'breditor_shared.js')).href);await module.default({module_or_path:bytes});return{module,sha256:createHash('sha256').update(bytes).digest('hex')};}

export async function compareOriginalReviewRuntimes(beforeDirectory,afterDirectory){
 const before=await load(beforeDirectory),after=await load(afterDirectory),counts={cases:0,exactNativeComparisons:0,crossVersionRestores:0,futureHistoryComparisons:0};
 for(const language of [1,2,3])for(const standard of [false,true]){
  const configuration=JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:language,schema:{name:'example/original-review-runtime',version:1},extensions:[]});
  const constructor=language===1?(standard?'from_standard_configuration_json_v1':'from_configuration_json'):(standard?`from_standard_configuration_json_v${language}`:`from_configuration_json_v${language}`);
  const profiles=[before.module,after.module].map(m=>m.SharedRichProfile[constructor](configuration));
  try{for(const scope of [0,1,2])for(const natural of [false,true])for(const segmented of [false,true]){
   const owners=[],pa=policy('review-a','alice'),pb=policy('review-b','bob');
   function equal(all){const original=all[0];for(const owner of all.slice(1)){
    assert.equal(checkpoint(owner),checkpoint(original),'Original native review checkpoint bytes');
    assert.equal(frame(owner),frame(original),'Original native frame and event prefix bytes');
    assert.equal(guarded(owner,o=>owner.review_view_json(o)),guarded(original,o=>original.review_view_json(o)),'Original native view bytes');
    assert.equal(guarded(owner,o=>owner.local_review_clock(o)),guarded(original,o=>original.local_review_clock(o)),'Original native actor clocks');
    assert.equal(savedDocument(owner,scope,natural,segmented),savedDocument(original,scope,natural,segmented),'Unchanged exact native document cut');counts.exactNativeComparisons++;
   }}
   try{
    for(const profile of profiles){const descriptor=JSON.parse(profile.descriptor_json()),input=JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root}),owner=profile.create(input,'101');owners.push(owner);
     if(scope===1)guarded(owner,o=>owner.enable_general_ranges(o));if(scope===2)guarded(owner,o=>owner.enable_document_selection(o));if(natural)guarded(owner,o=>owner.enable_typing_history(o));if(segmented)guarded(owner,o=>owner.enable_segmented_history(o,'document-root','one'));guarded(owner,o=>owner.enable_review(o,pa,undefined));
     const anchor=guarded(owner,o=>owner.capture_review_anchor(o,JSON.stringify({kind:'selection',selection:{kind:'node',block:'image-block'}}))),born=JSON.parse(dispatch(owner,{kind:'create_thread',data:{anchorJson:anchor,body:'Original native 🙂'}}));
     dispatch(owner,{kind:'reply',data:{thread:born.event,body:'Original saved Redo'}});guarded(owner,o=>owner.undo_review(o));
    }
    equal(owners);
    const peer=profiles[0].join_frame('room','202',owners[0].update_frame());
    try{guarded(peer,o=>peer.enable_review(o,pb,undefined));guarded(peer,o=>peer.receive_review(o,pa,frame(owners[0])));const birth=JSON.parse(guarded(peer,o=>peer.review_view_json(o))).threads[0].thread.id;dispatch(peer,{kind:'reply',data:{thread:birth,body:'Concurrent original peer'}});for(const owner of owners)guarded(owner,o=>owner.receive_review(o,pb,frame(peer)));}finally{peer.free();}
    equal(owners);
    // Restore each actual old/new file in the opposite native implementation.
    for(const [source,profile]of [[owners[0],profiles[1]],[owners[1],profiles[0]]]){const cold=restore(profile,savedDocument(source,scope,natural,segmented),scope,natural,segmented);owners.push(cold);guarded(cold,o=>cold.enable_review(o,pa,checkpoint(source)));counts.crossVersionRestores++;}
    equal(owners);
    for(const method of ['redo_review','undo_review','undo_review','redo_review','redo_review']){const outcomes=owners.map(owner=>guarded(owner,o=>owner[method](o)));assert.ok(outcomes.every(value=>value===outcomes[0]));equal(owners);counts.futureHistoryComparisons+=owners.length-1;}
    counts.cases++;
   }catch(error){throw new Error(`Original review compatibility language=${language} standard=${standard} scope=${scope} natural=${natural} documentGenerations=${segmented}`,{cause:error});}
   finally{for(const owner of owners.reverse())owner.free();}
  }}finally{for(const profile of profiles)profile.free();}
 }
 assert.equal(counts.cases,72);assert.equal(counts.crossVersionRestores,144);assert.equal(counts.futureHistoryComparisons,1080);assert.equal(counts.exactNativeComparisons,144+216+1080);
 return{format:'breditor/original-review-runtime-comparison',formatVersion:1,passed:true,beforeWasmSha256:before.sha256,afterWasmSha256:after.sha256,...counts,scope:'Exact original native review checkpoints, event frames, views, actor clocks and document cuts in actual old/new application Wasm; both cross-version recovery directions and future Undo/Redo. No new review-family capability is assumed in the old build.'};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==4)throw Error('Expected actual before and after normal application runtime directories');
 console.log(JSON.stringify(await compareOriginalReviewRuntimes(...process.argv.slice(2)),null,2));
}
