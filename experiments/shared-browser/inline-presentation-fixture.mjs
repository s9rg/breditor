// Application declarations use package entry points; Rust still compiles every semantic format.
import {createRichInlinePresentation} from "/rich.js";
import {SharedRichEditor,mountSharedEditor} from "/shared.js";
export function fixture(tools){
 const free=[['italic','em'],['underline','u'],['strike','s'],['code','code'],['highlight','mark'],['subscript','sub'],['superscript','sup']];
 const formats=free.map(([key])=>({kind:`example/${key}`,revision:1,properties:[]}));
 formats.push({kind:"example/link",revision:1,properties:[
  {name:"example/href",presence:"required",valueType:{kind:"string",minimumUtf8Bytes:1,maximumUtf8Bytes:2048}},
  {name:"example/new-window",presence:"required",valueType:{kind:"boolean"}}
 ]},{kind:"example/text-color",revision:1,properties:[{name:"example/rgb24",presence:"required",valueType:{kind:"integer",minimum:0,maximum:0xffffff}}]},
 {kind:"example/text-size",revision:1,properties:[{name:"example/size-step",presence:"required",valueType:{kind:"integer",minimum:1,maximum:3}}]});
 const configuration={format:"breditor/shared-rich-profile",formatVersion:1,schema:{name:"example/complete-inline",version:1},extensions:[{id:{name:"example/inline",version:1},dependencies:[],conflicts:[],formats}]};
 const profile=tools.wasm.SharedRichProfile.from_configuration_json(JSON.stringify(configuration)),descriptor=JSON.parse(profile.descriptor_json()),catalog=profile.inline_catalog_json();
 const manifest={recipes:[{formatKind:"breditor/strong",element:"strong"},...free.map(([key,element])=>({formatKind:`example/${key}`,element})),
  {formatKind:"example/link",element:"a",classes:["breditor-link"],before:["breditor/strong",...formats.filter(format=>format.kind!=="example/link").map(format=>format.kind)],attributes:{kind:"safeLinkV1",hrefProperty:"example/href",openInNewWindowProperty:"example/new-window"}},
  {formatKind:"example/text-color",element:"span",classes:["breditor-text-color"],attributes:{kind:"safeTextColorV1"}},
  {formatKind:"example/text-size",element:"span",classes:["breditor-text-size"],attributes:{kind:"safeIntegerTokenV1",propertyName:"example/size-step",tokens:[{value:1,token:"small"},{value:2,token:"large"},{value:3,token:"huge"}]}}
 ]};
 const presentation=createRichInlinePresentation(catalog,manifest);
 const input=JSON.parse(tools.vector.rich_local_input);input.schema=descriptor.schema;input.schemaFingerprint=descriptor.schemaFingerprint;
 const clear=node=>{if(node.kind==="text")node.formats=[];else for(const child of node.children??[])clear(child);};clear(input.root);
 const a=new SharedRichEditor(profile.create(JSON.stringify(input),"101")),b=new SharedRichEditor(profile.join_frame("room","202",a.updateFrame())),errors=[];
 const da=mountSharedEditor(document.querySelector("#a"),{core:a,inlinePresentation:presentation,onError:error=>errors.push(String(error))}),db=mountSharedEditor(document.querySelector("#b"),{core:b,inlinePresentation:presentation,onError:error=>errors.push(String(error))});
 const set=(core,block,offset,length,type,properties={},enabled=true)=>core.dispatch({commands:[{kind:"set_format",data:{block,offset,length,format:{type,properties},enabled}}]});
 const synchronize=async()=>{const x=a.updateFrame(),y=b.updateFrame();await a.receiveFrame(y);await b.receiveFrame(x);};
 return {a,b,da,db,profile,presentation,catalog,manifest,configuration,input,errors,set,synchronize,dispose(){da.dispose();db.dispose();profile.free();}};
}
