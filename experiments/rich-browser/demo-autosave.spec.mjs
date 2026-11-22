import {expect,test} from "@playwright/test";

test("a failed demo save is visible and retry preserves the new checkpoint across reload",async({page})=>{
 await page.goto("/demo");
 const status=page.locator("#saved");
 await expect(status).toHaveText("Saved locally");
 const before=await page.evaluate(async()=>{
  const {editor,autosave,sessions}=window.demo;
  const checkpoint=await sessions.load(),write=sessions.save.bind(sessions);
  let reject=true;
  sessions.save=async value=>{
   if(reject)throw Error("Simulated IndexedDB failure");
   return write(value);
  };
  const point={block:"demo-intro",offset:"0",affinity:"after"};
  editor.execute({kind:"setSelection",selection:{kind:"text",anchor:point,focus:point}},false);
  editor.execute({kind:"insertPlainText",text:"Retry proof. "},false);
  const result=await autosave.flush();
  reject=false;
  return {result:result.status,old:await sessions.load()===checkpoint,exact:editor.checkpointJson()};
 });
 expect(before).toMatchObject({result:"failed",old:true});
 await expect(status).toHaveText("Save paused");
 const retry=page.getByRole("button",{name:"Retry save"});
 await retry.click();
 await expect(status).toHaveText("Saved locally");
 await expect(retry).toBeHidden();
 expect(await page.evaluate(()=>window.demo.sessions.load())).toBe(before.exact);
 await page.reload();
 await expect(status).toHaveText("Saved locally");
 expect(await page.evaluate(()=>window.demo.editor.checkpointJson())).toBe(before.exact);
});
