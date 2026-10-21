/** Actual Wasm: former authors archive both lanes without resetting identities or granting edits. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const root=canonical(JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8')));
const methods=['read_only_history_lifecycle_version','enable_read_only_segmented_history','seal_read_only_history_segment','read_only_review_history_lifecycle_version','enable_read_only_review_history_generations','seal_read_only_review_history_generation'];
function guarded(owner,action){const o=owner.document_selection_enabled()?owner.observe_document():owner.observe();try{return action(o);}finally{o.free();}}
const policy=(actor,access='comment')=>JSON.stringify({actor,principal:'alice',access});
const review=(a,action)=>JSON.parse(guarded(a,o=>a.dispatch_review(o,JSON.stringify(action))));
const docEdit=(a,text)=>guarded(a,o=>a.dispatch(o,JSON.stringify({commands:[{kind:'insert_text',data:{block:'p',offset:0,text}}]})));
const reviewFile=a=>guarded(a,o=>a.review_segmented_checkpoint(o));
const reviewFrame=a=>guarded(a,o=>a.export_review(o,'0'));
const reviewClock=a=>guarded(a,o=>a.local_review_clock(o));
const pair=a=>[a.segmented_checkpoint(),reviewFile(a)];
function readonly(a){assert.equal(JSON.parse(guarded(a,o=>o.view_json())).readOnly,true);assert.throws(()=>guarded(a,o=>a.redo_review(o)));assert.throws(()=>guarded(a,o=>a.undo_observed(o)));}

export async function probeReadOnlyNativeHistory(directory){
 const bytes=readFileSync(resolve(directory,'breditor_shared_bg.wasm')),native=await import(pathToFileURL(resolve(directory,'breditor_shared.js')).href);
 await native.default({module_or_path:bytes});
 const counts={cases:0,coldPairs:0,enabledDocumentArchives:0,enabledReviewArchives:0,strictObserverRefusals:0,readOnlySeals:0,futurePairedComparisons:0,rootFileComparisons:0,activeFileComparisons:0};
 for(const language of [1,2,3])for(const standard of [false,true]){
  const config=JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:language,schema:{name:'example/passive-history-native',version:1},extensions:[]});
  const constructor=language===1?(standard?'from_standard_configuration_json_v1':'from_configuration_json'):(standard?'from_standard_configuration_json_v'+language:'from_configuration_json_v'+language);
  const profile=native.SharedRichProfile[constructor](config),descriptor=JSON.parse(profile.descriptor_json()),input=JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root});
  try{for(const scope of [0,1,2])for(const natural of [false,true])for(const documentGenerations of [false,true])for(const reviewGenerations of [false,true]){
   let a,b,cold;
   try{
    a=profile.create(input,'101');b=profile.join_frame('room','202',a.update_frame());
    for(const name of methods)assert.equal(typeof a[name],'function',name);
    assert.equal(a.read_only_history_lifecycle_version(),'1');assert.equal(a.read_only_review_history_lifecycle_version(),'1');
    if(scope===1)guarded(a,o=>a.enable_general_ranges(o));if(scope===2)guarded(a,o=>a.enable_document_selection(o));
    if(natural)guarded(a,o=>a.enable_typing_history(o));
    // Equal IDs in separate lanes must not collide or select one another's files.
    if(documentGenerations)guarded(a,o=>a.enable_segmented_history(o,'same-root','same-one'));
    for(const [owner,actor]of [[a,'review-a'],[b,'review-b']])guarded(owner,o=>owner.enable_review(o,policy(actor),undefined));
    docEdit(a,'First ');docEdit(a,'Saved Redo ');guarded(a,o=>a.undo_observed(o));b.receive_frame(a.update_frame());
    const anchor=guarded(a,o=>a.capture_review_anchor(o,JSON.stringify({kind:'selection',selection:{kind:'node',block:'image-block'}})));
    const born=review(a,{kind:'create_thread',data:{anchorJson:anchor,body:'Original 🙂'}}).event;
    review(a,{kind:'reply',data:{thread:born,body:'Saved comment Redo'}});guarded(a,o=>a.undo_review(o));
    guarded(b,o=>b.receive_review(o,policy('review-a'),reviewFrame(a)));
    if(reviewGenerations)guarded(a,o=>a.enable_review_history_generations(o,'same-root','same-one'));
    guarded(a,o=>a.set_read_only(o,true));guarded(a,o=>a.set_review_access(o,'read_only'));
    const docClock=a.writer_clock_v2('101'),commentClock=reviewClock(a),content=a.document_json();
    assert.notEqual(JSON.parse(docClock).through,'0');assert.notEqual(JSON.parse(commentClock).through,'0');
    if(!documentGenerations){assert.throws(()=>guarded(a,o=>a.enable_segmented_history(o,'same-root','same-one')));guarded(a,o=>a.enable_read_only_segmented_history(o,'same-root','same-one'));counts.enabledDocumentArchives++;}
    if(!reviewGenerations){assert.throws(()=>guarded(a,o=>a.enable_review_history_generations(o,'same-root','same-one')));guarded(a,o=>a.enable_read_only_review_history_generations(o,'same-root','same-one'));counts.enabledReviewArchives++;}
    assert.equal(a.document_json(),content);assert.equal(a.writer_clock_v2('101'),docClock);assert.equal(reviewClock(a),commentClock);readonly(a);
    docEdit(b,'Peer remains ');a.receive_frame(b.update_frame());review(b,{kind:'reply',data:{thread:born,body:'Peer comment remains'}});guarded(a,o=>a.receive_review(o,policy('review-b'),reviewFrame(b)));
    const before=pair(a),document=JSON.parse(before[0]),comments=JSON.parse(before[1]),causal=a.causal_version();
    assert.throws(()=>guarded(a,o=>a.seal_observer_history_segment(o,'same-two')));assert.throws(()=>guarded(a,o=>a.seal_observer_review_history_generation(o,'same-two')));counts.strictObserverRefusals+=2;
    guarded(a,o=>a.seal_read_only_history_segment(o,'same-two'));guarded(a,o=>a.seal_read_only_review_history_generation(o,'same-two'));counts.readOnlySeals+=2;
    assert.equal(a.causal_version(),causal);assert.equal(a.writer_clock_v2('101'),docClock);assert.equal(reviewClock(a),commentClock);
    const saved=pair(a),currentDocument=JSON.parse(saved[0]),currentReview=JSON.parse(saved[1]);
    assert.equal(currentDocument.rootCheckpoint,document.rootCheckpoint);assert.equal(currentReview.root,comments.root);counts.rootFileComparisons+=2;
    assert.equal(currentDocument.sealed.at(-1),document.active);assert.equal(currentReview.sealed.at(-1),comments.active);counts.activeFileComparisons+=2;
    readonly(a);assert.deepEqual(pair(a),saved);
    cold=profile.restore_segmented('room',saved[0]);cold.initialize_read_only(true);
    guarded(cold,o=>cold.enable_segmented_review(o,policy('review-a','read_only'),saved[1]));assert.deepEqual(pair(cold),saved);readonly(cold);assert.deepEqual(pair(cold),saved);counts.coldPairs++;
    // A later explicit host grant is outside, never inside, the archival operations.
    for(const owner of [a,cold]){guarded(owner,o=>owner.set_read_only(o,false));guarded(owner,o=>owner.set_review_access(o,'comment'));}
    for(const redo of [true,false,true]){
     const documentMethod=redo?'redo_observed':'undo_observed',commentMethod=redo?'redo_review':'undo_review';
     assert.equal(guarded(a,o=>a[documentMethod](o)),guarded(cold,o=>cold[documentMethod](o)));
     assert.equal(guarded(a,o=>a[commentMethod](o)),guarded(cold,o=>cold[commentMethod](o)));
     assert.deepEqual(pair(a),pair(cold));assert.equal(a.document_json(),cold.document_json());assert.match(a.document_json(),/Peer remains/);assert.match(guarded(a,o=>a.review_view_json(o)),/Peer comment remains/);counts.futurePairedComparisons++;
    }
    const exact=pair(a);assert.throws(()=>guarded(a,o=>a.seal_read_only_history_segment(o,'three')));assert.throws(()=>guarded(a,o=>a.seal_read_only_review_history_generation(o,'three')));assert.deepEqual(pair(a),exact);
    counts.cases++;
   }catch(error){throw new Error('Passive native history language='+language+' standard='+standard+' scope='+scope+' natural='+natural+' documentGenerations='+documentGenerations+' reviewGenerations='+reviewGenerations,{cause:error});}
   finally{cold?.free();b?.free();a?.free();}
  }}finally{profile.free();}
 }
 for(const [key,value]of Object.entries({cases:144,coldPairs:144,enabledDocumentArchives:72,enabledReviewArchives:72,strictObserverRefusals:288,readOnlySeals:288,futurePairedComparisons:432,rootFileComparisons:288,activeFileComparisons:288}))assert.equal(counts[key],value,key);
 return{format:'breditor/read-only-native-history-probe',formatVersion:1,passed:true,...counts,sharedWasmSha256:createHash('sha256').update(bytes).digest('hex'),scope:'Actual normal application Wasm and former-author histories in independent original/segmented lanes. Current read-only persists through archival and cold recovery; only a later explicit host grant permits future Undo/Redo. No SDK storage or relay-lifetime qualification.'};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3)throw Error('Expected the actual normal application runtime directory');
 console.log(JSON.stringify(await probeReadOnlyNativeHistory(process.argv[2]),null,2));
}
