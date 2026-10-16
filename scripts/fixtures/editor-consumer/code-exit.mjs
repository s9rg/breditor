import {openLocalEditor,createStructuralLocalProfileV2} from "@breditor/editor";
import root from "./code-exit-root.json";
import {range} from "./seed.mjs";
const query=new URLSearchParams(location.search),shared=query.get("mode")==="shared",natural=query.get("history")==="typing",toolbar=query.get("toolbar")==="none"?()=>[]:undefined,errors=[],key=`installed-code-exit-${shared}-${natural}-${!!toolbar}`;
let a,b,binding,documentJson,options;
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const initial=binding=>JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(root)});
if(shared){
 const {createStructuralSharedProfileV2,openSharedEditor}=await import("@breditor/editor/collaboration");
 const profile=await createStructuralSharedProfileV2();binding=JSON.parse(profile.descriptor_json());profile.free();documentJson=initial(binding);
 options={richLanguage:2,...(natural?{history:"typing-v1"}:{}),...(toolbar?{toolbar}:{}),database:key,room:"room",writer:"101",initial:{kind:"document",documentJson},onError:e=>errors.push(String(e))};
 a=await openSharedEditor({...options,host:document.querySelector("#a")});
 b=await openSharedEditor({...options,host:document.querySelector("#b"),writer:"202",database:`${key}-peer`,initial:{kind:"frame",frame:a.core.updateFrame()}});
}else{
 const profile=await createStructuralLocalProfileV2();binding=profile.descriptor();profile.dispose();documentJson=initial(binding);
 const checkpoint=sessionStorage.getItem(key);
 a=await openLocalEditor({host:document.querySelector("#a"),richLanguage:2,...(natural?{history:"typing-v1"}:{}),...(toolbar?{toolbar}:{}),initial:checkpoint?{kind:natural?"typingCheckpoint":"checkpoint",checkpointJson:checkpoint}:{kind:"document",documentJson},onError:e=>errors.push(String(e))});
}
const owner=target=>target??a;
const find=(n,block)=>n.properties?.["breditor/block-id"]===block?n:n.children?.map(c=>find(c,block)).find(Boolean);
window.codeExit={a,b,shared,natural,errors,range,binding,documentJson,
 select:(selection,target)=>shared?owner(target).select(selection):a.execute({kind:"setSelection",selection}),
 history:(redo=false,target)=>shared?owner(target).core[redo?"redo":"undo"]():a.execute({kind:redo?"redo":"undo"}),
 exit:(paragraph,target)=>shared?owner(target).core.exitCodeBlock(paragraph):a.execute({kind:"exitCodeBlock",data:{paragraph}}),
 node:block=>find(JSON.parse(a.view().documentJson).root,block),
 save:async()=>{if(natural)a.closeTypingGroup();if(shared)await a.flush();else sessionStorage.setItem(key,a.checkpointJson());return a.checkpointJson();},
 sync:async()=>{if(!shared)return;const x=a.core.updateFrame(),y=b.core.updateFrame();await a.core.receiveFrame(y);await b.core.receiveFrame(x);if(a.view().documentJson!==b.view().documentJson)throw Error("Code-exit peers differ");},
};
document.querySelector("#ready").textContent="Ready";
