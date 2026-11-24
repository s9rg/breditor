import {expect,test} from "@playwright/test";

test("installed original journals retain offline edits and both history directions across two seals and portable recovery",async({page,browser},testInfo)=>{
 await page.goto("/shared-generation-rollover.html");
 const result=page.locator("#result");
 await expect(result).toContainText('"passed"',{timeout:330000});
 const report=JSON.parse(await result.textContent());
 await testInfo.attach("shared-generation-rollover",{
  contentType:"application/json",
  body:JSON.stringify({...report,browserVersion:browser.version()},null,2),
 });
 expect(report,report.reason).toMatchObject({
  passed:true,rounds:115,exactLegacyRoots:2,explicitSeals:4,exactPeerReopens:6,
  portableRecoveryRestores:2,heldWriterRefusals:2,occupiedDestinationRefusals:2,unchangedSegmentedSources:2,
  legacyDatabasesReopened:2,offlineEditPreserved:true,preCutRedoItemsRestored:2,preBoundaryUndoAndRedoPreserved:true,
 });
 expect(report.legacyBytes.every(bytes=>bytes<=16*1024*1024)).toBe(true);
 expect(report.archiveBytes.every(bytes=>bytes>16*1024*1024)).toBe(true);
});

for(const retirement of ["upgrade","discard","discard-reject"])test(`installed generation save fences an obsolete browser journal after ${retirement}`,async({page})=>{
 await page.goto(`/shared-generation-rollover.html?retirement=${retirement}`);
 const result=page.locator("#result");
 await expect(result).toContainText('"passed"',{timeout:15000});
 const report=JSON.parse(await result.textContent());
 expect(report,report.reason).toEqual({passed:true,upgrade:retirement==="upgrade",hashRejected:retirement==="discard-reject",obsoleteAttempts:0,
  unchangedRows:true,exactReadAndRestore:retirement==="upgrade"});
});

test("installed generation admission refuses existing malformed heads before native replay",async({page})=>{
 await page.goto("/shared-generation-rollover.html?headAdmission=1");
 const result=page.locator("#result");
 await expect(result).toContainText('"passed"',{timeout:15000});
 const report=JSON.parse(await result.textContent());
 expect(report,report.reason).toEqual({passed:true,malformedHeadRefusals:5,insertOnlyRaceRefusal:true,exactReopen:true});
});
