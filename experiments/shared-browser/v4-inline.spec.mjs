import {test,expect} from "@playwright/test";
// Shared rich V4 inline features over two real Rust/Wasm writers in a V4 room: V4 inline content renders in the
// shared DOM, and text language, the `@` mention menu and image links are each one native shared command that
// converges on the peer and is one Undo step for its writer.
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const {v4InlineFixture,paragraph,mention,tagged,image}=await import("/v4-fixture-inline.mjs"),shared=window.sharedTools;
  const t=v4InlineFixture(shared,{children:[paragraph("intro","Hello world"),paragraph("people","Hi ",mention("Ann","u-ann")," said ",tagged("bonjour","fr-CA")),
   image("fig",{link:"https://example.com/chart",newWindow:true}),image("deco",{decorative:true}),paragraph("tail","Tail")]});
  const cancels=[],executions=[];
  const people=[{kind:"user",id:"u-ann",label:"Ann Lee"},{kind:"user",id:"u-bo",label:"Bo"},{kind:"page",id:"p-road",label:"Roadmap"}];
  const mentions=shared.mountSharedMentions(t.da,{items:people,core:t.a,onCancel:reason=>cancels.push(reason),onExecute:execution=>executions.push(execution.request.commands.map(command=>command.kind))});
  window.v4={...t,mentions,cancels,executions};
 });
});
const menu=page=>page.locator("[data-breditor-mention]");

test("V4 inline content renders in both shared panes: mention chips, lang spans and image links",async({page})=>{
 for(const pane of ["#a","#b"]){
  const chip=page.locator(`${pane} span.breditor-mention[data-mention-id="u-ann"]`);
  await expect(chip).toHaveText("@Ann");await expect(chip).toHaveAttribute("contenteditable","false");await expect(chip).toHaveAttribute("data-mention-kind","user");
  await expect(page.locator(`${pane} span[lang="fr-CA"]`)).toHaveText("bonjour");
  const anchor=page.locator(`${pane} a[data-rich-image-link]`);
  await expect(anchor).toHaveCount(1);await expect(anchor).toHaveAttribute("href","https://example.com/chart");await expect(anchor).toHaveAttribute("target","_blank");
  await expect(anchor.locator("img")).toHaveCount(1);
 }
 const capabilities=await page.evaluate(()=>{const t=window.v4;return [t.a.supportsInlineCommandsV4(),t.a.supportsTextLanguage(),t.a.supportsMentions(),t.a.supportsImageLinks(),t.toolbarA.map(c=>c.id).filter(id=>/^(reset-)?(text-language|image-link)$/.test(id)),t.errors];});
 expect(capabilities).toEqual([true,true,true,true,["text-language","reset-text-language","image-link","reset-image-link"],[]]);
});

test("the Language control sets one canonical tag in one Undo step and the peer converges",async({page})=>{
 await page.evaluate(()=>{const t=window.v4;t.da.select(t.range("intro",0,5));});
 const control=page.locator('#a [data-shared-control="text-language"]');
 await control.locator("summary").click();
 await page.locator('#a [data-shared-field="text-language-value"]').fill("DE-at");
 const depth=await page.evaluate(()=>window.v4.a.view().undoDepth);
 await page.locator('#a [data-shared-action="text-language"]').click();
 await expect(page.locator('#a span[lang="de-AT"]')).toHaveText("Hello");
 const set=await page.evaluate(async()=>{const t=window.v4;await t.synchronize();return {runs:t.runs(t.b,"intro"),depth:t.a.view().undoDepth};});
 expect(set).toEqual({runs:[["Hello",null,"de-AT"],[" world",null,null]],depth:depth+1});
 await expect(page.locator('#b span[lang="de-AT"]')).toHaveText("Hello");
 // A concurrent peer tag on an overlapping range converges; Undo of A keeps only B's characters.
 const merged=await page.evaluate(async()=>{const t=window.v4;t.b.select(t.range("intro",3,11));t.b.setTextLanguage("en");await t.synchronize();const both=t.runs(t.a,"intro");
  t.a.undo();await t.synchronize();const undone=t.runs(t.b,"intro");t.a.redo();await t.synchronize();return {both,undone,redo:t.runs(t.b,"intro"),errors:t.errors};});
 expect(merged.both).toEqual([["Hel",null,"de-AT"],["lo world",null,"en"]]);
 expect(merged).toMatchObject({undone:[["Hel",null,null],["lo world",null,"en"]],redo:merged.both,errors:[]});
 await page.evaluate(()=>{const t=window.v4;t.da.select(t.range("intro",0,11));});
 await page.locator('#a [data-shared-action="reset-text-language"]').click();
 await expect(page.locator("#a [data-rich-text=intro] [lang]")).toHaveCount(0);
});

test("choosing an @ suggestion replaces the trigger with one chip in one Undo step on both peers",async({page})=>{
 await page.evaluate(()=>{const t=window.v4;t.da.select(t.caret("tail",4));});
 await page.keyboard.type(" @an");
 await expect(menu(page).getByRole("option")).toHaveText(["Ann Lee"]);
 // A concurrent peer edit elsewhere does not end the session.
 const depth=await page.evaluate(async()=>{const t=window.v4;await t.synchronize();t.b.dispatch({commands:[{kind:"insert_text",data:{block:"intro",offset:11,text:"!"}}]});await t.synchronize();return t.a.view().undoDepth;});
 await expect(menu(page)).toBeVisible();
 await page.keyboard.press("Enter");
 const chip=page.locator('#a span.breditor-mention[data-mention-id="u-ann"]').filter({hasText:"@Ann Lee"});
 await expect(chip).toHaveAttribute("contenteditable","false");await expect(menu(page)).toBeHidden();
 const chosen=await page.evaluate(async()=>{const t=window.v4;await t.synchronize();return {runs:t.runs(t.b,"tail"),depth:t.a.view().undoDepth,selection:t.a.view().selection,executions:t.executions,errors:t.errors};});
 expect(chosen).toEqual({runs:[["Tail ",null,null],["@Ann Lee","Ann Lee",null],[" ",null,null]],depth:depth+1,selection:await page.evaluate(()=>window.v4.caret("tail",14)),executions:[["insert_mention"]],errors:[]});
 await expect(page.locator('#b span.breditor-mention').filter({hasText:"@Ann Lee"})).toHaveCount(1);
 // One Undo restores the typed trigger on both peers; Redo brings the chip back.
 const undone=await page.evaluate(async()=>{const t=window.v4;t.a.undo();await t.synchronize();const once=t.runs(t.b,"tail");t.a.redo();await t.synchronize();return {once,redo:t.runs(t.b,"tail")};});
 expect(undone).toEqual({once:[["Tail @an",null,null]],redo:chosen.runs});
 // Typing right after the chip is plain text.
 await page.evaluate(()=>{const t=window.v4;t.da.select(t.caret("tail",14));});
 await page.keyboard.type("ok");
 const typed=await page.evaluate(async()=>{const t=window.v4;await t.synchronize();return t.runs(t.b,"tail");});
 expect(typed).toEqual([["Tail ",null,null],["@Ann Lee","Ann Lee",null],[" ok",null,null]]);
 // Backspace right after the chip deletes the whole unit.
 await page.evaluate(()=>{const t=window.v4;t.da.select(t.caret("tail",13));});
 await page.keyboard.press("Backspace");
 const deleted=await page.evaluate(async()=>{const t=window.v4;await t.synchronize();return t.runs(t.b,"tail");});
 expect(deleted).toEqual([["Tail  ok",null,null]]);
});

test("a peer edit to the typed @ trigger cancels the menu and choosing publishes nothing",async({page})=>{
 await page.evaluate(()=>{const t=window.v4;t.da.select(t.caret("tail",4));});
 await page.keyboard.type(" @b");
 await expect(menu(page).getByRole("option").first()).toBeVisible();
 const result=await page.evaluate(async()=>{const t=window.v4;await t.synchronize();t.b.dispatch({commands:[{kind:"delete_text",data:{block:"tail",offset:5,length:1}}]});await t.synchronize();
  const before=t.a.documentJson(),state=t.mentions.state();let refused=false;try{t.mentions.choose(0);}catch{refused=true;}
  return {open:state.open,lastCancel:state.lastCancel,cancels:t.cancels,refused,unchanged:t.a.documentJson()===before,tail:t.runs(t.a,"tail"),executions:t.executions,errors:t.errors};});
 expect(result).toEqual({open:false,lastCancel:"trigger-invalidated",cancels:["trigger-invalidated"],refused:true,unchanged:true,tail:[["Tail b",null,null]],executions:[],errors:[]});
 await expect(menu(page)).toBeHidden();
});

test("the Image link control sets, replaces and removes the paired link and refuses decorative images",async({page})=>{
 await page.evaluate(()=>{const t=window.v4;t.da.select({kind:"node",block:"fig"});});
 const control=page.locator('#a [data-shared-control="image-link"]');
 await control.locator("summary").click();
 await expect(page.locator('#a [data-shared-field="image-link-href"]')).toHaveValue("https://example.com/chart");
 await page.locator('#a [data-shared-field="image-link-href"]').fill("HTTPS://Example.org/x");
 await page.locator('#a [data-shared-field="image-link-target"]').selectOption("same");
 await page.locator('#a [data-shared-action="image-link"]').click();
 await expect(page.locator('#a a[data-rich-image-link]')).toHaveAttribute("href","https://example.org/x");
 await expect(page.locator('#a a[data-rich-image-link]')).not.toHaveAttribute("target","_blank");
 const replaced=await page.evaluate(async()=>{const t=window.v4;await t.synchronize();return {link:t.link(t.b,"fig"),errors:t.errors};});
 expect(replaced).toEqual({link:["https://example.org/x",null],errors:[]});
 await expect(page.locator('#b a[data-rich-image-link]')).toHaveAttribute("href","https://example.org/x");
 // Concurrent writers on the same image: one complete pair wins, never half of each.
 const raced=await page.evaluate(async()=>{const t=window.v4;t.a.setImageLink({image:"fig-image",href:"https://a.example/",newWindow:true});t.b.setImageLink({image:"fig-image",href:"https://b.example/"});await t.synchronize();
  const merged=t.link(t.a,"fig");t.a.undo();t.b.undo();await t.synchronize();return {merged,undone:t.link(t.b,"fig")};});
 expect([JSON.stringify(["https://a.example/",true]),JSON.stringify(["https://b.example/",null])]).toContain(JSON.stringify(raced.merged));
 expect(raced.undone).toEqual(["https://example.org/x",null]);
 await page.evaluate(()=>{const t=window.v4;t.da.select({kind:"node",block:"fig"});});
 await page.locator('#a [data-shared-action="reset-image-link"]').click();
 await expect(page.locator('#a a[data-rich-image-link]')).toHaveCount(0);
 const removed=await page.evaluate(async()=>{const t=window.v4;await t.synchronize();const gone=t.link(t.b,"fig");t.a.undo();await t.synchronize();return {gone,restored:t.link(t.b,"fig")};});
 expect(removed).toEqual({gone:[null,null],restored:["https://example.org/x",null]});
 await expect(page.locator('#b a[data-rich-image-link]')).toHaveAttribute("href","https://example.org/x");
 // A decorative image is never linked: the control explains it and nothing is published.
 const refused=await page.evaluate(()=>{const t=window.v4;const before=t.a.documentJson();let message="";try{t.a.setImageLink({image:"deco-image",href:"https://example.org/"});}catch(error){message=String(error);}return {message,unchanged:t.a.documentJson()===before};});
 expect(refused.unchanged).toBe(true);expect(refused.message).toContain("decorative image cannot be linked");
 await page.evaluate(()=>{const t=window.v4;t.da.select({kind:"node",block:"deco"});});
 await expect(page.locator('#a [data-shared-action="reset-image-link"]')).toBeDisabled();
});
