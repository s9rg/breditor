import assert from "node:assert/strict";

function caseInventory(report,projects,executed){
 assert.ok(Array.isArray(report.suites)&&Array.isArray(report.errors)&&report.errors.length===0,
  "Playwright did not produce a complete browser report");
 const cases=new Set(),observedProjects=new Set();
 for(const fileSuite of report.suites){
  const suites=[fileSuite];
  for(const suite of suites){
   suites.push(...(suite.suites??[]));
   for(const spec of suite.specs??[]){
    for(const test of spec.tests??[]){
     assert.ok(typeof fileSuite.file==="string"&&fileSuite.file&&typeof spec.id==="string"&&spec.id&&
      projects.has(test.projectName)&&test.projectId===test.projectName,"Playwright reported an unknown browser case or project");
     const key=JSON.stringify([fileSuite.file,spec.id,test.projectName]);
     assert.ok(!cases.has(key),"Playwright reported a repeated browser case");
     if(executed)assert.ok(test.status==="expected"&&test.expectedStatus==="passed"&&
      test.results?.length===1&&test.results[0].status==="passed","A discovered browser case did not pass exactly once");
     cases.add(key);
     observedProjects.add(test.projectName);
    }
   }
  }
 }
 assert.equal(observedProjects.size,projects.size,"Playwright omitted a configured browser project");
 return cases;
}

export function validateDefaultBrowserReport(discovered,report){
 const names=discovered.config?.projects?.map(project=>project.name)??[],projects=new Set(names);
 assert.ok(names.length>0&&names.length===projects.size&&names.every(name=>typeof name==="string"&&name),
  "Playwright discovery must name each browser project once");
 const {expected,skipped,unexpected,flaky}=report.stats??{};
 assert.ok(Number.isSafeInteger(expected)&&expected>0&&skipped===0&&unexpected===0&&flaky===0,
  "Browser matrix must pass without skips, flakes or failures");
 const expectedCases=caseInventory(discovered,projects,false),executedCases=caseInventory(report,projects,true);
 assert.equal(executedCases.size,expected,"Browser matrix result count differs from its report summary");
 assert.ok(executedCases.size===expectedCases.size&&[...expectedCases].every(key=>executedCases.has(key)),
  "Browser results differ from the discovered case inventory");
 return {count:executedCases.size,projects:names};
}
