/** Public installed SDK only. This fixture owns and closes every opened writer. */
import {openLocalEditor,createLayoutLocalProfileV3} from "@breditor/editor";
import {openSharedEditor,createLayoutSharedProfileV3} from "@breditor/editor/collaboration";
const root=document.querySelector("#editor"),errors=[];let editor,kind,sequence=0;
const label='<img src=x onerror="bad()"> Start writing 日本';
function proseProperties(heading){const values={"breditor/block-id":"body","breditor/block-direction":2,"breditor/block-indent":2,"breditor/block-align":2,"breditor/line-height-percent":160,...(heading?{"breditor/level":2}:{})};return Object.fromEntries(Object.keys(values).sort().map(key=>[key,values[key]]));}
async function close(){if(!editor)return;const current=editor;editor=undefined;if(kind==="local")current.dispose();else await current.close();}
async function open(nextKind,heading,placeholder=true,prompt=label){
 await close();kind=nextKind;const profile=await(kind==="local"?createLayoutLocalProfileV3():createLayoutSharedProfileV3());
 try{const binding=kind==="local"?profile.descriptor():JSON.parse(profile.descriptor_json()),documentJson=JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[{kind:"element",type:heading?"breditor/heading":"breditor/paragraph",entityId:null,properties:proseProperties(heading),children:[]}]}});
  editor=await(kind==="local"?openLocalEditor:openSharedEditor)({host:root,richLanguage:3,toolbar:()=>[],initial:{kind:"document",documentJson},...(placeholder?{placeholder:prompt}:{}),onError:error=>errors.push(String(error)),...(kind==="shared"?{database:`placeholder-browser-${sequence++}`,room:"room",writer:"101"}:{})});
  const point={block:"body",offset:"0",affinity:"after"},selection={kind:"text",anchor:point,focus:point};if(kind==="local")editor.execute({kind:"setSelection",selection});else editor.core.select(selection);editor.focus();
 }finally{if(kind==="local")profile.dispose();else profile.free();}
}
function history(method){if(kind==="local")editor.execute({kind:method});else editor.core[method]();}
globalThis.placeholderExample={open,close,history,label,errors,get editor(){return editor;}};
