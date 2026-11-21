// Two exclusive writers over one standard structural V2 room (package entry points only). Rust owns every
// semantic decision; this fixture only builds the seed document, mounts both panes and exchanges frames.
import {compileStandardStructuralSharedProfileV2,createStructuralSharedToolbarV2,SharedRichEditor,mountSharedEditor} from "/shared.js";
import {createStandardRichInlinePresentationV1} from "/rich.js";
const text=value=>value?[{kind:"text",text:value,formats:[]}]:[];
export const paragraph=(block,value="")=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":block},children:text(value)});
export const codeBlock=(block,value="")=>({kind:"element",type:"breditor/code-block",entityId:null,properties:{"breditor/block-id":block},children:text(value)});
export function structuralFixture(tools,{children,inputRules,ui,legalListNumbering}={}){
 const configuration={format:"breditor/shared-rich-profile",formatVersion:2,schema:{name:"example/shared-structural-browser",version:1},extensions:[]};
 const profile=compileStandardStructuralSharedProfileV2(tools.wasm,configuration),descriptor=JSON.parse(profile.descriptor_json());
 const presentation=createStandardRichInlinePresentationV1(profile.inline_catalog_json());
 const input={format:"breditor/document",formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children}};
 const a=new SharedRichEditor(profile.create(JSON.stringify(input),"101")),b=new SharedRichEditor(profile.join_frame("room","202",a.updateFrame())),errors=[];
 const mount=(core,name)=>{const toolbar=createStructuralSharedToolbarV2(core,presentation);return {toolbar,editor:mountSharedEditor(document.querySelector(`#${name}`),{core,inlinePresentation:presentation,toolbar,label:`Writer ${name}`,...(inputRules?{inputRules}:{}),...(ui?{ui}:{}),...(legalListNumbering?{legalListNumbering}:{}),onError:error=>errors.push(String(error))})};};
 const ma=mount(a,"a"),mb=mount(b,"b");
 const caret=(block,offset=0)=>({kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}});
 const range=(block,start,end)=>({kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}});
 const synchronize=async()=>{const x=a.updateFrame(),y=b.updateFrame();await Promise.all([a.receiveFrame(y),b.receiveFrame(x)]);if(a.documentJson()!==b.documentJson())throw Error("Structural replicas differ");};
 // Compact outline: type#id['text'] with children, read from the admitted Rust document (never the DOM).
 const outline=core=>{const walk=node=>{if(node.kind==="text")return null;const id=node.properties["breditor/block-id"],inner=node.children.map(walk).filter(Boolean),own=node.children.filter(child=>child.kind==="text").map(child=>child.text).join("");return `${node.type.replace("breditor/","")}${id?`#${id}`:""}${own?`['${own}']`:""}${inner.length?`[${inner.join(",")}]`:""}`;};return walk(JSON.parse(core.documentJson()).root);};
 const textOf=(core,block)=>{const find=node=>node.properties?.["breditor/block-id"]===block?node:node.children?.map(find).find(Boolean);const node=find(JSON.parse(core.documentJson()).root);return node?node.children.filter(child=>child.kind==="text").map(child=>child.text).join(""):null;};
 return {a,b,da:ma.editor,db:mb.editor,toolbarA:ma.toolbar,toolbarB:mb.toolbar,profile,presentation,errors,caret,range,synchronize,outline,textOf,
  dispose(){ma.editor.dispose();mb.editor.dispose();profile.free();}};
}
