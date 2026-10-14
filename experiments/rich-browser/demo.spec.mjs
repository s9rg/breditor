import {test,expect} from "@playwright/test";
import {readFile} from "node:fs/promises";
test("interactive rich demo renders owned raster assets and restores exported exact history",async({page})=>{
 await page.goto("/demo");await expect(page.locator("#ready")).toHaveText("Ready — real Rust/Wasm editor");
 await expect(page.locator("[data-rich-cell]")).toHaveCount(4);await expect(page.locator("figure img")).toBeVisible();
 expect(await page.locator("figure img").evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
 await page.evaluate(()=>window.demo.editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"demo-intro",offset:"0",affinity:"after"},focus:{block:"demo-intro",offset:"0",affinity:"after"}}}));
 await page.keyboard.type("Saved! ");
 const exact=await page.evaluate(()=>window.demo.editor.view().documentJson);
 const pending=page.waitForEvent("download");await page.getByRole("button",{name:"Export exact local session",exact:true}).click();const download=await pending;
 expect(download.suggestedFilename()).toBe("breditor-rich-session.json");const payload=await readFile(await download.path());
 await page.evaluate(()=>window.demo.editor.execute({kind:"undo"}));
 expect(await page.evaluate(()=>window.demo.editor.view().documentJson)).not.toBe(exact);
 await page.locator("#import").setInputFiles({name:"session.json",mimeType:"application/json",buffer:payload});
 await expect(page.locator("#notice")).toHaveText("Restored the exact local content and undo/redo branch.");
 expect(await page.evaluate(()=>window.demo.editor.view().documentJson)).toBe(exact);
 await page.getByRole("button",{name:"Undo",exact:true}).click();expect(await page.evaluate(()=>window.demo.editor.view().documentJson)).not.toBe(exact);
 await page.getByRole("button",{name:"Redo",exact:true}).click();expect(await page.evaluate(()=>window.demo.editor.view().documentJson)).toBe(exact);
});

test("disconnected cell and file edits recover together from a cached shell without live resource fetches",async({page,context})=>{
 const resources=new Map(),captures=[];
 page.on("response",response=>{if(response.url().startsWith("http://127.0.0.1:49773/"))captures.push((async()=>{resources.set(new URL(response.url()).pathname,{body:await response.body(),contentType:response.headers()["content-type"]});})());});
 await page.goto("/demo");await expect(page.locator("#ready")).toHaveText("Ready — real Rust/Wasm editor");
 // Block HTTP requests at the boundary, without disabling the browser's local
 // Blob/file I/O. Playwright's WebKit offline switch also rejects that local I/O.
 const disconnected=async route=>{if(/^https?:/.test(route.request().url()))await route.abort("internetdisconnected");else await route.continue();};
 await context.route("**/*",disconnected);
 await page.evaluate(()=>window.demo.editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"p",offset:"0",affinity:"after"},focus:{block:"p",offset:"0",affinity:"after"}}}));
 await page.keyboard.type("Offline cell 🙂 ");
 // Firefox may finish its synthetic Unicode composition on the next frame.
 // Wait for the authoritative owner, not only the staged DOM, before a history oracle.
 await expect.poll(()=>page.evaluate(()=>window.demo.editor.view().documentJson.includes("Offline cell 🙂 "))).toBe(true);
 const buffer=await page.evaluate(async()=>{
  const canvas=document.createElement("canvas");canvas.width=4;canvas.height=3;const paint=canvas.getContext("2d");paint.fillStyle="#398a79";paint.fillRect(0,0,4,3);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));return [...new Uint8Array(await blob.arrayBuffer())];
 });
 const before=await page.evaluate(()=>window.demo.editor.view().documentJson);
 await page.locator("#images").setInputFiles({name:"offline.png",mimeType:"image/png",buffer:Buffer.from(buffer)});
 await expect(page.locator("figure img")).toHaveCount(2);
 await expect.poll(()=>page.locator("figure img").last().evaluate(image=>image.complete&&image.naturalWidth)).toBe(4);
 await expect(page.locator("#saved")).toHaveText("Saved locally");
 const saved=await page.evaluate(async()=>{await window.demo.sessions.flush();return {document:window.demo.editor.view().documentJson,checkpoint:window.demo.editor.checkpointJson(),assets:await window.demo.assetStore.list()};});
 expect(saved.assets).toHaveLength(1);expect(saved.assets[0].status).toBe("pending");
 // A cached local app shell is required to boot offline. Cache only this host's
 // immutable test resources; production service-worker packaging is a separate gate.
 await Promise.all(captures);
 await context.unroute("**/*",disconnected);
 await context.route("**/*",disconnected);
 await context.route("http://127.0.0.1:49773/**",async route=>{
  const path=new URL(route.request().url()).pathname;
  const response=resources.get(path);
  if(!response){await route.abort("internetdisconnected");return;}
  await route.fulfill({status:200,...response});
 });
 await page.reload();await expect(page.locator("#ready")).toHaveText("Ready — real Rust/Wasm editor");
 expect(await page.evaluate(()=>window.demo.editor.view().documentJson)).toBe(saved.document);
 await expect(page.locator('[data-rich-text="p"]')).toContainText("Offline cell 🙂 ");
 await expect.poll(()=>page.locator("figure img").last().evaluate(image=>image.complete&&image.naturalWidth)).toBe(4);
 expect(await page.evaluate(()=>window.demo.assetStore.list())).toEqual(saved.assets);
 await page.getByRole("button",{name:"Undo",exact:true}).click();
 expect(await page.evaluate(()=>window.demo.editor.view().documentJson)).toBe(before);
 await page.getByRole("button",{name:"Redo",exact:true}).click();
 expect(await page.evaluate(()=>window.demo.editor.view().documentJson)).toBe(saved.document);
});
