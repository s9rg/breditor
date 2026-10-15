// Identical installed/source local/shared interaction assertions, with real Rust state.
import {test,expect} from "@playwright/test";
export function standardToolbarChecks(prefix,host){
 const action=id=>`${host} [data-${prefix}-action="${id}"]`,control=id=>`${host} [data-${prefix}-control="${id}"]`,field=id=>`${host} [data-${prefix}-field="${id}"]`;
 test("mixed mark state uses trusted controls and keyboard toggles with one history group",async({page})=>{
  await page.evaluate(()=>{const t=window.toolbarTest;t.set("p",0,1,t.k.italic);t.select("p",0,4);t.before=t.owner.documentJson();t.depth=t.owner.view().undoDepth;});
  await expect(page.locator(action("italic"))).toHaveAttribute("aria-pressed","mixed");
  await page.locator(action("italic")).click();await expect(page.locator(`${host} [data-rich-text="p"] em`)).toHaveText("a🙂b");
  expect(await page.evaluate(()=>window.toolbarTest.owner.view().undoDepth-window.toolbarTest.depth)).toBe(1);
  await expect(page.locator(`${host} [role="textbox"]`)).toBeFocused();
  await page.keyboard.press("Control+i");await expect(page.locator(`${host} [data-rich-text="p"] em`)).toHaveCount(0);
  await page.evaluate(()=>window.toolbarTest.undo());
  expect(await page.evaluate(()=>{const t=window.toolbarTest;return {...t.exactReload(t.before),errors:t.errors};})).toEqual({undo:true,redo:true,future:true,errors:[]});
 });
 test("color size and font fields expose mixed values and apply reset with exact Undo",async({page})=>{
  await page.evaluate(()=>{const t=window.toolbarTest;t.set("p",0,1,t.k.textColor,{[t.p.rgb24]:0x112233});t.set("p",1,4,t.k.textColor,{[t.p.rgb24]:0x445566});t.select("p",0,4);t.before=t.owner.documentJson();});
  await page.locator(`${control("text-color")} summary`).click();await expect(page.locator(field("text-color-value"))).toHaveValue("");await expect(page.locator(field("text-color-value"))).toHaveAttribute("placeholder","Mixed");
  await page.locator(field("text-color-value")).fill("#abcdef");await page.locator(field("text-color-value")).press("Enter");
  await expect(page.locator(`${host} [data-rich-text="p"] .breditor-inline-text-color`)).toHaveAttribute("style","color:#abcdef");await page.evaluate(()=>window.toolbarTest.undo());expect(await page.evaluate(()=>window.toolbarTest.owner.documentJson())).toBe(await page.evaluate(()=>window.toolbarTest.before));await page.evaluate(()=>window.toolbarTest.redo());
  for(const [name,value,style]of [["background-color","#ffcc00","background-color:#ffcc00"],["text-size","32","font-size:32px"]]){await page.locator(`${control(name)} summary`).click();await page.locator(field(`${name}-value`)).fill(value);await page.locator(field(`${name}-value`)).press("Enter");await expect(page.locator(`${host} [data-rich-text="p"] .breditor-inline-${name}`)).toHaveAttribute("style",style);}
  await page.locator(`${control("font-family")} summary`).click();await page.locator(field("font-family-value")).selectOption("4");await page.locator(field("font-family-value")).press("Enter");await expect(page.locator(`${host} [data-rich-text="p"] .breditor-inline-font-family`)).toHaveCSS("font-family",/monospace/);
  const before=await page.evaluate(()=>window.toolbarTest.owner.documentJson());await page.locator(action("reset-text-size")).click();await expect(page.locator(`${host} .breditor-inline-text-size`)).toHaveCount(0);await page.evaluate(()=>window.toolbarTest.undo());expect(await page.evaluate(()=>window.toolbarTest.owner.documentJson())).toBe(before);expect(await page.evaluate(()=>window.toolbarTest.errors)).toEqual([]);
 });
 test("Link shortcut Enter Escape safe URL validation and mixed complete replacement",async({page})=>{
  await page.evaluate(()=>{const t=window.toolbarTest;t.set("p",0,1,t.k.link,{[t.p.href]:"https://one.test/",[t.p.newWindow]:false});t.set("p",1,4,t.k.link,{[t.p.href]:"https://two.test/",[t.p.newWindow]:true});t.select("p",0,4);t.before=t.owner.documentJson();t.editor.focus();});
  await page.keyboard.press("Control+k");await expect(page.locator(field("link-href"))).toBeFocused();await expect(page.locator(field("link-href"))).toHaveValue("");await expect(page.locator(field("link-target"))).toHaveValue("");
  await page.locator(field("link-href")).fill("javascript:alert(1)");await page.locator(field("link-target")).selectOption("new");await page.locator(field("link-href")).press("Enter");expect(await page.evaluate(()=>window.toolbarTest.owner.documentJson())).toBe(await page.evaluate(()=>window.toolbarTest.before));
  await page.locator(field("link-href")).fill("https://safe.test/path");await page.locator(field("link-href")).press("Enter");await expect(page.locator(`${host} [data-rich-text="p"] a`)).toHaveAttribute("href","https://safe.test/path");await expect(page.locator(`${host} [data-rich-text="p"] a`)).toHaveAttribute("rel","noopener noreferrer");await expect(page.locator(`${host} [role="textbox"]`)).toBeFocused();
  await page.keyboard.press("Control+k");await page.locator(field("link-href")).fill("https://discard.test/");await page.locator(field("link-href")).press("Escape");await expect(page.locator(`${host} [role="textbox"]`)).toBeFocused();
  expect(await page.evaluate(()=>{const t=window.toolbarTest;return {...t.exactReload(t.before),errors:t.errors.length};})).toEqual({undo:true,redo:true,future:true,errors:1});
 });
 test("script switch and clear preserve custom marks and restore removed Link properties exactly",async({page})=>{
  await page.evaluate(()=>{const t=window.toolbarTest;for(const kind of [t.k.superscript,"example/review"])t.set("caption",0,1,kind);t.set("caption",0,1,t.k.link,{[t.p.href]:"https://actual.test/",[t.p.newWindow]:true});t.select("caption",0,1);t.before=t.owner.documentJson();t.depth=t.owner.view().undoDepth;});
  await page.locator(action("subscript")).click();await expect(page.locator(`${host} figcaption sub`)).toHaveText("x");await expect(page.locator(`${host} figcaption sup`)).toHaveCount(0);expect(await page.evaluate(()=>window.toolbarTest.owner.view().undoDepth-window.toolbarTest.depth)).toBe(1);
  await page.evaluate(()=>window.toolbarTest.undo());expect(await page.evaluate(()=>window.toolbarTest.owner.documentJson())).toBe(await page.evaluate(()=>window.toolbarTest.before));await page.evaluate(()=>window.toolbarTest.redo());
  const before=await page.evaluate(()=>window.toolbarTest.owner.documentJson());await page.locator(action("clear-inline")).click();await expect(page.locator(`${host} figcaption mark`)).toHaveText("x");await expect(page.locator(`${host} figcaption a,${host} figcaption sub`)).toHaveCount(0);await page.evaluate(()=>window.toolbarTest.undo());expect(await page.evaluate(()=>window.toolbarTest.owner.documentJson())).toBe(before);expect(await page.evaluate(()=>window.toolbarTest.errors)).toEqual([]);
 });
 test("caret controls preserve inherited application marks and explicit pending plain while typing",async({page})=>{
  await page.evaluate(()=>{const t=window.toolbarTest;t.set("caption",0,1,"example/review");t.select("caption",1,1,"before");t.before=t.owner.documentJson();});
  await page.locator(action("italic")).click();await page.keyboard.type("Q");await expect(page.locator(`${host} figcaption em mark`)).toHaveText("Q");
  expect(await page.evaluate(()=>window.toolbarTest.owner.caretFormats().map(f=>f.type))).toContain("example/review");
  await page.locator(action("clear-inline")).click();await page.keyboard.type("R");expect((await page.locator(`${host} figcaption mark`).allTextContents()).join("")).toBe("xQR");await expect(page.locator(`${host} figcaption em`)).toHaveText("Q");
  await page.evaluate(()=>window.toolbarTest.pending([]));await page.locator(action("underline")).click();await page.keyboard.type("S");await expect(page.locator(`${host} figcaption u`)).toHaveText("S");await expect(page.locator(`${host} figcaption u mark`)).toHaveCount(0);
  expect(await page.evaluate(()=>window.toolbarTest.errors)).toEqual([]);
 });
 test("node selections disable inline controls and Alt-modified shortcuts are not intercepted",async({page})=>{
  await page.evaluate(()=>{const t=window.toolbarTest;if(t.prefix==="rich")t.editor.execute({kind:"setSelection",selection:{kind:"node",block:"image-block"}});else t.editor.select({kind:"node",block:"image-block"});});await expect(page.locator(action("italic"))).toBeDisabled();
  const result=await page.evaluate(()=>{const t=window.toolbarTest;t.select("p",0,1);const before=t.owner.documentJson(),event=new KeyboardEvent("keydown",{key:"i",ctrlKey:true,altKey:true,bubbles:true,cancelable:true});t.editor.surface.dispatchEvent(event);return {prevented:event.defaultPrevented,unchanged:t.owner.documentJson()===before,errors:t.errors};});expect(result).toEqual({prevented:false,unchanged:true,errors:[]});
 });
 test("selection-only changes reject dirty drafts without changing document bytes",async({page})=>{
  await page.evaluate(()=>window.toolbarTest.select("p",0,1));await page.locator(`${control("text-size")} summary`).click();await page.locator(field("text-size-value")).fill("24");
  const before=await page.evaluate(()=>{const t=window.toolbarTest,document=t.owner.documentJson();t.select("caption",0,1);return {document,unchanged:t.owner.documentJson()===document};});expect(before.unchanged).toBe(true);
  await page.locator(field("text-size-value")).press("Enter");expect(await page.evaluate(()=>window.toolbarTest.owner.documentJson())).toBe(before.document);expect(await page.evaluate(()=>window.toolbarTest.errors)).toEqual([expect.stringContaining("stale")]);await page.locator(field("text-size-value")).press("Escape");
  // A nested caption is its own browser editing host inside the editor surface.
  expect(await page.evaluate(()=>{const t=window.toolbarTest,active=document.activeElement;return active===t.editor.surface||t.editor.surface.contains(active);})).toBe(true);
 });
 test("distinct browser replacement targets still replace their range rather than typing at the caret",async({page})=>{
  const result=await page.evaluate(()=>{const t=window.toolbarTest;t.select("p",4);const node=t.editor.surface.querySelector('[data-rich-text="p"]').firstChild,range=new StaticRange({startContainer:node,startOffset:0,endContainer:node,endOffset:1}),event=new InputEvent("beforeinput",{inputType:"insertReplacementText",data:"Z",bubbles:true,cancelable:true});Object.defineProperty(event,"getTargetRanges",{value:()=>[range]});t.before=t.owner.documentJson();t.editor.surface.dispatchEvent(event);const changed=t.editor.surface.querySelector('[data-rich-text="p"]').textContent;t.undo();return {changed,undo:t.owner.documentJson()===t.before,errors:t.errors};});expect(result).toEqual({changed:"Z🙂b",undo:true,errors:[]});
 });
 test("every standard mark control exposes uniform active state and exact single-step Undo",async({page})=>{
  await page.evaluate(()=>window.toolbarTest.select("p",0,1));
  for(const [name,tag]of [["bold","strong"],["italic","em"],["underline","u"],["strike","s"],["code","code"],["subscript","sub"],["superscript","sup"]]){
   const before=await page.evaluate(()=>({document:window.toolbarTest.owner.documentJson(),depth:window.toolbarTest.owner.view().undoDepth}));await page.locator(action(name)).click();await expect(page.locator(`${host} [data-rich-text="p"] ${tag}`)).toHaveText("a");await expect(page.locator(action(name))).toHaveAttribute("aria-pressed","true");expect(await page.evaluate(()=>window.toolbarTest.owner.view().undoDepth)).toBe(before.depth+1);await page.evaluate(()=>window.toolbarTest.undo());expect(await page.evaluate(()=>window.toolbarTest.owner.documentJson())).toBe(before.document);
  }expect(await page.evaluate(()=>window.toolbarTest.errors)).toEqual([]);
 });
 test("toolbar formatting survives internal clipboard paste with one recovered future history group",async({page})=>{
  await page.evaluate(()=>window.toolbarTest.select("p",0,1));await page.locator(action("italic")).click();await page.locator(`${control("text-size")} summary`).click();await page.locator(field("text-size-value")).fill("24");await page.locator(field("text-size-value")).press("Enter");
  const result=await page.evaluate(()=>{
   const t=window.toolbarTest;
   const clipboard=(kind,source=new DataTransfer())=>{
    const event=new ClipboardEvent(kind,{clipboardData:source,bubbles:true,cancelable:true});
    // Firefox clones constructor stores. Read/write the accepted event payload.
    if(event.clipboardData!==source)for(const flavor of source.types)event.clipboardData.setData(flavor,source.getData(flavor));
    t.editor.surface.dispatchEvent(event);return event.clipboardData;
   };
   const transfer=clipboard("copy"),plain=transfer.getData("text/plain");t.select("caption",0);
   const before=t.owner.documentJson(),depth=t.owner.view().undoDepth;clipboard("paste",transfer);
   const pasted=t.editor.surface.querySelector("figcaption em .breditor-inline-text-size,figcaption .breditor-inline-text-size em"),value=pasted?.textContent,delta=t.owner.view().undoDepth-depth;
   return {plain,value,delta,...t.exactReload(before),errors:t.errors};
  });expect(result).toEqual({plain:"a",value:"a",delta:1,undo:true,redo:true,future:true,errors:[]});
 });
 test("absent-format resets preserve exact checkpoints and a retained Redo branch",async({page})=>{
  const before=await page.evaluate(()=>{const t=window.toolbarTest;t.select("p",0,1);t.set("p",0,1,t.k.italic);t.after=t.owner.documentJson();t.undo();return t.owner.checkpointJson();});
  for(const name of ["unlink","reset-text-color","reset-background-color","reset-text-size","reset-font-family","clear-inline"])await page.locator(action(name)).click();
  expect(await page.evaluate(()=>window.toolbarTest.owner.checkpointJson())).toBe(before);
  expect(await page.evaluate(()=>{const t=window.toolbarTest;t.redo();return t.owner.documentJson()===t.after;})).toBe(true);
  const caret=await page.evaluate(()=>{const t=window.toolbarTest;t.select("caption",0);return t.owner.checkpointJson();});await page.locator(action("clear-inline")).click();expect(await page.evaluate(()=>window.toolbarTest.owner.checkpointJson())).toBe(caret);expect(await page.evaluate(()=>window.toolbarTest.errors)).toEqual([]);
 });
}
