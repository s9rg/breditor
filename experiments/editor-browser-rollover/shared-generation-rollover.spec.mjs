import {expect,test} from "@playwright/test";

test("installed original journals retain offline edits and Undo across a generation",async({page,browser},testInfo)=>{
 await page.goto("/shared-generation-rollover.html");
 const result=page.locator("#result");
 await expect(result).toContainText('"passed"',{timeout:330000});
 const report=JSON.parse(await result.textContent());
 await testInfo.attach("shared-generation-rollover",{
  contentType:"application/json",
  body:JSON.stringify({...report,browserVersion:browser.version()},null,2),
 });
 expect(report,report.reason).toMatchObject({
  passed:true,rounds:115,exactLegacyRoots:2,explicitSeals:2,exactPeerReopens:4,
  legacyDatabasesReopened:2,offlineEditPreserved:true,preBoundaryUndoAndRedoPreserved:true,
 });
 expect(report.legacyBytes.every(bytes=>bytes<=16*1024*1024)).toBe(true);
 expect(report.archiveBytes.every(bytes=>bytes>16*1024*1024)).toBe(true);
});
