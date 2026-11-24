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

test("a failed write leaves the last committed checkpoint readable on the same local store", async ({page}) => {
 await page.goto("/");
 await expect(page.locator("#status")).toHaveText("Ready");
 const results = await page.evaluate(async () => {
  const {compileStandardRichProfileV1, RichDocumentSessionStore, RichLocalSessionStore} = await import("/rich.js");
  const profile = compileStandardRichProfileV1(window.rich.wasm, JSON.stringify({
   format: "breditor/profile-bootstrap", formatVersion: 6, schema: {name: "example/local-load-after-abort", version: 1}, extensions: [],
  }));
  const {schema, schemaFingerprint} = profile.descriptor();
  const seed = JSON.stringify({format: "breditor/document", formatVersion: 2, schema, schemaFingerprint, root: {
   kind: "element", type: "breditor/document", entityId: null, properties: {"breditor/document-id": "local"},
   children: [{kind: "element", type: "breditor/paragraph", entityId: null, properties: {"breditor/block-id": "p"},
    children: [{kind: "text", text: "Original", formats: []}]}],
  }});
  const outcome = [];
  try {
   for (const document of [false, true]) {
    const name = `aborted-checkpoint:${crypto.randomUUID()}`;
    const store = document ? await RichDocumentSessionStore.open(name, {richLanguage: 1}) : await RichLocalSessionStore.open(name);
    const core = document ? profile.createDocumentEditor(seed) : profile.createEditor(seed);
    try {
     const point = {block: "p", offset: "0", affinity: "after"};
     core.execute({kind: "setSelection", selection: {kind: "text", anchor: point, focus: point}});
     core.execute({kind: "insertPlainText", text: "New "});
     const edited = core.documentJson();
     core.execute({kind: "undo"});
     const durable = core.checkpointJson();
     await store.save(durable);
     core.execute({kind: "redo"});
     const newer = core.checkpointJson();
     const put = IDBObjectStore.prototype.put;
     let aborted = false, settlements;
     try {
      IDBObjectStore.prototype.put = function (...args) {
       const request = put.apply(this, args);
       if (this.transaction.db.name === name) request.addEventListener("success", () => {
        aborted = true;
        this.transaction.abort();
       }, {once: true});
       return request;
      };
      settlements = await Promise.allSettled([store.save(newer), store.flush(), store.load()]);
     } finally {
      IDBObjectStore.prototype.put = put;
     }
     const [save, flush, read] = settlements;
     const recovered = read.status === "fulfilled" && (document ? profile.restoreDocumentEditor(read.value) : profile.restoreEditor(read.value));
     try {
      const exactRead = read.status === "fulfilled" && read.value === durable && recovered.checkpointJson() === durable;
      const restoredRedo = recovered && recovered.view().redoDepth === 1;
      if (recovered) recovered.execute({kind: "redo"});
      const exactRedo = recovered && recovered.documentJson() === edited;
      await store.save(newer);
      await store.flush();
      outcome.push({aborted, save: save.status, flush: flush.status, exactRead, restoredRedo, exactRedo, exactRetry: await store.load() === newer});
     } finally {
      if (recovered) recovered.dispose();
     }
    } finally {
     core.dispose();
     store.close();
    }
   }
  } finally {
   profile.dispose();
  }
  return outcome;
 });
 const expected = {aborted: true, save: "rejected", flush: "rejected", exactRead: true, restoredRedo: true, exactRedo: true, exactRetry: true};
 expect(results).toEqual([expected, expected]);
});

test("actual page restart retains the saved rich redo cursor and future exact undo",async({page})=>{
 await page.goto("/demo");await expect(page.locator("#ready")).toHaveText("Ready — real Rust/Wasm editor");
 const saved=await page.evaluate(async()=>{
  const editor=window.demo.editor,initial=editor.view().documentJson;
  editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"demo-intro",offset:"0",affinity:"after"},focus:{block:"demo-intro",offset:"0",affinity:"after"}}});
  editor.execute({kind:"insertPlainText",text:"Durable! "});const next=editor.view().documentJson;
  editor.execute({kind:"undo"});
  const checkpoint=editor.checkpointJson();
  const result=await window.demo.autosave.flush();
  return {initial,next,redo:editor.view().redoDepth,checkpoint,status:result.status};
 });
 expect(saved.status).toBe("committed");
 expect(saved.redo).toBe(1);
 await page.reload();await expect(page.locator("#ready")).toHaveText("Ready — real Rust/Wasm editor");
 expect(await page.evaluate(()=>window.demo.editor.checkpointJson())).toBe(saved.checkpoint);
 expect(await page.evaluate(()=>window.demo.editor.view().documentJson)).toBe(saved.initial);
 expect(await page.evaluate(()=>window.demo.editor.view().redoDepth)).toBe(saved.redo);
 await page.getByRole("button",{name:"Redo",exact:true}).click();
 expect(await page.evaluate(()=>window.demo.editor.view().documentJson)).toBe(saved.next);
 await page.getByRole("button",{name:"Undo",exact:true}).click();
 expect(await page.evaluate(()=>window.demo.editor.view().documentJson)).toBe(saved.initial);
});
