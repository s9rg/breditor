/** Actual pre/post application owners across every ordinary history policy. No timing threshold or publication. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const root=canonical(JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8')));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function load(directory){const bytes=readFileSync(resolve(directory,'breditor_shared_bg.wasm')),module=await import(pathToFileURL(resolve(directory,'breditor_shared.js')).href);await module.default({module_or_path:bytes});return{module,sha256:sha(bytes)};}
function restore(profile,checkpoint,{scope,natural,search,reviewed}){if(search)return profile.restore_search('room',checkpoint);if(reviewed)return profile.restore_reviewed('room',checkpoint);if(scope==='document')return natural?profile.restore_document_typing('room',checkpoint):profile.restore_document('room',checkpoint);if(scope==='general')return natural?profile.restore_general_typing('room',checkpoint):profile.restore_general('room',checkpoint);return natural?profile.restore_typing('room',checkpoint):profile.restore('room',checkpoint);}
function binding(editor){const{bytes,...value}=JSON.parse(editor.updateFrame());assert.ok(bytes.length);return value;}
/** Cold replay and original files remain independent of the optimized live staging path. */
export async function compareLiveStagingRuntimes(beforeDirectory,afterDirectory,modules){
 const api=modules?.collaboration??await import('../packages/breditor-collaboration/dist/index.js'),before=await load(beforeDirectory),after=await load(afterDirectory),counts={cases:0,exactOwnerComparisons:0,crossVersionRestores:0,futureHistoryComparisons:0,readonlyRefusals:0,failedCandidateRefusals:0,peerReceives:0};
 for(const language of [1,2,3])for(const standard of [false,true]){
  const configuration=JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:language,schema:{name:'example/live-staging-compatibility',version:1},extensions:[]}),factory=language===1?(standard?'from_standard_configuration_json_v1':'from_configuration_json'):(standard?`from_standard_configuration_json_v${language}`:`from_configuration_json_v${language}`),profiles=[before.module,after.module].map(module=>module.SharedRichProfile[factory](configuration));
  try{assert.equal(profiles[0].descriptor_json(),profiles[1].descriptor_json());const descriptor=JSON.parse(profiles[0].descriptor_json()),document=JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root});
   for(const scope of ['original','general','document'])for(const natural of [false,true])for(const search of [false,true])for(const reviewed of [false,true]){
    const policy={scope,natural,search,reviewed},options={...(search?{searchHistory:'search-v1'}:{}),...(reviewed?{reviewedHistory:{binding:'a'.repeat(64),principal:'alice',effectWriter:'900'}}:{})},owners=[];let phase='creation';
    const wrap=raw=>scope==='document'?api.createSharedDocumentEditor(raw,options):new api.SharedRichEditor(raw,options),setup=raw=>{const editor=wrap(raw);try{if(scope==='general')editor.enableGeneralRanges();if(natural)editor.enableTypingHistory();return editor;}catch(error){editor.dispose();throw error;}};
    function equal(all){for(const owner of all.slice(1)){assert.equal(owner.checkpointJson(),all[0].checkpointJson(),'Exact native journal bytes');assert.equal(owner.documentJson(),all[0].documentJson(),'Exact rich AST bytes');assert.deepEqual(owner.view(),all[0].view(),'Exact current UI/history view');assert.deepEqual(owner.writerClockV2('101'),all[0].writerClockV2('101'),'Canonical own-writer lineage');assert.deepEqual(owner.writerClockV2('202'),all[0].writerClockV2('202'),'Canonical peer lineage');assert.deepEqual(binding(owner),binding(all[0]),'Actual native frame binding');counts.exactOwnerComparisons++;}}
    try{
     for(const profile of profiles)owners.push(setup(profile.create(document,'101')));phase='initial comparison';equal(owners);const genesis=owners[0].updateFrame();phase='local edit';
     for(const editor of owners)assert.equal(editor.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:1,text:'Local 🙂 '}}]}),true);equal(owners);
     phase='local Undo';for(const editor of owners)assert.equal(editor.undo(),true);equal(owners);phase='peer input';
     const peer=setup(profiles[0].join_frame('room','202',genesis));try{assert.equal(peer.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'Peer '}}]}),true);const frame=peer.updateFrame();for(const editor of owners){await editor.receiveFrame(frame);counts.peerReceives++;}}finally{peer.dispose();}equal(owners);
     // Both true old/new encoded journals enter the opposite native cold reader.
     phase='cross-version cold restore';for(const[source,profile]of [[owners[0],profiles[1]],[owners[1],profiles[0]]]){const cold=wrap(restore(profile,source.checkpointJson(),policy));owners.push(cold);counts.crossVersionRestores++;}equal(owners);phase='future history';
     for(const method of ['redo','undo','redo','undo']){const results=owners.map(owner=>owner[method]());assert.ok(results.every(value=>value===results[0]));equal(owners);counts.futureHistoryComparisons+=owners.length-1;}
     phase='atomic refusals';for(const editor of owners){const checkpoint=editor.checkpointJson();assert.throws(()=>editor.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:4294967295,text:'invalid'}}]}));assert.equal(editor.checkpointJson(),checkpoint);counts.failedCandidateRefusals++;editor.setReadOnly(true);const readonly=editor.checkpointJson();assert.throws(()=>editor.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'refused'}}]}),error=>error.code==='read_only');assert.equal(editor.checkpointJson(),readonly);editor.setReadOnly(false);counts.readonlyRefusals++;}equal(owners);counts.cases++;
    }catch(error){throw new Error(`Live staging compatibility phase=${phase} language=${language} standard=${standard} scope=${scope} natural=${natural} search=${search} reviewed=${reviewed}`,{cause:error});}finally{for(const owner of owners.reverse())owner.dispose();}
   }
  }finally{for(const profile of profiles)profile.free();}
 }
 for(const[key,value]of Object.entries({cases:144,exactOwnerComparisons:3168,crossVersionRestores:288,futureHistoryComparisons:1728,readonlyRefusals:576,failedCandidateRefusals:576,peerReceives:288}))assert.equal(counts[key],value,key);
 return{format:'breditor/live-staging-runtime-comparison',formatVersion:1,passed:true,beforeWasmSha256:before.sha256,afterWasmSha256:after.sha256,...counts,scope:'Actual old/new normal application Wasm in all 144 grammar/preset/scope/typing/search/reviewed policies. Exact journals, rich AST/UI, canonical writer/peer clocks and frame bindings; old offline peer input, both cold restore directions, future Undo/Redo and atomic failures. Raw engine frame compression is not compared. No timing threshold, resource-envelope certification, browser/platform or V1 approval.'};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error('Expected actual before and after normal application runtime directories');console.log(JSON.stringify(await compareLiveStagingRuntimes(...process.argv.slice(2)),null,2));}
