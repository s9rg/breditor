/** Actual normal Wasm references under facade overrides. No editing/native authority is fabricated. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {pixelAsset} from './fixtures/review-assets/pixels.mjs';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export async function probeCanonicalSourceReaders({api,runtime,fixture}){
 for(const name of ['sourceCoreMethods','sourceNativeRecoveryRead'])assert.equal(name in api,false,'Canonical read intrinsics stay internal');
 const wasm=await import(pathToFileURL(resolve(runtime,'breditor_shared.js')));await wasm.default({module_or_path:readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))});
 let cases=0,sourceChangesRefused=0,original=0,generation=0,instance=0,prototype=0;
 for(const[language,standard]of [[1,false],[2,false],[2,true],[3,false],[3,true]]){
  const configuration=JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:language,schema:{name:'example/canonical-source-readers',version:1},extensions:[]}),factory=language===1?'from_configuration_json':standard?`from_standard_configuration_json_v${language}`:`from_configuration_json_v${language}`,profile=wasm.SharedRichProfile[factory](configuration);
  try{
   const descriptor=JSON.parse(profile.descriptor_json()),root=JSON.parse(readFileSync(fixture,'utf8')),cell=root.children[0].children[0].children[0],paragraph=cell.children[0],image=cell.children[1];image.properties['breditor/asset-id']=pixelAsset;root.children=[paragraph,image];
   const document=JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:canonical(root)});
   for(const family of ['original','generation'])for(const override of ['instance','prototype']){
    const restore=environment(),tag=`canonical-${language}-${standard}-${family}-${override}`;let core,session,capture,target,saved;
    try{
     if(family==='generation'){
      session=await api.SharedSegmentedPersistentSession.open({database:tag,room:'room',writer:'101',richLanguage:language,history:'explicit',rangeEditing:'original',selectionEditing:'original',searchHistory:null,reviewedHistory:null,readOnly:false,initialGenerations:{root:tag+'-root',active:tag+'-one'},create:()=>profile.create(document,'101'),restoreSegmented:checkpoint=>profile.restore_segmented('room',checkpoint),onError(){}});core=session.core;
     }else core=new api.SharedRichEditor(profile.create(document,'101'));
     const actual=core.retainedAssetReferences(),checkpoint=core.checkpointJson();assert.equal(actual.references.length,1,'The admitted real native fixture has exactly one image binding');assert.equal(actual.references[0].asset,pixelAsset);
     target=override==='instance'?core:api.SharedRichEditor.prototype;saved=new Map(['retainedAssetReferences','checkRetainedAssetReferences'].map(name=>[name,Object.getOwnPropertyDescriptor(target,name)]));
     Object.defineProperty(target,'retainedAssetReferences',{value:()=>({...actual,references:[]}),configurable:true,writable:true});Object.defineProperty(target,'checkRetainedAssetReferences',{value:()=>{},configurable:true,writable:true});
     capture=family==='original'?api.SharedAssetReferenceCapture.capture({core}):api.SharedGenerationSourceCapture.capture({kind:'local',session});
     assert.equal(capture.metadata().outcome.kind,'ready');assert.deepEqual(capture.metadata().outcome.references,actual.references,'A public facade override must not hide actual native bindings');capture.check();assert.equal(core.checkpointJson(),checkpoint);
     const point={block:'p',offset:'0',affinity:'after'};core.select({kind:'text',anchor:point,focus:point});core.type('Actual source mutation');assert.throws(()=>capture.check(),'Actual source mutation still invalidates the capture with the fake guard installed');sourceChangesRefused++;
     cases++;if(family==='original')original++;else generation++;if(override==='instance')instance++;else prototype++;
    }finally{
     if(target&&saved)for(const[name,descriptor]of saved)if(descriptor)Object.defineProperty(target,name,descriptor);else delete target[name];
     capture?.dispose();if(session)await session.discardAndClose();else core?.dispose();restore();
    }
   }
  }finally{profile.free();}
 }
 assert.deepEqual({cases,sourceChangesRefused,original,generation,instance,prototype},{cases:20,sourceChangesRefused:20,original:10,generation:10,instance:10,prototype:10});
 return{format:'breditor/canonical-source-readers-probe',formatVersion:1,passed:true,cases,sourceChangesRefused,original,generation,instance,prototype,scope:'Actual normal Wasm image bindings across all five grammar/inline profiles, genuine original and managed local-generation captures, instance/prototype facade read/guard overrides and real source mutation. Synthetic client storage/locks; not arbitrary-host JavaScript tamper resistance, independent comment session integration, activation or V1 approval.'};
}
