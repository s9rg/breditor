import {test,expect} from "@playwright/test";
test.beforeEach(async({page})=>{await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");});

test("local and shared rendering use the same checked link contract in cell text and captions",async({page})=>{
 await page.evaluate(async()=>{
  const {createRichInlinePresentation}=await import("/rich.js"),configuration={format:"breditor/profile-bootstrap",formatVersion:6,schema:{name:"example/local-presentation",version:1},extensions:[{
   id:{name:"example/links",version:1},dependencies:[],conflicts:[],inlineFormats:[{kind:"example/link",revision:1}],inlineFormatPropertyContracts:[{formatKind:"example/link",properties:[
    {name:"example/href",presence:"required",valueType:{kind:"string",minimumUtf8Bytes:1,maximumUtf8Bytes:2048}},
    {name:"example/new-window",presence:"required",valueType:{kind:"boolean"}}
   ]}],inlineFormatToggles:[],inlineFormatSets:[]}]};
  const profile=window.rich.compileRichProfile(window.rich.wasm,JSON.stringify(configuration)),binding=profile.descriptor();
  const presentation=createRichInlinePresentation(profile.inlineCatalogJson(),{recipes:[{formatKind:"breditor/strong",element:"strong"},{formatKind:"example/link",element:"a",classes:["breditor-link"],before:["breditor/strong"],attributes:{kind:"safeLinkV1",hrefProperty:"example/href",openInNewWindowProperty:"example/new-window"}}]});
  const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const owner=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(window.rich.root)})),host=document.createElement("main");document.body.append(host);const errors=[];
  const editor=window.rich.mountRichEditor(host,{core:owner,inlinePresentation:presentation,onError:error=>errors.push(String(error))});
  const before=owner.documentJson(),depth=owner.view().undoDepth;
  editor.execute({kind:"setInlineFormat",data:{change:{kind:"set",formatsJson:JSON.stringify([{type:"example/link",properties:{"example/href":"https://example.test/local","example/new-window":true}}])},targets:[{block:"p",start:"0",end:"1"},{block:"caption",start:"0",end:"1"}]}});
  window.inlineLocal={profile,presentation,owner,editor,host,before,depth,errors};
 });
 for(const block of ["p","caption"]){const link=page.locator(`[data-rich-text="${block}"] a.breditor-link`);await expect(link).toHaveAttribute("href","https://example.test/local");await expect(link).toHaveAttribute("target","_blank");await expect(link).toHaveAttribute("rel","noopener noreferrer");}
 const result=await page.evaluate(()=>{const t=window.inlineLocal,after=t.owner.documentJson(),depth=t.owner.view().undoDepth-t.depth;t.editor.execute({kind:"undo"});const exact=t.owner.documentJson()===t.before,checkpoint=t.editor.checkpointJson();t.editor.dispose();const restored=t.profile.restoreEditor(checkpoint),reopened=window.rich.mountRichEditor(t.host,{core:restored,inlinePresentation:t.presentation});t.profile.dispose();try{reopened.execute({kind:"redo"});return {depth,exact,reloaded:restored.documentJson()===after,links:reopened.surface.querySelectorAll("a.breditor-link").length,errors:t.errors};}finally{reopened.dispose();}});
 expect(result).toEqual({depth:1,exact:true,reloaded:true,links:2,errors:[]});
});

test("local presentation catalog retains the compiled binding and has no executable declarations",async({page})=>{
 const result=await page.evaluate(async()=>{const {createRichInlinePresentation}=await import("/rich.js"),profile=window.rich.compileRichProfile(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:6,schema:{name:"example/catalog-only",version:1},extensions:[]}));try{
  const first=profile.inlineCatalogJson(),second=profile.inlineCatalogJson(),catalog=JSON.parse(first),presentation=createRichInlinePresentation(first,{recipes:[{formatKind:"breditor/strong",element:"strong"}]});
  return {same:first===second,format:catalog.format,formats:catalog.formats,binding:profile.descriptor().schemaFingerprint===presentation.schema.fingerprint,keys:Object.keys(catalog).sort(),abi:window.rich.wasm.breditorWasmAbiVersion()};
 }finally{profile.dispose();}});
 expect(result).toEqual({same:true,format:"breditor/inline-format-catalog",formats:[{kind:"breditor/strong",revision:1,properties:[]}],binding:true,keys:["format","formatVersion","formats","schema"],abi:"5"});
});

test("catalog integer rejection retains strict bounds and records only bounded numeric schema metadata",async({page})=>{
 const result=await page.evaluate(async()=>{
  const {createRichInlinePresentation}=await import("/rich.js"),profile=window.rich.compileRichProfile(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:6,schema:{name:"example/integer-domain",version:1},extensions:[]}));
  try{
   const catalog=JSON.parse(profile.inlineCatalogJson()),manifest={recipes:[{formatKind:"breditor/strong",element:"strong"}]},accepted=[],rejected=[];
   for(const version of [1,2,65536,0xffffffff]){
    const input=structuredClone(catalog);input.schema.version=version;accepted.push(createRichInlinePresentation(JSON.stringify(input),manifest).schema.version);
   }
   for(const version of [0,-1,1.5,0x100000000,"private-catalog-text",null]){
    const input=structuredClone(catalog);input.schema.version=version;
    try{createRichInlinePresentation(JSON.stringify(input),manifest);throw Error("invalid schema version accepted");}catch(error){
     if(!(error instanceof TypeError))throw error;
     const cause=error.cause;rejected.push({message:error.message,format:cause?.format,version:cause?.formatVersion,type:cause?.observedType,decimal:cause?.decimal,bits:cause?.bits,minimum:cause?.minimum,maximum:cause?.maximum,accepted:cause?.originalAccepted,frozen:Object.isFrozen(cause),bounded:JSON.stringify(cause).length<512,redacted:!JSON.stringify(cause).includes("private-catalog-text")});
    }
   }
   return {accepted,rejected};
  }finally{profile.dispose();}
 });
 expect(result.accepted).toEqual([1,2,65536,0xffffffff]);expect(result.rejected).toHaveLength(6);
 for(const failure of result.rejected)expect(failure).toMatchObject({message:"Rich inline presentation: invalid integer domain",format:"breditor/rich-integer-domain-failure",version:1,minimum:"1",maximum:"4294967295",accepted:false,frozen:true,bounded:true,redacted:true});
 expect(result.rejected[4]).toMatchObject({type:"string",decimal:null,bits:null});expect(result.rejected[5]).toMatchObject({type:"object",decimal:null,bits:null});
});

test("local Rust property-state reads preserve exact history and restored pending plain typing",async({page})=>{
 const result=await page.evaluate(()=>{const profile=window.rich.compileRichProfile(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:6,schema:{name:"example/local-state",version:1},extensions:[]})),binding=profile.descriptor();
  const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const owner=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(window.rich.root)}));try{
  const point=offset=>({block:"p",offset:String(offset),affinity:"after"});
  owner.execute({kind:"setSelection",selection:{kind:"text",anchor:point(0),focus:point(4)}});
  const initial=owner.inlineFormatState("breditor/strong");
  owner.execute({kind:"setInlineFormat",data:{change:{kind:"remove",format:"breditor/strong"},targets:[{block:"p",start:"0",end:"1"}]}});
  const partial=owner.inlineFormatState("breditor/strong").state;
  owner.execute({kind:"setSelection",selection:{kind:"text",anchor:point(3),focus:point(3)}});owner.execute({kind:"setPendingFormats",formats:[]});
  const before=owner.checkpointJson(),plain=owner.inlineFormatState("breditor/strong").state,unchanged=owner.checkpointJson()===before;
  let rejected=false;try{owner.inlineFormatState("example/unknown");}catch{rejected=true;}const failedUnchanged=owner.checkpointJson()===before;
  const restored=profile.restoreEditor(before);try{return {initial:initial.state,binding:initial.schema.fingerprint===profile.descriptor().schemaFingerprint,partial,plain,unchanged,rejected,failedUnchanged,reloaded:JSON.stringify(restored.inlineFormatState("breditor/strong"))===JSON.stringify(owner.inlineFormatState("breditor/strong"))};}finally{restored.dispose();}
  }finally{owner.dispose();profile.dispose();}
 });
 expect(result).toEqual({initial:{kind:"uniform",format:{type:"breditor/strong",properties:{}}},binding:true,partial:{kind:"mixed",presentEverywhere:false},plain:{kind:"unset"},unchanged:true,rejected:true,failedUnchanged:true,reloaded:true});
});
