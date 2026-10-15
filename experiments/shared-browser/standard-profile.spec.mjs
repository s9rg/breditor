import {test,expect} from "@playwright/test";
test.beforeEach(async({page})=>{await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");});

test("standard Rust profile renders ordinary marks typed colors size fonts and linked captions",async({page})=>{
 await page.evaluate(async()=>{const {fixture}=await import("/standard-inline-fixture.mjs"),t=window.standardTest=fixture(window.sharedTools),k=t.kinds,p=t.properties;
  const marks=[k.strong,k.italic,k.underline,k.strike,k.code].map(kind=>t.command("p",0,1,kind));
  t.a.dispatch({commands:[...marks,t.command("p",0,1,k.textColor,{[p.rgb24]:0x336699}),t.command("p",0,1,k.backgroundColor,{[p.rgb24]:0xffcc00}),t.command("p",0,1,k.textSize,{[p.pixels]:24}),t.command("p",0,1,k.fontFamily,{[p.family]:3}),t.command("caption",0,1,k.link,{[p.href]:"https://example.test/caption",[p.newWindow]:true}),t.command("caption",0,1,k.superscript),t.command("caption",1,1,k.subscript)]});await t.synchronize();
 });
 for(const pane of ["#a","#b"]){const block=page.locator(`${pane} [data-rich-text="p"]`);for(const tag of ["strong","em","u","s","code"])await expect(block.locator(tag)).toHaveText("a");await expect(block.locator(".breditor-inline-text-color")).toHaveAttribute("style","color:#336699");await expect(block.locator(".breditor-inline-background-color")).toHaveAttribute("style","background-color:#ffcc00");await expect(block.locator(".breditor-inline-text-size")).toHaveCSS("font-size","24px");await expect(block.locator(".breditor-inline-font-family")).toHaveCSS("font-family",/Georgia/);const link=page.locator(`${pane} figcaption a`);await expect(link).toHaveAttribute("href","https://example.test/caption");await expect(link).toHaveAttribute("rel","noopener noreferrer");await expect(link.locator("sup")).toHaveText("x");await expect(page.locator(`${pane} figcaption sub`)).toHaveText("y");}
 const result=await page.evaluate(async()=>{const t=window.standardTest,after=t.a.documentJson();t.a.undo();await t.synchronize();const removed=!t.da.surface.querySelector(".breditor-inline-text-color");t.a.redo();await t.synchronize();const result={removed,exact:t.a.documentJson()===after,errors:t.errors};t.dispose();return result;});expect(result).toEqual({removed:true,exact:true,errors:[]});
});

test("standard pending formats survive trusted typing offline merge selective Undo and exact restart",async({page})=>{
 await page.evaluate(async()=>{const {fixture}=await import("/standard-inline-fixture.mjs"),t=window.standardTest=fixture(window.sharedTools),k=t.kinds,p=t.properties;t.da.select(t.caret("p",1));t.a.setPendingFormats([{type:k.link,properties:{[p.href]:"https://example.test/typed",[p.newWindow]:false}},{type:k.textColor,properties:{[p.rgb24]:0x123456}}]);t.da.focus();});
 await page.keyboard.type("Q");
 await page.evaluate(()=>{const t=window.standardTest;t.db.select(t.caret("caption",0));t.b.setPendingFormats([{type:t.kinds.textSize,properties:{[t.properties.pixels]:32}}]);t.db.focus();});await page.keyboard.type("R");
 const result=await page.evaluate(async()=>{const t=window.standardTest;try{await t.synchronize();const after=t.a.documentJson(),typed=t.da.surface.querySelector('a[href="https://example.test/typed"]').textContent,remote=t.da.surface.querySelector('figcaption .breditor-inline-text-size').textContent;t.a.undo();await t.synchronize();const undo={p:t.da.surface.querySelector('[data-rich-text="p"]').textContent,caption:t.da.surface.querySelector("figcaption").textContent};t.a.redo();await t.synchronize();const redone=t.a.documentJson()===after,saved=t.a.checkpointJson();t.da.dispose();const restored=new window.sharedTools.SharedRichEditor(t.profile.restore("room",saved));try{const equal=restored.documentJson()===after;restored.undo();restored.redo();return {typed,remote,undo,redone,equal,future:restored.documentJson()===after,errors:t.errors};}finally{restored.dispose();}}finally{t.dispose();}});
 expect(result).toEqual({typed:"Q",remote:"R",undo:{p:"a🙂b",caption:"Rxy🙂"},redone:true,equal:true,future:true,errors:[]});
});

test("standard profile composes custom recipes while incomplete or changed preset contracts reject",async({page})=>{
 const result=await page.evaluate(async()=>{const {fixture}=await import("/standard-inline-fixture.mjs"),{createStandardRichInlinePresentationV1}=await import("/rich.js"),t=fixture(window.sharedTools,true);try{
  t.a.dispatch({commands:[t.command("p",0,1,"example/review")]});let rejected=0;
  try{window.sharedTools.compileSharedProfile(window.sharedTools.wasm,t.configuration);}catch{rejected++;}
  try{createStandardRichInlinePresentationV1(t.catalog);}catch{rejected++;}
  const changed=JSON.parse(t.catalog);changed.formats.find(f=>f.kind===t.kinds.italic).revision=2;try{createStandardRichInlinePresentationV1(JSON.stringify(changed),t.additional);}catch{rejected++;}
  let getters=0;const extra={get recipes(){getters++;return t.additional.recipes;}};try{createStandardRichInlinePresentationV1(t.catalog,extra);}catch{rejected++;}
  return {formats:JSON.parse(t.catalog).formats.length,custom:t.da.surface.querySelector("mark").textContent,rejected,getters,errors:t.errors};
 }finally{t.dispose();}});expect(result).toEqual({formats:13,custom:"a",rejected:4,getters:0,errors:[]});
});

test("invalid standard values reject an entire group and stored unsafe links stay inert",async({page})=>{
 const result=await page.evaluate(async()=>{const {fixture}=await import("/standard-inline-fixture.mjs"),t=fixture(window.sharedTools),k=t.kinds,p=t.properties;try{
  t.a.dispatch({commands:[t.command("caption",0,1,k.link,{[p.href]:"javascript:kept-as-data",[p.newWindow]:true})]});const anchor=t.da.surface.querySelector("a"),inert=anchor.getAttribute("href")===null&&anchor.getAttribute("target")===null;let rejected=0;
  const before=t.a.checkpointJson();for(const bad of [t.command("p",0,1,k.textSize,{[p.pixels]:97}),t.command("p",0,1,k.textColor,{[p.rgb24]:"red"}),t.command("p",0,1,k.link,{[p.href]:"https://example.test/"}),t.command("p",0,1,k.fontFamily,{[p.family]:5})]){try{t.a.dispatch({commands:[t.command("p",0,1,k.italic),bad]});}catch{rejected++;}}
  return {inert,kept:t.a.documentJson().includes("javascript:kept-as-data"),rejected,unchanged:t.a.checkpointJson()===before,errors:t.errors};
 }finally{t.dispose();}});expect(result).toEqual({inert:true,kept:true,rejected:4,unchanged:true,errors:[]});
});
