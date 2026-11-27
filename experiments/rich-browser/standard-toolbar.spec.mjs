import {test,expect} from "@playwright/test";
import {standardToolbarChecks} from "./standard-toolbar-checks.mjs";
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const api=await import("/rich.js"),profile=api.compileStandardRichProfileV1(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:6,schema:{name:"example/standard-toolbar",version:1},extensions:[{id:{name:"example/review",version:1},dependencies:[{name:"breditor-inline/standard",version:1}],conflicts:[],inlineFormats:[{kind:"example/review",revision:1}],inlineFormatPropertyContracts:[],inlineFormatToggles:[],inlineFormatSets:[]}]}));
  const descriptor=profile.descriptor(),presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson(),{recipes:[{formatKind:"example/review",element:"mark"}]}),root=structuredClone(window.rich.root);
  const clear=node=>{if(node.kind==="text")node.formats=[];else for(const child of node.children??[])clear(child);};clear(root);
  const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const owner=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:canonical(root)})),host=document.createElement("main"),errors=[];host.id="standard-toolbar";document.body.append(host);
  const editor=api.mountRichEditor(host,{core:owner,inlinePresentation:presentation,toolbar:api.createStandardRichToolbarV1(owner,presentation),onError:error=>errors.push(String(error))});
  const selection=(block,start,end=start,affinity="after")=>({kind:"text",anchor:{block,offset:String(start),affinity},focus:{block,offset:String(end),affinity}});
  window.toolbarTest={api,profile,owner,editor,host,presentation,errors,k:api.standardInlineKindsV1,p:api.standardInlinePropertiesV1,prefix:"rich",selection,
   select:(block,start,end=start,affinity="after")=>editor.execute({kind:"setSelection",selection:selection(block,start,end,affinity)}),span:(anchor,start,focus,end)=>editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:anchor,offset:String(start),affinity:"after"},focus:{block:focus,offset:String(end),affinity:"after"}}}),pending:formats=>editor.execute({kind:"setPendingFormats",formats}),
   set:(block,start,end,type,properties={})=>editor.execute({kind:"setInlineFormat",data:{change:{kind:"set",formatsJson:JSON.stringify([{type,properties}])},targets:[{block,start:String(start),end:String(end)}]}}),
   undo:()=>editor.execute({kind:"undo"}),redo:()=>editor.execute({kind:"redo"}),
   exactReload:before=>{const after=owner.documentJson();editor.execute({kind:"undo"});const undo=owner.documentJson()===before,saved=owner.checkpointJson();editor.dispose();const restored=profile.restoreEditor(saved);try{restored.execute({kind:"redo"});const redo=restored.documentJson()===after;restored.execute({kind:"undo"});return {undo,redo,future:restored.documentJson()===before};}finally{restored.dispose();profile.dispose();}}
  };
 });
});
standardToolbarChecks("rich","#standard-toolbar");

test("bound standard controls reject a second owner before touching its host or either document",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.toolbarTest,other=t.profile.createEditor(t.owner.documentJson()),host=document.createElement("main");host.textContent="Keep host";const before=t.owner.checkpointJson(),second=other.checkpointJson();let rejected="not rejected";try{t.api.mountRichEditor(host,{core:other,inlinePresentation:t.presentation,toolbar:t.api.createStandardRichToolbarV1(t.owner,t.presentation)});}catch(error){rejected=String(error);}try{return {rejected,host:host.textContent,first:t.owner.checkpointJson()===before,second:other.checkpointJson()===second,errors:t.errors};}finally{other.dispose();}});expect(result).toEqual({rejected:expect.stringContaining("different Rust owner"),host:"Keep host",first:true,second:true,errors:[]});
});

// Catalog case inline-highlight-mark@1: a host-configured palette and default colour (docs/CLEAR_INLINE_FORMATTING.md).
test("catalog inline-highlight-mark: configured highlight palette and default colour",async({page})=>{
 await page.evaluate(()=>{const t=window.toolbarTest,host=document.createElement("main");host.id="palette";document.body.append(host);t.owner=t.profile.createEditor(t.owner.documentJson());t.editor.dispose();
  t.editor=t.api.mountRichEditor(host,{core:t.owner,inlinePresentation:t.presentation,toolbar:t.api.createStandardRichToolbarV1(t.owner,t.presentation,{highlight:{color:"#c6f6d5",colors:[{label:"Yellow",color:"#ffff00"},{label:"Green",color:"#c6f6d5"},{label:"Pink",color:"#fed7e2"}]}}),onError:error=>t.errors.push(String(error))});t.editor.execute({kind:"setSelection",selection:t.selection("p",0,1)});});
 await page.locator('#palette [data-rich-action="highlight"]').click();
 await expect(page.locator('#palette [data-rich-text="p"] .breditor-inline-background-color')).toHaveAttribute("style","background-color:#c6f6d5");
 await page.evaluate(()=>{const t=window.toolbarTest;t.editor.execute({kind:"setSelection",selection:t.selection("caption",0,1)});});
 await page.locator('#palette [data-rich-control="background-color"] summary').click();
 const select=page.locator('#palette [data-rich-field="background-color-value"]');
 expect(await select.locator("option").evaluateAll(options=>options.filter(o=>o.value).map(o=>[o.value,o.textContent]))).toEqual([["#ffff00","Yellow"],["#c6f6d5","Green"],["#fed7e2","Pink"]]);
 await select.selectOption("#fed7e2");await select.press("Enter");
 await expect(page.locator('#palette figcaption .breditor-inline-background-color')).toHaveAttribute("style","background-color:#fed7e2");
 expect(await page.evaluate(()=>{const t=window.toolbarTest;t.editor.dispose();return t.errors;})).toEqual([]);
});
