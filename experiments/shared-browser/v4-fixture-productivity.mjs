// Two exclusive writers over one standard shared rich language V4 room (package entry points only), with the
// stock V4 toolbar plus the opt-in formatting-productivity controls (special characters, case change, format
// painter). Rust owns every semantic decision; this fixture only seeds, mounts both panes and exchanges frames.
import {compileStandardRichSharedProfileV4,createRichSharedToolbarV4,createSharedFormattingProductivityToolbar,SharedRichEditor,mountSharedEditor} from "/shared.js";
import {createStandardRichInlinePresentationV1} from "/rich.js";
const run=(text,formats=[])=>({kind:"text",text,formats});
const paragraph=(block,children)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":block},children});
export const strong={type:"breditor/strong",properties:{}};
export function productivityFixtureV4(tools){
 const configuration={format:"breditor/shared-rich-profile",formatVersion:4,schema:{name:"example/shared-v4-productivity-browser",version:1},extensions:[]};
 const profile=compileStandardRichSharedProfileV4(tools.wasm,configuration),descriptor=JSON.parse(profile.descriptor_json());
 const presentation=createStandardRichInlinePresentationV1(profile.inline_catalog_json());
 const children=[paragraph("p",[run("Bold",[strong]),run(" straße and ")]),paragraph("q",[run("the lord of the rings")])];
 const input={format:"breditor/document",formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children}};
 const a=new SharedRichEditor(profile.create(JSON.stringify(input),"101")),b=new SharedRichEditor(profile.join_frame("room","202",a.updateFrame())),errors=[];
 const mount=(core,name)=>{const toolbar=[...createRichSharedToolbarV4(core,presentation),...createSharedFormattingProductivityToolbar(core,presentation)];return mountSharedEditor(document.querySelector(`#${name}`),{core,inlinePresentation:presentation,toolbar,label:`Writer ${name}`,onError:error=>errors.push(String(error))});};
 const da=mount(a,"a"),db=mount(b,"b");
 const range=(anchor,start,focus=anchor,end=start)=>({kind:"text",anchor:{block:anchor,offset:String(start),affinity:"after"},focus:{block:focus,offset:String(end),affinity:"after"}});
 const synchronize=async()=>{const x=a.updateFrame(),y=b.updateFrame();await Promise.all([a.receiveFrame(y),b.receiveFrame(x)]);if(a.documentJson()!==b.documentJson())throw Error("V4 replicas differ");};
 const runs=(core,id)=>JSON.parse(core.documentJson()).root.children.find(node=>node.properties["breditor/block-id"]===id).children;
 return {a,b,da,db,profile,presentation,errors,range,synchronize,runs,dispose(){da.dispose();db.dispose();profile.free();}};
}
