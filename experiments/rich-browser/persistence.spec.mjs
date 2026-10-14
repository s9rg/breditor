import {test,expect} from "@playwright/test";

test("local checkpoint writes are ordered durable and bounded without overwriting on failure",async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 const result=await page.evaluate(async()=>{
  const {RichLocalSessionStore}=await import("/rich.js"),name=`functional-session:${crypto.randomUUID()}`;
  const store=await RichLocalSessionStore.open(name,100);
  const a=store.save("first"),b=store.save("second");await Promise.all([a,b]);
  const current=await store.load();let failed=false;
  try{await store.save("🙂".repeat(26));}catch{failed=true;}
  const after=await store.load();await store.save("third");await store.flush();store.close();
  const reopened=await RichLocalSessionStore.open(name,100),recovered=await reopened.load();reopened.close();
  return {current,failed,after,recovered};
 });
 expect(result).toEqual({current:"second",failed:true,after:"second",recovered:"third"});
});

test("actual page restart retains the saved rich redo cursor and future exact undo",async({page})=>{
 await page.goto("/demo");await expect(page.locator("#ready")).toHaveText("Ready — real Rust/Wasm editor");
 const saved=await page.evaluate(async()=>{
  const editor=window.demo.editor,initial=editor.view().documentJson;
  editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"demo-intro",offset:"0",affinity:"after"},focus:{block:"demo-intro",offset:"0",affinity:"after"}}});
  editor.execute({kind:"insertPlainText",text:"Durable! "});const next=editor.view().documentJson;
  editor.execute({kind:"undo"});await window.demo.sessions.flush();
  return {initial,next,redo:editor.view().redoDepth};
 });
 await page.reload();await expect(page.locator("#ready")).toHaveText("Ready — real Rust/Wasm editor");
 expect(await page.evaluate(()=>window.demo.editor.view().documentJson)).toBe(saved.initial);
 expect(await page.evaluate(()=>window.demo.editor.view().redoDepth)).toBe(saved.redo);
 await page.getByRole("button",{name:"Redo",exact:true}).click();
 expect(await page.evaluate(()=>window.demo.editor.view().documentJson)).toBe(saved.next);
 await page.getByRole("button",{name:"Undo",exact:true}).click();
 expect(await page.evaluate(()=>window.demo.editor.view().documentJson)).toBe(saved.initial);
});
