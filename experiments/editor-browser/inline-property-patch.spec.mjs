import {test,expect} from "@playwright/test";

for(const mode of ["local","shared-v1","shared-v2"]){
 test(`installed ${mode} Link field patches preserve mixed values foreign work and exact reload`,async({page})=>{
  const local=mode==="local",path=local?"/":mode==="shared-v1"?"/shared-session.html":"/shared-structural.html",root=local?"#editor":"#a",prefix=local?"rich":"shared";
  await page.goto(path);await expect(page.locator("#ready")).toHaveText("Ready");
  await page.evaluate(mode=>{
   const t=mode==="local"?window.sdk:mode==="shared-v1"?window.durableSdk:window.sharedV2;
   const local=mode==="local",owner=local?t.editor:t.a.core;
   const link=(href,newWindow)=>({type:"breditor-inline/link",properties:{"breditor-inline/href":href,"breditor-inline/new-window":newWindow}});
   for(const [start,end,href,target]of [[0,3,"https://one.test/",false],[3,4,"https://two.test/",true]]){
    const format=link(href,target);
    if(local)owner.execute({kind:"setInlineFormat",data:{change:{kind:"set",formatsJson:JSON.stringify([format])},targets:[{block:"p",start:String(start),end:String(end)}]}});
    else owner.dispatch({commands:[{kind:"set_format",data:{block:"p",offset:start,length:end-start,format,enabled:true}}]});
   }
   if(local)owner.execute({kind:"setSelection",selection:t.range("p",0,4)});else t.a.select(t.range("p",0,4));
   window.patchTest={mode,before:owner.view().documentJson,depth:owner.view().undoDepth};
  },mode);
  const form=page.locator(`${root} [data-${prefix}-control="link"]`);
  await form.locator("summary").click();await expect(form.locator("small")).toContainText("leave a field blank");
  const href=form.locator(`[data-${prefix}-field="link-href"]`),target=form.locator(`[data-${prefix}-field="link-target"]`);
  await expect(href).toHaveValue("");await expect(target).toHaveValue("");
  await href.fill("https://changed.test/path");await href.press("Enter");
  const links=page.locator(`${root} [data-rich-text="p"] a`);
  await expect(links).toHaveCount(2);await expect(links.nth(0)).toHaveAttribute("href","https://changed.test/path");await expect(links.nth(1)).toHaveAttribute("href","https://changed.test/path");
  await expect(links.nth(0)).not.toHaveAttribute("target");await expect(links.nth(1)).toHaveAttribute("target","_blank");
  const result=await page.evaluate(async mode=>{
   const t=mode==="local"?window.sdk:mode==="shared-v1"?window.durableSdk:window.sharedV2,local=mode==="local",owner=local?t.editor:t.a.core;
   const find=(node,id)=>node.properties?.["breditor/block-id"]===id?node:(node.children??[]).map(child=>find(child,id)).find(Boolean);
   const after=owner.view().documentJson,before=window.patchTest.before,delta=owner.view().undoDepth-window.patchTest.depth;
   if(!local){t.b.core.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Peer "}}]});await t.sync();}
   const merged=owner.view().documentJson;if(local)owner.execute({kind:"undo"});else owner.undo();
   const undone=JSON.parse(owner.view().documentJson),oldP=find(JSON.parse(before).root,"p"),undoP=find(undone.root,"p");
   const undo=JSON.stringify(undoP)===JSON.stringify(oldP),peer=local||find(undone.root,"caption").children.map(run=>run.text).join("").startsWith("Peer ");
   if(local)owner.execute({kind:"redo"});else owner.redo();
   const redo=owner.view().documentJson===merged;
   if(local)owner.execute({kind:"setSelection",selection:t.range("p",0,4)});else t.a.select(t.range("p",0,4));
   return {delta,undo,peer,redo,after,errors:t.errors};
  },mode);
  expect(result.delta).toBe(1);expect(result.undo).toBe(true);expect(result.peer).toBe(true);expect(result.redo).toBe(true);expect(result.errors).toEqual([]);
  // Target-only keeps URLs, including when the complete Link state was mixed.
  await form.locator("summary").click();await expect(href).toHaveValue("");await target.selectOption("same");await target.press("Enter");
  await expect(links.nth(0)).toHaveAttribute("href","https://changed.test/path");await expect(links.nth(0)).not.toHaveAttribute("target");
  const saved=await page.evaluate(async mode=>{
   const t=mode==="local"?window.sdk:mode==="shared-v1"?window.durableSdk:window.sharedV2,local=mode==="local",owner=local?t.editor:t.a.core;
   const after=owner.view().documentJson;if(local){owner.execute({kind:"undo"});owner.execute({kind:"redo"});t.save();}else{owner.undo();owner.redo();await t.sync();await t.a.flush();await t.b.flush();}
   if(owner.view().documentJson!==after)throw Error("Target patch future history differs");
   const value={document:owner.view().documentJson,checkpoint:owner.checkpointJson(),errors:t.errors};if(!local){await t.a.close();await t.b.close();}return value;
  },mode);
  expect(saved.errors).toEqual([]);await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");
  expect(await page.evaluate(mode=>{const t=mode==="local"?window.sdk:mode==="shared-v1"?window.durableSdk:window.sharedV2,owner=mode==="local"?t.editor:t.a.core;return {document:owner.view().documentJson,checkpoint:owner.checkpointJson()};},mode)).toEqual({document:saved.document,checkpoint:saved.checkpoint});
  expect(await page.evaluate(mode=>{
   const t=mode==="local"?window.sdk:mode==="shared-v1"?window.durableSdk:window.sharedV2,local=mode==="local",owner=local?t.editor:t.a.core,before=owner.view().documentJson;
   if(local){owner.execute({kind:"undo"});owner.execute({kind:"redo"});}else{owner.undo();owner.redo();}return {exact:owner.view().documentJson===before,errors:t.errors};
  },mode)).toEqual({exact:true,errors:[]});
 });
}
