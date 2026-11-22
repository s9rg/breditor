import {expect,test} from "@playwright/test";

test("the V4 sections demo edits real section state with Undo and Redo",async({page})=>{
 await page.goto("/sections");
 await expect(page.locator("#section-status")).toHaveText("Ready");
 const body=page.getByText("Open an exact checkpoint",{exact:false});
 await expect(body).toBeHidden();
 const section=page.locator("[data-rich-block='second']");
 await section.getByRole("button",{name:"Expand/Collapse section",exact:true}).click();
 await expect(body).toBeVisible();
 await page.getByRole("button",{name:"Undo",exact:true}).click();
 await expect(body).toBeHidden();
 await page.getByRole("button",{name:"Redo",exact:true}).click();
 await expect(body).toBeVisible();
});
