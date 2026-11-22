import {expect,test} from "@playwright/test";

test("the demo exposes its real shortcut reference and restores focus",async({page})=>{
 await page.goto("/demo");
 await expect(page.locator("#ready")).toContainText("Ready");
 const trigger=page.getByRole("button",{name:"Keyboard shortcuts",exact:true});
 const dialog=page.getByRole("dialog",{name:"Keyboard shortcuts"});
 await trigger.focus();
 await page.keyboard.press("Enter");
 await expect(dialog).toBeFocused();
 await expect(dialog.locator('[data-shortcut="undo"] kbd')).toBeVisible();
 await expect(dialog.locator('[data-shortcut="ui:selection-toolbar"] kbd')).toBeVisible();
 await page.keyboard.press("Escape");
 await expect(dialog).toBeHidden();
 await expect(trigger).toBeFocused();

 const editor=page.locator(".breditor-rich-surface");
 await editor.focus();
 await page.keyboard.press("Alt+Digit0");
 await expect(dialog).toBeVisible();
 await dialog.getByRole("button",{name:"Close"}).click();
 await expect(dialog).toBeHidden();
 await expect(editor).toBeFocused();
});
