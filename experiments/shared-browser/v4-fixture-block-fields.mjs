// Two exclusive writers over one standard shared rich V4 room (package entry points only), seeded with the
// V4 block fields: a bookmarked heading, internal links (paragraph and section summary), an ordered list and an
// open collapsible section. Rust owns every semantic decision; this fixture builds the seed, mounts both panes
// with the stock V4 toolbar and exchanges frames.
import {compileStandardRichSharedProfileV4,createRichSharedToolbarV4,SharedRichEditor,mountSharedEditor} from "/shared.js";
import {createStandardRichInlinePresentationV1} from "/rich.js";
const run=(text,formats=[])=>({kind:"text",text,formats});
// Seeds are canonical Document V2 JSON: property keys in sorted order.
const sorted=value=>Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:1));
const el=(type,block,children=[],properties={})=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:sorted({"breditor/block-id":block,...properties}),children});
const link=name=>({type:"breditor-inline/link",properties:{"breditor-inline/href":`#${name}`,"breditor-inline/new-window":false}});
export function v4BlockFieldsSeed(){
 const item=(block,text)=>el("list-item",block,[el("paragraph",`${block}-text`,[run(text)])]);
 return [
  el("heading","intro",[run("Introduction")],{"breditor/level":1,"breditor/bookmark":"intro"}),
  el("paragraph","see",[run("See "),run("the intro",[link("intro")])]),
  el("ordered-list","list",[item("one","alpha"),item("two","beta")],{"breditor/start":3}),
  el("details","sec",[el("details-summary","sum",[run("More "),run("top",[link("intro")])]),el("paragraph","body",[run("Hidden body")])],{"breditor/details-open":true}),
  el("paragraph","tail",[run("Tail text")]),
 ];
}
export function v4BlockFieldsFixture(tools,{children=v4BlockFieldsSeed()}={}){
 const configuration={format:"breditor/shared-rich-profile",formatVersion:4,schema:{name:"example/shared-v4-block-fields",version:1},extensions:[]};
 const profile=compileStandardRichSharedProfileV4(tools.wasm,configuration),descriptor=JSON.parse(profile.descriptor_json());
 const presentation=createStandardRichInlinePresentationV1(profile.inline_catalog_json());
 const input={format:"breditor/document",formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children}};
 const a=new SharedRichEditor(profile.create(JSON.stringify(input),"101")),b=new SharedRichEditor(profile.join_frame("room","202",a.updateFrame())),errors=[];
 const mount=(core,name)=>{const toolbar=createRichSharedToolbarV4(core,presentation);return {toolbar,editor:mountSharedEditor(document.querySelector(`#${name}`),{core,inlinePresentation:presentation,toolbar,label:`Writer ${name}`,onError:error=>errors.push(String(error))})};};
 const ma=mount(a,"a"),mb=mount(b,"b");
 const caret=(block,offset=0)=>({kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}});
 const range=(block,start,end)=>({kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}});
 const synchronize=async()=>{const x=a.updateFrame(),y=b.updateFrame();await Promise.all([a.receiveFrame(y),b.receiveFrame(x)]);if(a.documentJson()!==b.documentJson())throw Error("V4 replicas differ");};
 const node=(core,block)=>{const find=n=>n.properties?.["breditor/block-id"]===block?n:n.children?.map(find).find(Boolean);return find(JSON.parse(core.documentJson()).root)??null;};
 const prop=(core,block,name)=>node(core,block)?.properties[`breditor/${name}`]??null;
 const hrefs=(core,block)=>(node(core,block)?.children??[]).flatMap(r=>r.formats??[]).map(f=>f.properties["breditor-inline/href"]).filter(Boolean);
 return {a,b,da:ma.editor,db:mb.editor,toolbarA:ma.toolbar,toolbarB:mb.toolbar,profile,presentation,errors,caret,range,synchronize,node,prop,hrefs,
  dispose(){ma.editor.dispose();mb.editor.dispose();profile.free();}};
}
