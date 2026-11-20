// Two exclusive writers over one standard shared rich V4 room (package entry points only). Rust owns every
// semantic decision; this fixture only builds the seed document, mounts both panes with the stock V4 toolbar
// and exchanges frames.
import {compileStandardRichSharedProfileV4,createRichSharedToolbarV4,SharedRichEditor,mountSharedEditor} from "/shared.js";
import {createStandardRichInlinePresentationV1} from "/rich.js";
const run=(text,formats=[])=>({kind:"text",text,formats});
export const paragraph=(block,...runs)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":block},children:runs.map(value=>typeof value==="string"?run(value):value)});
export const mention=(label,id,kind="user")=>run(`@${label}`,[{type:"breditor/mention",properties:{"breditor/mention-id":id,"breditor/mention-kind":kind,"breditor/mention-label":label}}]);
export const tagged=(text,tag)=>run(text,[{type:"breditor/text-language",properties:{"breditor/language-tag":tag}}]);
export function image(block,{link,newWindow=false,decorative=false}={}){
 const properties={"breditor/block-id":block,"breditor/image-id":`${block}-image`,"breditor/asset-id":`${block}-asset`,"breditor/asset-generation":"g1","breditor/decorative":decorative,"breditor/alt-text":decorative?"":"Chart"};
 if(link){properties["breditor/image-href"]=link;if(newWindow)properties["breditor/image-link-new-window"]=true;}
 // Canonical document JSON orders property names.
 return {kind:"element",type:"breditor/image",entityId:null,properties:Object.fromEntries(Object.entries(properties).sort(([a],[b])=>a<b?-1:1)),children:[]};
}
export function v4InlineFixture(tools,{children}){
 const configuration={format:"breditor/shared-rich-profile",formatVersion:4,schema:{name:"example/shared-v4-inline-browser",version:1},extensions:[]};
 const profile=compileStandardRichSharedProfileV4(tools.wasm,configuration),descriptor=JSON.parse(profile.descriptor_json());
 const presentation=createStandardRichInlinePresentationV1(profile.inline_catalog_json());
 const input={format:"breditor/document",formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children}};
 const a=new SharedRichEditor(profile.create(JSON.stringify(input),"101")),b=new SharedRichEditor(profile.join_frame("room","202",a.updateFrame())),errors=[];
 const mount=(core,name)=>{const toolbar=createRichSharedToolbarV4(core,presentation);return {toolbar,editor:mountSharedEditor(document.querySelector(`#${name}`),{core,inlinePresentation:presentation,toolbar,label:`Writer ${name}`,onError:error=>errors.push(String(error))})};};
 const ma=mount(a,"a"),mb=mount(b,"b");
 const caret=(block,offset=0)=>({kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}});
 const range=(block,start,end)=>({kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}});
 const synchronize=async()=>{const x=a.updateFrame(),y=b.updateFrame();await Promise.all([a.receiveFrame(y),b.receiveFrame(x)]);if(a.documentJson()!==b.documentJson())throw Error("V4 replicas differ");};
 const find=(core,block)=>{const walk=node=>node.properties?.["breditor/block-id"]===block?node:node.children?.map(walk).find(Boolean);return walk(JSON.parse(core.documentJson()).root);};
 // Admitted Rust runs of one block as [text, mention label|null, language|null].
 const runs=(core,block)=>find(core,block).children.map(child=>[child.text,child.formats.find(f=>f.type==="breditor/mention")?.properties["breditor/mention-label"]??null,child.formats.find(f=>f.type==="breditor/text-language")?.properties["breditor/language-tag"]??null]);
 const link=(core,block)=>{const p=find(core,block).properties;return [p["breditor/image-href"]??null,p["breditor/image-link-new-window"]??null];};
 return {a,b,da:ma.editor,db:mb.editor,toolbarA:ma.toolbar,toolbarB:mb.toolbar,profile,presentation,errors,caret,range,synchronize,find,runs,link,
  dispose(){ma.editor.dispose();mb.editor.dispose();profile.free();}};
}
