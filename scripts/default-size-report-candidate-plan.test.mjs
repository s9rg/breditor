import assert from "node:assert/strict";
import test from "node:test";
import {candidateReleasePlan} from "./candidate-release/plan.mjs";
import {defaultSizeBudgetReport,validateDefaultSizeReport} from "./record-default-size-budgets.mjs";
import {releaseChecks} from "./verify-release.mjs";

test("candidate qualification retains early default size results and keeps the full size gate",()=>{
 const {checks}=candidateReleasePlan();
 const position=id=>checks.findIndex(stage=>stage.id===id);
 const recorded=position("capture-default-size-budgets");
 assert.equal(recorded,position("default-typescript-build")+1);
 assert.ok(recorded<position("default-package-release-matrix"));
 assert.deepEqual(checks[recorded].artifacts,[{path:defaultSizeBudgetReport,fresh:true,retain:true}]);
 assert.ok(releaseChecks().some(stage=>stage.id==="production-size"&&stage.args.includes("scripts/check-size-budgets.mjs")));
 assert.deepEqual(candidateReleasePlan({profile:"functional"}).checks[recorded],checks[recorded]);
});

test("evidence preserves budget failures and rejects malformed or misleading results",()=>{
 const report={format:"breditor/default-size-budgets",formatVersion:1,passed:false,
  budgets:[{label:"test artifact",actual:101,maximum:100,remaining:-1,passed:false}]};
 assert.equal(validateDefaultSizeReport(report,1),report);
 assert.throws(()=>validateDefaultSizeReport(report,0));
 assert.throws(()=>validateDefaultSizeReport({...report,passed:true},0));
 report.budgets[0].remaining=1;
 assert.throws(()=>validateDefaultSizeReport(report,1));
});
