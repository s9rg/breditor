import {test,expect} from "@playwright/test";
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(()=>{
  const profile=window.rich.compileRichProfile(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:6,schema:{name:"example/rich-dom",version:1},extensions:[]}));
  const binding=profile.descriptor(),canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const core=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(window.rich.root)}));
  const p=(block,text)=>({kind:"paragraph",block,text,formatsJson:"[]"});
  core.execute({kind:"insertBlocks",data:{position:{parent:{kind:"document"},before:"table-block"},blocks:[p("intro","Intro 🙂")]}});
  core.execute({kind:"insertBlocks",data:{position:{parent:{kind:"document"},before:null},blocks:[p("footer","Footer")]}});
  core.execute({kind:"insertTableRow",data:{table:"t",before:null,row:{block:"row2",id:"r2",cells:[{block:"cell2",column:"c",header:false,body:[p("p2","third")]}]}}});
  core.execute({kind:"insertTableColumn",data:{table:"t",before:null,column:{id:"c2",width:160},cells:[{row:"r",cell:{block:"cell12",column:"c2",header:false,body:[p("p12","second")]}},{row:"r2",cell:{block:"cell22",column:"c2",header:false,body:[p("p22","fourth")]}}]}});
  const caret=(block,offset)=>({kind:"setSelection",selection:{kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}}});
  core.execute(caret("intro",8));
  const root=document.createElement("main");root.id="editor-host";document.body.append(root);
  window.errors=[];
  const options={core,onError:error=>window.errors.push(String(error)),resolveAsset:()=>"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="};
  window.core=core;window.profile=profile;window.dom=window.rich.mountRichEditor(root,options);window.dom.focus();window.caret=caret;
  // A browser normally populates a native Paste event's read store. For these
  // explicitly synthetic event-path tests, populate the event's actual store;
  // Firefox does not expose the constructor-supplied DataTransfer by identity.
  window.clipboardEvent=(type,source=new DataTransfer())=>{
   const event=new ClipboardEvent(type,{bubbles:true,cancelable:true,clipboardData:source});
   if(event.clipboardData!==source)for(const flavor of source.types)event.clipboardData.setData(flavor,source.getData(flavor));
   window.dom.surface.dispatchEvent(event);return event;
  };
 });
});
const block=(page,id)=>page.locator(`[data-rich-text="${id}"]`);

test("trusted typing and backward deletion restore the actual caret with undo redo",async({page})=>{
 await page.keyboard.type("Z");await expect(block(page,"intro")).toHaveText("Intro 🙂Z");
 await page.keyboard.press("Backspace");await expect(block(page,"intro")).toHaveText("Intro 🙂");
 await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(block(page,"intro")).toHaveText("Intro 🙂Z");
 expect(await page.evaluate(()=>window.dom.view().selection)).toMatchObject({kind:"text",anchor:{offset:"9"},focus:{offset:"9"}});
 await page.getByRole("button",{name:"Redo",exact:true}).click();await expect(block(page,"intro")).toHaveText("Intro 🙂");
 expect(await page.evaluate(()=>window.errors)).toEqual([]);
});
test("forward deletion and paragraph Enter have exact structural history",async({page})=>{
 await page.evaluate(()=>window.dom.execute(window.caret("intro",1)));
 await page.keyboard.press("Delete");await expect(block(page,"intro")).toHaveText("Itro 🙂");
 await page.keyboard.press("Meta+z");await expect(block(page,"intro")).toHaveText("Intro 🙂");
 expect(await page.evaluate(()=>window.dom.view().selection.focus.offset)).toBe("1");
 await page.evaluate(()=>window.dom.execute(window.caret("intro",8)));
 const before=await page.evaluate(()=>window.core.documentJson());
 await page.keyboard.press("Enter");expect(await page.evaluate(()=>window.dom.view().selection.focus.block)).not.toBe("intro");
 await page.keyboard.press("Meta+z");expect(await page.evaluate(()=>window.core.documentJson())).toBe(before);
 await page.keyboard.press("Meta+Shift+z");await page.keyboard.type("new");await expect(page.locator(".breditor-rich-surface")).toContainText("new");
 expect(await page.evaluate(()=>window.errors)).toEqual([]);
});

test("Enter replaces a selected span with one exact undo unit",async({page})=>{
 const before=await page.evaluate(()=>{window.dom.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"intro",offset:"1",affinity:"after"},focus:{block:"intro",offset:"5",affinity:"after"}}});return {document:window.core.documentJson(),depth:window.dom.view().undoDepth};});
 await page.keyboard.press("Enter");await expect.poll(()=>page.evaluate(()=>window.dom.view().undoDepth)).toBe(before.depth+1);
 await expect(block(page,"intro")).toHaveText("I");await page.keyboard.press("Meta+z");expect(await page.evaluate(()=>window.core.documentJson())).toBe(before.document);
 expect(await page.evaluate(()=>window.dom.view().selection)).toMatchObject({anchor:{offset:"1"},focus:{offset:"5"}});
});

test("mixed root list conversion retains tables images and every cell body",async({page})=>{
 await page.keyboard.press("Meta+a");const before=await page.evaluate(()=>window.core.documentJson());
 await page.getByRole("button",{name:"Bullet list",exact:true}).click();await expect(page.locator(".breditor-rich-surface ul > li")).toHaveCount(2);
 await expect(page.locator("[data-rich-cell]")).toHaveCount(4);await expect(page.locator("figure")).toHaveCount(1);await expect(block(page,"p22")).toHaveText("fourth");
 await page.getByRole("button",{name:"Undo",exact:true}).click();expect(await page.evaluate(()=>window.core.documentJson())).toBe(before);expect(await page.evaluate(()=>window.errors)).toEqual([]);
});
test("toolbar bold, headings and nested list controls dispatch to the real owner",async({page})=>{
 await page.getByRole("button",{name:"Bold",exact:true}).click();await page.keyboard.type("B");await expect(block(page,"intro").locator("strong")).toHaveText("B");
 await page.getByRole("button",{name:"Heading 2",exact:true}).click();await expect(page.locator('h2[data-rich-text="intro"]')).toBeVisible();
 await page.getByRole("button",{name:"Bullet list",exact:true}).click();await expect(page.locator(".breditor-rich-surface ul > li")).toHaveCount(1);
 await page.keyboard.press("Enter");await page.keyboard.type("second item");await expect(page.locator(".breditor-rich-surface ul > li")).toHaveCount(2);
 await page.getByRole("button",{name:"Indent",exact:true}).click();await expect(page.locator(".breditor-rich-surface ul ul > li")).toHaveCount(1);
 await page.getByRole("button",{name:"Outdent",exact:true}).click();await expect(page.locator(".breditor-rich-surface ul > li")).toHaveCount(2);
 await page.getByRole("button",{name:"Numbered list",exact:true}).click();await expect(page.locator(".breditor-rich-surface ol > li")).toHaveCount(2);
 await page.getByRole("button",{name:"Remove list",exact:true}).click();await expect(page.locator(".breditor-rich-surface ol")).toHaveCount(0);
 expect(await page.evaluate(()=>window.errors)).toEqual([]);
});
test("cell text and caption typing share the Rust input and undo contracts",async({page})=>{
 await page.evaluate(()=>window.dom.execute(window.caret("p",4)));await page.keyboard.type("!");await expect(block(page,"p")).toHaveText("a🙂b!");
 await page.keyboard.press("Meta+z");await expect(block(page,"p")).toHaveText("a🙂b");
 await page.evaluate(()=>window.dom.execute(window.caret("caption",4)));await page.keyboard.type("!");await expect(block(page,"caption")).toHaveText("xy🙂!");
 await page.keyboard.press("Meta+z");await expect(block(page,"caption")).toHaveText("xy🙂");
 expect(await page.evaluate(()=>window.errors)).toEqual([]);
});
test("grid selection merge header resize split navigation and clearing retain all bodies",async({page})=>{
 const cells=page.locator("[data-select-cell]");await cells.nth(0).click();await cells.nth(3).click({modifiers:["Shift"]});
 await expect(page.locator("[data-rich-cell][data-selected]")).toHaveCount(4);
 const before=await page.evaluate(()=>window.core.documentJson());
 await page.getByRole("button",{name:"Merge cells",exact:true}).click();await expect(page.locator("[data-rich-cell]")).toHaveCount(1);await expect(page.locator("[data-rich-cell]")).toHaveAttribute("rowspan","2");
 await expect(page.locator("[data-source-cell]")).toHaveCount(4);await expect(block(page,"p22")).toHaveText("fourth");
 await page.getByRole("button",{name:"Header cells",exact:true}).click();await expect(page.locator("th[data-rich-cell]")).toHaveCount(1);
 await page.getByRole("spinbutton",{name:"Column width",exact:true}).fill("240");await page.getByRole("button",{name:"Apply Column width",exact:true}).click();expect(await page.evaluate(()=>window.dom.view().tables[0].columns[1].width)).toBe(240);
 await page.getByRole("button",{name:"Split cell",exact:true}).click();await expect(page.locator("th[data-rich-cell]")).toHaveCount(4);
 await page.keyboard.press("Home");await page.keyboard.press("Tab");expect(await page.evaluate(()=>window.dom.view().selection.focus.column)).toBe("c2");
 await page.keyboard.press("Enter");await page.keyboard.type("X");await expect(block(page,"p22")).toContainText("X");
 await page.keyboard.press("Meta+z");
 await cells.nth(0).click();await cells.nth(3).click({modifiers:["Shift"]});await page.getByRole("button",{name:"Clear cells",exact:true}).click();await expect(block(page,"p22")).toHaveCount(0);
 await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(block(page,"p22")).toHaveText("fourth");
 expect(await page.evaluate(()=>window.errors)).toEqual([]);expect(before).toContain("fourth");
});
test("image node controls edit alt caption size asset and delete with exact undo",async({page})=>{
 await page.getByRole("button",{name:"Select image",exact:true}).click();await expect(page.locator("figure[data-node-selected]")).toHaveCount(1);
 await page.getByRole("textbox",{name:"Image alt",exact:true}).fill("Updated diagram");await page.getByRole("button",{name:"Apply Image alt",exact:true}).click();await expect(page.locator("figure img")).toHaveAttribute("alt","Updated diagram");
 await page.getByRole("textbox",{name:"Image caption",exact:true}).fill("Updated caption");await page.getByRole("button",{name:"Apply Image caption",exact:true}).click();await expect(page.locator("figcaption")).toHaveText("Updated caption");
 await page.getByRole("spinbutton",{name:"Image width",exact:true}).fill("360");await page.getByRole("button",{name:"Apply Image width",exact:true}).click();await expect(page.locator("figure img")).toHaveAttribute("width","360");
 await page.getByRole("textbox",{name:"Image asset",exact:true}).fill("new-asset");await page.getByRole("button",{name:"Apply Image asset",exact:true}).click();expect(await page.evaluate(()=>window.core.documentJson())).toContain('"breditor/asset-id":"new-asset"');
 await page.getByRole("button",{name:"Delete selected node",exact:true}).click();await expect(page.locator("figure")).toHaveCount(0);
 await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.locator("figure img")).toHaveAttribute("alt","Updated diagram");await expect(page.locator("figcaption")).toHaveText("Updated caption");
 expect(await page.evaluate(()=>window.errors)).toEqual([]);
});

test("table creation axis moves growth and deletion are live toolbar workflows",async({page})=>{
 await page.locator("[data-select-cell]").nth(2).click();await page.getByRole("button",{name:"Move row up",exact:true}).click();expect(await page.evaluate(()=>window.dom.view().tables[0].rows)).toEqual(["r2","r"]);
 await page.getByRole("button",{name:"Undo",exact:true}).click();await page.locator("[data-select-cell]").nth(0).click();
 await page.getByRole("button",{name:"Move column right",exact:true}).click();expect(await page.evaluate(()=>window.dom.view().tables[0].columns.map(column=>column.id))).toEqual(["c2","c"]);
 await page.getByRole("button",{name:"Undo",exact:true}).click();
 await page.getByRole("button",{name:"Add row",exact:true}).click();await page.getByRole("button",{name:"Add column",exact:true}).click();expect(await page.evaluate(()=>window.dom.view().tables[0].cells.length)).toBe(9);
 await page.getByRole("button",{name:"Header cells",exact:true}).click();await expect(page.locator("th[data-rich-cell]")).toHaveCount(1);await page.getByRole("button",{name:"Header cells",exact:true}).click();await expect(page.locator("th[data-rich-cell]")).toHaveCount(0);
 await page.evaluate(()=>window.dom.execute(window.caret("footer",6)));await page.getByRole("button",{name:"Insert table",exact:true}).click();await expect(page.locator("table[data-rich-table]")).toHaveCount(2);
 const table=await page.evaluate(()=>window.dom.view().tables[1].id);
 await page.evaluate(table=>{const record=JSON.parse(window.dom.view().documentJson),node=record.root.children.find(node=>node.properties["breditor/table-id"]===table);window.dom.execute({kind:"setSelection",selection:{kind:"node",block:node.properties["breditor/block-id"]}});},table);
 await page.getByRole("button",{name:"Delete selected node",exact:true}).click();await expect(page.locator("table[data-rich-table]")).toHaveCount(1);await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.locator("table[data-rich-table]")).toHaveCount(2);
 expect(await page.evaluate(()=>window.errors)).toEqual([]);
});
test("browser clipboard event paths preserve rich copy cut inline paste and grid paste",async({page})=>{
 const result=await page.evaluate(()=>{
  window.dom.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"intro",offset:"0",affinity:"after"},focus:{block:"intro",offset:"5",affinity:"after"}}});
  const event=window.clipboardEvent("cut");
  // Firefox clones constructor-supplied stores. Transfer the event's accepted
  // payload, not the original empty DataTransfer passed to its constructor.
  const transfer=event.clipboardData;
  const copied=transfer.getData("text/plain"),afterCut=window.core.documentJson();window.dom.execute({kind:"undo"});window.dom.execute(window.caret("footer",6));
  window.clipboardEvent("paste",transfer);
  return {copied,afterCut,afterPaste:window.core.documentJson()};
 });
 expect(result.copied).toBe("Intro");expect(result.afterCut).not.toContain('"text":"Intro 🙂"');await expect(block(page,"footer")).toHaveText("FooterIntro");
 await page.locator("[data-select-cell]").nth(0).click();
 await page.evaluate(()=>{
  const event=window.clipboardEvent("copy"),transfer=event.clipboardData;
  window.clipboardEvent("paste",transfer);
 });
 await expect(page.locator("[data-rich-cell]")).toHaveCount(4);await expect(page.locator(".breditor-rich-surface")).toContainText("a🙂b");
 expect(await page.evaluate(()=>window.errors)).toEqual([]);
});

test("whole image clipboard paste splits at the caret and undoes the entire insertion once",async({page})=>{
 const before=await page.evaluate(()=>{
  window.dom.execute({kind:"setSelection",selection:{kind:"node",block:"image-block"}});const event=window.clipboardEvent("copy"),transfer=event.clipboardData;
  window.dom.execute(window.caret("intro",3));const before={document:window.core.documentJson(),depth:window.dom.view().undoDepth};
  window.clipboardEvent("paste",transfer);return before;
 });
 await expect(page.locator("figure")).toHaveCount(2);await expect(block(page,"intro")).toHaveText("Int");expect(await page.evaluate(()=>window.dom.view().undoDepth)).toBe(before.depth+1);
 await page.keyboard.press("Meta+z");expect(await page.evaluate(()=>window.core.documentJson())).toBe(before.document);await expect(page.locator("figure")).toHaveCount(1);expect(await page.evaluate(()=>window.errors)).toEqual([]);
});
test("composition staging commits once and a cancelled composition drains queued work",async({page})=>{
 const initialDepth=await page.evaluate(()=>window.dom.view().undoDepth);
 await page.evaluate(()=>{
  const surface=window.dom.surface,block=surface.querySelector('[data-rich-text="intro"]');
  surface.dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true}));block.textContent="Intro 🙂日本";
  surface.dispatchEvent(new CompositionEvent("compositionend",{bubbles:true,data:"日本"}));
 });
 await expect(block(page,"intro")).toHaveText("Intro 🙂日本");await expect.poll(()=>page.evaluate(()=>window.dom.view().undoDepth)).toBe(initialDepth+1);
 await page.keyboard.press("Meta+z");await expect(block(page,"intro")).toHaveText("Intro 🙂");
 await page.evaluate(()=>{window.dom.surface.dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true}));window.dom.execute({kind:"setHeading",block:"intro",level:2});window.dom.surface.dispatchEvent(new CompositionEvent("compositionend",{bubbles:true,data:""}));});
 await expect(page.locator('h2[data-rich-text="intro"]')).toBeVisible();expect(await page.evaluate(()=>window.errors)).toEqual([]);
});
test("custom toolbar commands and reentrant callbacks use the guarded queue",async({page})=>{
 const result=await page.evaluate(()=>{
  const checkpoint=window.dom.checkpointJson();window.dom.dispose();
  const core=window.profile.restoreEditor(checkpoint),root=document.getElementById("editor-host");let once=false;
  window.dom=window.rich.mountRichEditor(root,{core,toolbar:[...window.rich.defaultToolbar,{id:"custom",label:"Custom insertion",enabled:()=>true,command:()=>({kind:"insertPlainText",text:"C"})}],
   onChange:(_view,outcome)=>{if(outcome==="content"&&!once){once=true;window.dom.execute({kind:"setHeading",block:"intro",level:3});}}});
  window.dom.focus();return core.view().revision;
 });
 await page.getByRole("button",{name:"Custom insertion",exact:true}).click();await expect(page.locator('h3[data-rich-text="intro"]')).toHaveText("Intro 🙂C");
 const revision=await page.evaluate(()=>window.dom.view().revision);expect(revision).not.toBe(result);await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(block(page,"intro")).toHaveText("Intro 🙂C");
});
