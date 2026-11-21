// Two exclusive writers over one standard shared rich language V4 room (package entry points only), with the
// stock V4 toolbar. Rust owns every semantic decision; this fixture only builds the seed document, mounts both
// panes and exchanges frames. Used by v4-structure.spec.mjs (sections, page breaks, table captions).
import {compileStandardRichSharedProfileV4,createRichSharedToolbarV4,SharedRichEditor,mountSharedEditor} from "/shared.js";
import {createStandardRichInlinePresentationV1} from "/rich.js";
const text=value=>value?[{kind:"text",text:value,formats:[]}]:[];
// Properties are emitted in canonical (sorted) key order: the shared document codec admits only canonical JSON.
const sorted=value=>Object.fromEntries(Object.entries(value).sort(([x],[y])=>x<y?-1:x>y?1:0));
const element=(type,block,children=[],extra={})=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:sorted({"breditor/block-id":block,...extra}),children});
export const paragraph=(block,value="")=>element("paragraph",block,text(value));
export const section=(block,summary,body,open=true)=>element("details",block,[element("details-summary",`${block}-sum`,text(summary)),...body],open?{"breditor/details-open":true}:{});
export const pageBreak=block=>element("page-break",block);
export function table(block,caption){
 const cell=(row,column)=>element("table-cell",`${block}-${row}-${column}`,[paragraph(`${block}-${row}-${column}-p`,`${row}${column}`)],{"breditor/column-id":column,"breditor/header":false});
 const row=id=>element("table-row",`${block}-${id}`,[cell(id,"c1"),cell(id,"c2")],{"breditor/row-id":id});
 return element("table",block,[row("r1"),row("r2"),...(caption?[caption]:[])],{"breditor/table-id":`${block}-t`,"breditor/columns":[{id:"c1",width:160},{id:"c2",width:160}],"breditor/merges":[],"breditor/retracted-merges":[]});
}
export function structureFixtureV4(tools,{children}){
 const configuration={format:"breditor/shared-rich-profile",formatVersion:4,schema:{name:"example/shared-v4-structure-browser",version:1},extensions:[]};
 const profile=compileStandardRichSharedProfileV4(tools.wasm,configuration),descriptor=JSON.parse(profile.descriptor_json());
 const presentation=createStandardRichInlinePresentationV1(profile.inline_catalog_json());
 const input={format:"breditor/document",formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children}};
 const a=new SharedRichEditor(profile.create(JSON.stringify(input),"101")),b=new SharedRichEditor(profile.join_frame("room","202",a.updateFrame())),errors=[];
 const mount=(core,name)=>{const toolbar=createRichSharedToolbarV4(core,presentation);return {toolbar,editor:mountSharedEditor(document.querySelector(`#${name}`),{core,inlinePresentation:presentation,toolbar,label:`Writer ${name}`,onError:error=>errors.push(String(error))})};};
 const ma=mount(a,"a"),mb=mount(b,"b");
 const caret=(block,offset=0)=>({kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}});
 const synchronize=async()=>{const x=a.updateFrame(),y=b.updateFrame();await Promise.all([a.receiveFrame(y),b.receiveFrame(x)]);if(a.documentJson()!==b.documentJson())throw Error("V4 replicas differ");};
 // Compact outline: type#id['text'] with children, read from the admitted Rust document (never the DOM).
 const outline=core=>{const walk=node=>{if(node.kind==="text")return null;const id=node.properties["breditor/block-id"],inner=node.children.map(walk).filter(Boolean),own=node.children.filter(child=>child.kind==="text").map(child=>child.text).join("");return `${node.type.replace("breditor/","")}${id?`#${id}`:""}${own?`['${own}']`:""}${inner.length?`[${inner.join(",")}]`:""}`;};return walk(JSON.parse(core.documentJson()).root);};
 return {a,b,da:ma.editor,db:mb.editor,toolbarA:ma.toolbar,toolbarB:mb.toolbar,profile,presentation,errors,caret,synchronize,outline,
  dispose(){ma.editor.dispose();mb.editor.dispose();profile.free();}};
}
