/** Validate actual results across Playwright’s separate project/file suites. */
import assert from "node:assert/strict";

export function validateApplicationNetworkReport(report){
 const {expected,skipped,unexpected,flaky}=report.stats;
 assert.ok(Number.isSafeInteger(expected)&&expected>0);
 assert.deepEqual({skipped,unexpected,flaky},{skipped:0,unexpected:0,flaky:0});
 const pilotCases=[
  "the first-party pilot opens independent participants and verifies an offline checkpoint after reload",
  "the pilot supports keyboard sign-in and checkpoint recovery at a narrow viewport",
 ];
 const pilotSpecs=report.suites.filter(suite=>suite.file==="network-demo.spec.mjs").flatMap(suite=>suite.specs??[]);
 for(const title of pilotCases){
  const tests=pilotSpecs.filter(spec=>spec.title===title).flatMap(spec=>spec.tests);
  assert.ok(tests.length,`Missing application network pilot case: ${title}`);
  const engines=tests.map(test=>{
   assert.deepEqual(test.results.map(result=>result.status),["passed"],title);
   return test.projectName.replace(/^webkit-[0-9]+$/,"webkit");
  }).sort();
  assert.deepEqual(engines,["chromium","firefox","webkit"],title);
 }
}
