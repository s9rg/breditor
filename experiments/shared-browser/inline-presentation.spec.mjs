import {test,expect} from "@playwright/test";
test.beforeEach(async({page})=>{await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");});

test("Rust catalog is exact across native and Wasm and does not alter any writer state",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.sharedTools,v=t.vector.shared_profile,p=t.wasm.SharedRichProfile.from_configuration_json(JSON.stringify(v.configuration));try{const a=new t.SharedRichEditor(p.create(v.input,"101"));try{const before=a.checkpointJson(),catalog=p.inline_catalog_json();return {catalog,expected:v.catalog,unchanged:before===a.checkpointJson(),value:JSON.parse(catalog)};}finally{a.dispose();}}finally{p.free();}});
 expect(result.catalog).toBe(result.expected);expect(result.unchanged).toBe(true);expect(result.value).toMatchObject({format:"breditor/inline-format-catalog",formatVersion:1});
 expect(result.value.formats.find(format=>format.kind==="example/review").properties).toContainEqual({name:"example/resolved",presence:"required",valueType:{kind:"boolean"}});
});

test("one checked renderer presents ordinary marks links color and size in shared table cells and captions",async({page})=>{
 await page.evaluate(async()=>{const {fixture}=await import("/inline-presentation-fixture.mjs"),t=window.inlineTest=fixture(window.sharedTools);
  for(const type of ["breditor/strong","example/italic","example/underline","example/strike","example/code","example/highlight"])t.set(t.a,"p",0,1,type);
  t.set(t.a,"p",0,1,"example/link",{"example/href":"https://example.test/docs?x=1&y=2","example/new-window":true});
  t.set(t.a,"p",0,1,"example/text-color",{"example/rgb24":0x336699});t.set(t.a,"p",0,1,"example/text-size",{"example/size-step":2});
  t.set(t.b,"caption",0,1,"example/superscript");t.set(t.b,"caption",1,1,"example/subscript");await t.synchronize();
 });
 for(const pane of ["#a","#b"]){const block=page.locator(`${pane} [data-rich-text="p"]`);await expect(block.locator("a.breditor-link")).toHaveAttribute("href","https://example.test/docs?x=1&y=2");await expect(block.locator("a")).toHaveAttribute("target","_blank");await expect(block.locator("a")).toHaveAttribute("rel","noopener noreferrer");for(const tag of ["strong","em","u","s","code","mark"])await expect(block.locator(tag)).toHaveText("a");await expect(block.locator(".breditor-text-color")).toHaveAttribute("style","color:#336699");await expect(block.locator(".breditor-text-size")).toHaveAttribute("data-breditor-integer-token","large");await expect(page.locator(`${pane} figcaption sup`)).toHaveText("x");await expect(page.locator(`${pane} figcaption sub`)).toHaveText("y");}
 const result=await page.evaluate(async()=>{const t=window.inlineTest,before=t.a.documentJson(),checkpoint=t.a.checkpointJson();t.a.undo();await t.synchronize();const absent=!document.querySelector('#a .breditor-text-size');t.a.redo();await t.synchronize();const exact=t.a.documentJson()===before,caption=document.querySelector('#a figcaption').textContent;t.da.dispose();const raw=t.profile.restore("room",checkpoint);const restored=new window.sharedTools.SharedRichEditor(raw);try{return {absent,exact,reloaded:restored.documentJson()===before,caption,errors:t.errors};}finally{restored.dispose();t.dispose();}});
 expect(result).toEqual({absent:true,exact:true,reloaded:true,caption:"xy🙂",errors:[]});
});

test("unsafe stored links remain inert and invalid semantic properties cannot publish",async({page})=>{
 const result=await page.evaluate(async()=>{const {fixture}=await import("/inline-presentation-fixture.mjs"),t=fixture(window.sharedTools),results=[];try{
  for(const href of ["javascript:alert(1)","https://user:password@example.test/","https://example.test/\nwrong"]){t.set(t.a,"p",0,1,"example/link",{"example/href":href,"example/new-window":true});const anchor=t.da.surface.querySelector("a");results.push({href:anchor.getAttribute("href"),target:anchor.getAttribute("target"),text:anchor.textContent});}
  const before=t.a.checkpointJson();let rejected=false;try{t.set(t.a,"p",0,1,"example/text-color",{"example/rgb24":0x1000000});}catch{rejected=true;}return {results,rejected,unchanged:t.a.checkpointJson()===before,errors:t.errors};
 }finally{t.dispose();}});
 expect(result).toEqual({results:Array.from({length:3},()=>({href:null,target:null,text:"a"})),rejected:true,unchanged:true,errors:[]});
});

test("invalid and foreign presentations reject before changing host DOM or Rust history",async({page})=>{
 const result=await page.evaluate(async()=>{const {fixture}=await import("/inline-presentation-fixture.mjs"),{createRichInlinePresentation}=await import("/rich.js"),t=fixture(window.sharedTools),errors=[];try{
  for(const change of [m=>m.recipes.pop(),m=>m.recipes.push(m.recipes[0]),m=>m.recipes[0].element="script",m=>m.recipes[0].before=["example/not-declared"],m=>m.recipes[0].before=["example/link"]]){const m=structuredClone(t.manifest);change(m);try{createRichInlinePresentation(t.catalog,m);}catch{errors.push(true);}}
  const catalog=JSON.parse(t.catalog);catalog.schema.fingerprint="sha256:"+"0".repeat(64);const foreign=createRichInlinePresentation(JSON.stringify(catalog),t.manifest),host=document.createElement("section");host.innerHTML="<p>Host stays intact</p>";document.body.append(host);const before=t.a.checkpointJson();
  for(const inlinePresentation of [foreign,{...t.presentation}]){try{window.sharedTools.mountSharedEditor(host,{core:t.a,inlinePresentation});}catch{errors.push(true);}}
  return {rejected:errors.length,host:host.innerHTML,unchanged:before===t.a.checkpointJson(),errors:t.errors};
 }finally{t.dispose();}});
 expect(result).toEqual({rejected:7,host:"<p>Host stays intact</p>",unchanged:true,errors:[]});
});

test("catalog admission is bounded and canonical and presentation declarations are detached",async({page})=>{
 const result=await page.evaluate(async()=>{const {fixture}=await import("/inline-presentation-fixture.mjs"),{createRichInlinePresentation}=await import("/rich.js"),t=fixture(window.sharedTools);try{
  let rejected=0;
  for(const change of [c=>c.formatVersion=2,c=>c.extra=true,c=>c.formats.reverse(),c=>c.formats.push(c.formats[0]),c=>c.formats[0].revision=0,c=>c.schema.fingerprint="wrong",c=>c.formats.find(f=>f.kind==="example/link").properties.reverse(),c=>c.formats.find(f=>f.kind==="example/link").properties[0].valueType.maximumUtf8Bytes=1024]){const c=JSON.parse(t.catalog);change(c);try{createRichInlinePresentation(JSON.stringify(c),t.manifest);}catch{rejected++;}}
  try{createRichInlinePresentation(" ".repeat(2*1024*1024+1),t.manifest);}catch{rejected++;}
  let getterCalls=0;const accessor={};Object.defineProperty(accessor,"recipes",{enumerable:true,get(){getterCalls++;return t.manifest.recipes;}});try{createRichInlinePresentation(t.catalog,accessor);}catch{rejected++;}
  t.manifest.recipes.find(recipe=>recipe.formatKind==="example/link").attributes.hrefProperty="example/wrong";
  t.set(t.a,"p",0,1,"example/link",{"example/href":"https://example.test/detached","example/new-window":false});
  return {rejected,getterCalls,frozen:Object.isFrozen(t.presentation)&&Object.isFrozen(t.presentation.schema)&&Object.isFrozen(t.presentation.recipesOuterToInner),href:t.da.surface.querySelector("a").getAttribute("href"),errors:t.errors};
 }finally{t.dispose();}});
 expect(result).toEqual({rejected:10,getterCalls:0,frozen:true,href:"https://example.test/detached",errors:[]});
});
