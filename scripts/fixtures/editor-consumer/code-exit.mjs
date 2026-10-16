import {openLocalEditor,createStructuralLocalProfileV2} from "@breditor/editor";
import root from "./code-exit-root.json";
import originalRoot from "./root.json";
import {range} from "./seed.mjs";
const query=new URLSearchParams(location.search),shared=query.get("mode")==="shared",natural=query.get("history")==="typing",toolbar=query.get("toolbar")==="none"?()=>[]:undefined,errors=[],flow=query.get("flow")==="1",key=`installed-code-exit-${shared}-${natural}-${!!toolbar}-${flow}-${query.get("only")??"all"}`;
let a,b,binding,documentJson,options;
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
function flowRoot(){
 const value=structuredClone(root),paragraph=(id,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:[{kind:"text",text,formats:[]}]});
 value.children.unshift(paragraph("before","a🙂b"));
 const hidden=structuredClone(value.children[1]);hidden.properties["breditor/block-id"]="hidden-table";hidden.properties["breditor/table-id"]="hidden-t";hidden.children=[];value.children.splice(3,0,hidden);
 value.children.push(structuredClone(originalRoot.children[0].children[0].children[0].children[1]),paragraph("after","End"));
 const find=(n,id)=>n.properties?.["breditor/block-id"]===id?n:n.children?.map(c=>find(c,id)).find(Boolean);
 for(const [scope,parent] of [["cell","cell"],["quote","quote"],["list","item"],["task","task"]]){
  const owner=find(value,parent);if(!owner)throw Error("Missing flow fixture scope");
  owner.children.push({kind:"element",type:"breditor/horizontal-rule",entityId:null,properties:{"breditor/block-id":`rule-${scope}`},children:[]});
 }
 const only=query.get("only");if(only){const ids={table:"table-block",image:"image-block",rule:"root-next"};const target=ids[only];if(!target)throw Error("Unknown flow fixture atom");const node=value.children.find(n=>n.properties?.["breditor/block-id"]===target);if(!node)throw Error("Missing flow fixture atom");value.children=[node];}
 return value;
}
const initial=binding=>JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(flow?flowRoot():root)});
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
 nav:(movement,target)=>shared?owner(target).core.navigateFlow(movement):a.execute({kind:"navigateFlow",data:{movement}}),
 adjacent:(paragraph,side,target)=>shared?owner(target).core.insertParagraphAdjacent(paragraph,side):a.execute({kind:"insertParagraphAdjacent",data:{paragraph,side}}),
 node:block=>find(JSON.parse(a.view().documentJson).root,block),
 save:async()=>{if(natural)a.closeTypingGroup();if(shared)await a.flush();else sessionStorage.setItem(key,a.checkpointJson());return a.checkpointJson();},
 sync:async()=>{if(!shared)return;const x=a.core.updateFrame(),y=b.core.updateFrame();await a.core.receiveFrame(y);await b.core.receiveFrame(x);if(a.view().documentJson!==b.view().documentJson)throw Error("Code-exit peers differ");},
};
document.querySelector("#ready").textContent="Ready";
