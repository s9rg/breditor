import {expect,test} from "@playwright/test";

test("installed original journals retain offline edits and both history directions across two seals and portable recovery",async({page,browser},testInfo)=>{
 const progress=[],prefix="breditor-rollover ";
 page.on("console",message=>{
  const line=message.text();
  if(!line.startsWith(prefix))return;
  progress.push(JSON.parse(line.slice(prefix.length)));
  console.log(line);
 });
 const result=page.locator("#result");
 try{
  await page.goto("/shared-generation-rollover.html");
  await expect(result).toContainText('"passed"',{timeout:330000});
 }finally{
  await testInfo.attach("shared-generation-rollover-progress",{contentType:"application/json",body:JSON.stringify(progress)});
 }
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
 expect(report.progress).toEqual(progress);
 expect(progress.map(({stage,round})=>[stage,round])).toEqual([
  ["legacy-opened",0],...Array.from({length:10},(_,index)=>["rounds",10*(index+1)]),
  ["legacy-rounds-completed",105],["roots-cold-reopened",105],["sealed-two",105],["sealed-three",105],
  ["sealed-cut-cold-reopened",105],["destinations-restored",105],["offline-frame-and-history-verified",106],
  ["rounds",110],["restored-cut-cold-reopened",115],["newer-destinations-verified",115],["sources-cold-reopened",115],
 ]);
 expect(progress.every(({elapsedMs},index)=>Number.isSafeInteger(elapsedMs)&&elapsedMs>=(progress[index-1]?.elapsedMs??0))).toBe(true);
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

test("installed independent history refuses an occupied undefined head before native creation or replay",async({page})=>{
 await page.goto("/shared-generation-rollover.html?independentHead=1");
 const result=page.locator("#result");
 await expect(result).toContainText('"passed"',{timeout:15000});
 const report=JSON.parse(await result.textContent());
 expect(report,report.reason).toEqual({passed:true,malformedHeadRefusals:2,insertOnlyRaceRefusal:true,exactRecoveredLanes:2});
});

for(const rejectDigest of [false,true])test(`installed independent history retires a ${rejectDigest?"rejected":"completed"} save digest during upgrade`,async({page})=>{
 await page.goto(`/shared-generation-rollover.html?independentUpgrade=${rejectDigest?"rejected":"resolved"}`);
 const result=page.locator("#result");
 await expect(result).toContainText('"passed"',{timeout:15000});
 const report=JSON.parse(await result.textContent());
 expect(report,report.reason).toEqual({passed:true,rejectDigest,obsoleteWrites:0,exactRecoveredLanes:2});
});
