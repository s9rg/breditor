// Package entry points only; standard semantics are declared by Rust, not this fixture.
import {compileStandardSharedProfileV1,SharedRichEditor,mountSharedEditor,createStandardSharedToolbarV1} from "/shared.js";
import {createStandardRichInlinePresentationV1,standardInlineKindsV1 as kinds,standardInlinePropertiesV1 as properties} from "/rich.js";
export function fixture(tools,application=false,standardToolbar=false){
 const configuration={format:"breditor/shared-rich-profile",formatVersion:1,schema:{name:"example/standard-browser",version:1},extensions:application?[{id:{name:"example/review",version:1},dependencies:[{name:"breditor-inline/standard",version:1}],conflicts:[],formats:[{kind:"example/review",revision:1,properties:[]}]}]:[]};
 const profile=compileStandardSharedProfileV1(tools.wasm,configuration),descriptor=JSON.parse(profile.descriptor_json()),catalog=profile.inline_catalog_json();
 const additional=application?{recipes:[{formatKind:"example/review",element:"mark"}]}:undefined;
 const presentation=createStandardRichInlinePresentationV1(catalog,additional),input=JSON.parse(tools.vector.rich_local_input);input.schema=descriptor.schema;input.schemaFingerprint=descriptor.schemaFingerprint;
 const clear=node=>{if(node.kind==="text")node.formats=[];else for(const child of node.children??[])clear(child);};clear(input.root);
 const a=new SharedRichEditor(profile.create(JSON.stringify(input),"101")),b=new SharedRichEditor(profile.join_frame("room","202",a.updateFrame())),errors=[];
 const controls=core=>standardToolbar?{toolbar:createStandardSharedToolbarV1(core,presentation)}:{};
 const da=mountSharedEditor(document.querySelector("#a"),{core:a,inlinePresentation:presentation,...controls(a),onError:error=>errors.push(String(error))}),db=mountSharedEditor(document.querySelector("#b"),{core:b,inlinePresentation:presentation,...controls(b),onError:error=>errors.push(String(error))});
 const command=(block,offset,length,type,properties={},enabled=true)=>({kind:"set_format",data:{block,offset,length,format:{type,properties},enabled}});
 const caret=(block,offset=0,affinity="after")=>({kind:"text",anchor:{block,offset:String(offset),affinity},focus:{block,offset:String(offset),affinity}});
 const synchronize=async()=>{const x=a.updateFrame(),y=b.updateFrame();await a.receiveFrame(y);await b.receiveFrame(x);if(a.documentJson()!==b.documentJson())throw Error("Standard replicas differ");};
 return {a,b,da,db,profile,catalog,presentation,configuration,additional,input,errors,kinds,properties,command,caret,synchronize,dispose(){da.dispose();db.dispose();profile.free();}};
}
