import {expect,test} from "@playwright/test";

test("the V4 sections demo supports keyboard expansion, Undo and Redo",async({page,browserName})=>{
 await page.goto("/sections");
 await expect(page.locator("#section-status")).toHaveText("Ready");
 const tab=browserName==="webkit"&&process.platform==="darwin"?"Alt+Tab":"Tab";
 const skip=page.getByRole("link",{name:"Skip to section editor"});
 await page.keyboard.press(tab);
 await expect(skip).toBeFocused();
 await expect(skip).toBeInViewport();
 await page.keyboard.press("Enter");
 await expect(page.getByRole("main")).toBeFocused();

 const body=page.getByText("Open an exact checkpoint",{exact:false});
 await expect(body).toBeHidden();
 const toggle=page.getByRole("button",{name:"Expand/Collapse section",exact:true});
 await expect(toggle).toHaveAttribute("aria-pressed","false");
 await page.keyboard.press(tab);
 await expect(toggle).toBeFocused();
 await page.keyboard.press("Enter");
 await expect(body).toBeVisible();
 await expect(toggle).toHaveAttribute("aria-pressed","true");
 await page.keyboard.press("ControlOrMeta+z");
 await expect(body).toBeHidden();
 await expect(toggle).toHaveAttribute("aria-pressed","false");
 await page.keyboard.press("ControlOrMeta+Shift+z");
 await expect(body).toBeVisible();
 await expect(toggle).toHaveAttribute("aria-pressed","true");
});
