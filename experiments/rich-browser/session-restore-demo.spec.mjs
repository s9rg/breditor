import {expect,test} from "@playwright/test";

test("an invalid backup leaves the local document and history available",async({page})=>{
 await page.goto("/demo");
 await expect(page.locator("#ready")).toContainText("Ready");
 await page.locator('[data-rich-text="demo-intro"]').click();
 await page.keyboard.insertText("Recovery test. ");
 const before=await page.evaluate(()=>window.demo.editor.view().documentJson);
 const checkpoint=await page.evaluate(()=>window.demo.editor.checkpointJson());
 const input=page.getByLabel("Restore session");
 await input.setInputFiles({name:"damaged.json",mimeType:"application/json",buffer:Buffer.from("{invalid")});
 const status=page.locator("#notice");
 await expect(status).toHaveAttribute("role","status");
 await expect(status).toHaveText("Could not read this session backup. Choose a file from Export exact local session.");
 await expect(input).toBeEnabled();
 await expect(input).toHaveValue("");
 expect(await page.evaluate(()=>window.demo.editor.checkpointJson())).toBe(checkpoint);
 await page.getByRole("button",{name:"Undo",exact:true}).click();
 expect(await page.evaluate(()=>window.demo.editor.view().documentJson)).not.toBe(before);
 await page.getByRole("button",{name:"Redo",exact:true}).click();
 expect(await page.evaluate(()=>window.demo.editor.view().documentJson)).toBe(before);
 await input.setInputFiles({name:"working.json",mimeType:"application/json",buffer:Buffer.from(checkpoint)});
 await expect(status).toHaveText("Restored the exact local content and undo/redo branch.");
});
