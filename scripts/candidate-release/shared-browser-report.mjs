import assert from "node:assert/strict";

export function sharedBrowserBatchProjects(run,files,configuredProjects){
 if(!run.projects.includes("webkit*"))return new Map(files.map(file=>[file,run.projects]));
 return new Map(run.specs.map(file=>{
  const names=configuredProjects.filter(project=>/^webkit-[1-9][0-9]*$/u.test(project.name)&&
   project.testMatch?.includes(`**/${file}`)).map(project=>project.name);
  assert.equal(names.length,1,`Shared browser spec ${file} must belong to one WebKit project`);
  return [file,names];
 }));
}

export function validateSharedBrowserReport(report,expected){
 const {expected:count,skipped,unexpected,flaky}=report.stats??{};
 assert.ok(Number.isSafeInteger(count)&&count>0&&skipped===0&&unexpected===0&&flaky===0&&
  Array.isArray(report.errors)&&report.errors.length===0,"Shared browser batch must pass without skips or failures");
 const files=new Set(),specs=new Set();
 let executed=0;
 for(const fileSuite of report.suites??[]){
  const file=fileSuite.file,projects=expected.get(file);
  assert.ok(projects&&!files.has(file),"Shared browser batch contains an unexpected or repeated file suite");
  files.add(file);
  const cases=new Map(),suites=[[fileSuite,[]]];
  for(const [suite,parents] of suites){
   const titles=[...parents,suite.title];
   suites.push(...(suite.suites??[]).map(child=>[child,titles]));
   for(const spec of suite.specs??[]){
    assert.ok(typeof spec.id==="string"&&spec.id&&!specs.has(spec.id)&&typeof spec.title==="string"&&
     typeof spec.file==="string"&&Number.isSafeInteger(spec.line)&&Number.isSafeInteger(spec.column),
    `Invalid or repeated shared browser spec in ${file}`);
    specs.add(spec.id);
    // Playwright emits separate spec IDs for the same source case in each project.
    const key=JSON.stringify([titles,spec.title,spec.file,spec.line,spec.column]);
    const observed=cases.get(key)??new Set();
    const tests=spec.tests??[];
    assert.ok(tests.length,`Missing shared browser result in ${file}`);
    for(const test of tests){
     const project=test.projectName;
     assert.ok(projects.includes(project)&&!observed.has(project),`Shared browser spec ran under the wrong project set in ${file}`);
     assert.ok(test.projectId===project&&test.status==="expected"&&test.expectedStatus==="passed"&&
      test.results?.length===1&&test.results[0].status==="passed",`Missing passing shared browser result in ${file}`);
     observed.add(project);
     executed++;
    }
    cases.set(key,observed);
   }
  }
  assert.ok(cases.size,`Missing executed shared browser specs in ${file}`);
  for(const observed of cases.values())assert.equal(observed.size,projects.length,`Shared browser spec ran under the wrong project set in ${file}`);
 }
 assert.equal(files.size,expected.size,"Shared browser batch omitted a planned spec file");
 assert.equal(executed,count,"Shared browser result count differs from the report summary");
}
