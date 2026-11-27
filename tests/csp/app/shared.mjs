// Two replicas of the optional shared editor joined by an in-page frame relay: the same update and
// receive path a network relay carries, without a socket (connect-src stays 'self').
import {createSharedProfile,SharedRichEditor,mountSharedEditor,createStandardSharedToolbarV1} from "@breditor/editor/collaboration";
import {createStandardRichInlinePresentationV1} from "@breditor/editor";

const ready=document.querySelector("#ready"),errors=[];
const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
try{
 const profile=await createSharedProfile(),binding=JSON.parse(profile.descriptor_json());
 const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[
  {kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"body"},children:[{kind:"text",text:"Shared",formats:[]}]},
 ]};
 const seed=JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(root)});
 const presentation=createStandardRichInlinePresentationV1(profile.inline_catalog_json());
 const a=new SharedRichEditor(profile.create(seed,"101")),b=new SharedRichEditor(profile.join_frame("room","202",a.updateFrame()));
 const relay=async()=>{const x=a.updateFrame(),y=b.updateFrame();await a.receiveFrame(y);await b.receiveFrame(x);};
 const mount=(id,core)=>mountSharedEditor(document.querySelector(`#${id}`),{core,label:`Writer ${id.toUpperCase()}`,inlinePresentation:presentation,toolbar:createStandardSharedToolbarV1(core,presentation),onError:error=>errors.push(String(error)),onChange:event=>{if(event.source==="local")void relay().catch(error=>errors.push(String(error)));}});
 const da=mount("a",a),db=mount("b",b);
 window.cspShared={a,b,da,db,errors,relay};
 ready.textContent="Ready";
}catch(error){ready.textContent=`Failed: ${String(error)}`;throw error;}
