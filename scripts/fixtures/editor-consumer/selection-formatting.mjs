import {openLocalEditor,createStructuralLocalProfileV2} from "@breditor/editor";
import {coverageSeed,range,grid} from "./coverage-seed.mjs";
const query=new URLSearchParams(location.search),shared=query.get("mode")==="shared",natural=query.get("history")==="typing",bare=query.get("toolbar")==="none",key=`installed-selection-formats-${shared}-${natural}-${bare}`,errors=[];
let a,b,core,binding;
const toolbar=(owner,standard)=>{core=owner;return bare?[]:standard;};
if(shared){
 const {createStructuralSharedProfileV2,openSharedEditor}=await import("@breditor/editor/collaboration");
 const profile=await createStructuralSharedProfileV2();binding=JSON.parse(profile.descriptor_json());profile.free();
 const options={richLanguage:2,...(natural?{history:"typing-v1"}:{}),database:key,room:"room",writer:"101",initial:{kind:"document",documentJson:coverageSeed(binding)},onError:e=>errors.push(String(e))};
 a=await openSharedEditor({...options,host:document.querySelector("#a"),toolbar});
 b=await openSharedEditor({...options,host:document.querySelector("#b"),writer:"202",database:`${key}-peer`,initial:{kind:"frame",frame:a.core.updateFrame()}});
}else{
 const profile=await createStructuralLocalProfileV2();binding=profile.descriptor();profile.dispose();const checkpoint=sessionStorage.getItem(key);
 a=await openLocalEditor({host:document.querySelector("#a"),richLanguage:2,...(natural?{history:"typing-v1"}:{}),toolbar,initial:checkpoint?{kind:natural?"typingCheckpoint":"checkpoint",checkpointJson:checkpoint}:{kind:"document",documentJson:coverageSeed(binding)},onError:e=>errors.push(String(e))});
}
const find=(n,id)=>n.properties?.["breditor/block-id"]===id?n:n.children?.map(c=>find(c,id)).find(Boolean);
window.coverage={a,b,core,shared,natural,binding,errors,range,grid,
 select:s=>{if(shared)a.select(s);else a.execute({kind:"setSelection",selection:s});a.focus();},
 change:changes=>shared?core.changeSelectionFormats(changes):a.execute({kind:"changeSelectionFormats",data:{changes}}),
 history:redo=>shared?core[redo?"redo":"undo"]():a.execute({kind:redo?"redo":"undo"}),
 node:id=>find(JSON.parse(a.view().documentJson).root,id),
 save:async()=>{if(natural)a.closeTypingGroup();if(shared)await a.flush();else sessionStorage.setItem(key,a.checkpointJson());return a.checkpointJson();},
 sync:async()=>{const x=core.updateFrame(),y=b.core.updateFrame();await core.receiveFrame(y);await b.core.receiveFrame(x);if(a.view().documentJson!==b.view().documentJson)throw Error("Selection-formatting peers differ");},
};
document.querySelector("#ready").textContent="Ready";
