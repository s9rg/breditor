import {openLocalEditor,createLayoutLocalProfileV3,RichAssetStore} from "@breditor/editor";
import {coverageSeed,range,grid,paragraph} from "./coverage-seed.mjs";
import {structuralSeed} from "./structural-seed.mjs";
const query=new URLSearchParams(location.search),shared=query.get("mode")==="shared",natural=query.get("history")==="typing",bare=query.get("toolbar")==="none",structural=query.has("structural"),key=`installed-layout-visual-${shared}-${natural}-${bare}-${structural}`,errors=[];
const assets=await RichAssetStore.open(`${key}-assets`);
let a,b,core,binding;
const toolbar=(owner,standard)=>{core=owner;return bare?[]:standard;};
const seed=profile=>{const doc=JSON.parse(structural?structuralSeed(profile):coverageSeed(profile));doc.root.children.push(paragraph("rtl","אבג ABC"),paragraph("latin","ABC אבג"));return JSON.stringify(doc);};
if(shared){
 const {createLayoutSharedProfileV3,openSharedEditor,insertSharedImageFiles}=await import("@breditor/editor/collaboration");
 const profile=await createLayoutSharedProfileV3();binding=JSON.parse(profile.descriptor_json());profile.free();
 const options={richLanguage:3,...(natural?{history:"typing-v1"}:{}),database:key,room:"room",writer:"101",initial:{kind:"document",documentJson:seed(binding)},resolveAsset:block=>assets.resolve(block.asset),onError:error=>errors.push(String(error))};
 a=await openSharedEditor({...options,host:document.querySelector("#a"),toolbar,onFiles:(files,position,revision)=>insertSharedImageFiles(core,assets,files,position,revision)});
 b=await openSharedEditor({...options,host:document.querySelector("#b"),writer:"202",database:`${key}-peer`,initial:{kind:"frame",frame:core.updateFrame()}});
}else{
 const profile=await createLayoutLocalProfileV3();binding=profile.descriptor();profile.dispose();const checkpoint=sessionStorage.getItem(key);
 a=await openLocalEditor({host:document.querySelector("#a"),richLanguage:3,...(natural?{history:"typing-v1"}:{}),toolbar,initial:checkpoint?{kind:natural?"typingCheckpoint":"checkpoint",checkpointJson:checkpoint}:{kind:"document",documentJson:seed(binding)},resolveAsset:block=>assets.resolve(block.asset),onFiles:(files,position)=>a.insertImageFiles(assets,files,position),onError:error=>errors.push(String(error))});
}
const find=(node,id)=>node.properties?.["breditor/block-id"]===id?node:node.children?.map(child=>find(child,id)).find(Boolean);
window.layoutVisual={a,b,core,shared,natural,binding,assets,errors,range,grid,
 select:selection=>{if(shared)a.select(selection);else a.execute({kind:"setSelection",selection});a.focus();},
 change:patch=>shared?core.changeSelectionLayout(patch):a.execute({kind:"changeSelectionLayout",data:patch}),
 history:redo=>shared?core[redo?"redo":"undo"]():a.execute({kind:redo?"redo":"undo"}),
 node:id=>find(JSON.parse(a.view().documentJson).root,id),
 save:async()=>{if(natural)a.closeTypingGroup();if(shared)await a.flush();else sessionStorage.setItem(key,a.checkpointJson());return a.checkpointJson();},
 sync:async()=>{const x=core.updateFrame(),y=b.core.updateFrame();await core.receiveFrame(y);await b.core.receiveFrame(x);if(a.view().documentJson!==b.view().documentJson)throw Error("Layout peers differ");},
};
document.querySelector("#ready").textContent="Ready";
