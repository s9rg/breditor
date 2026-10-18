import assert from "node:assert/strict";
import test from "node:test";
import {inputRuleProofPolicy,parseInputRuleUiArguments,parseInputRuleInstalledArguments} from "./input-rule-probe-policy.mjs";

test("the default input-rule proof requires every independently pinned historical pair",()=>{
 const policy=inputRuleProofPolicy();assert.equal(policy.historicalReferences,true);assert.equal(policy.expectedStartupRefusals,8);assert.equal(policy.expectedLegacyReplacementRefusals,1);assert.deepEqual(policy.deferred,[]);
 const directories=["new-local","new-shared","old-local","old-shared","prior-local","prior-shared"],parsed=parseInputRuleUiArguments(directories);assert.deepEqual(parsed.directories,directories);assert.deepEqual(parsed.policy,policy);
 for(const args of [[],directories.slice(0,2),directories.slice(0,4),[...directories,"extra"],[...directories.slice(0,5),""],[...directories.slice(0,5),"--unknown"]])assert.throws(()=>parseInputRuleUiArguments(args));
});
test("portable current-runtime proof is explicit, immutable and does not claim historical qualification",()=>{
 const {policy,directories}=parseInputRuleUiArguments(["--current-runtime-only","local","shared"]);assert.equal(policy.mode,"current-runtime-only");assert.equal(policy.historicalReferences,false);assert.equal(policy.expectedStartupRefusals,4);assert.equal(policy.expectedLegacyReplacementRefusals,0);assert.equal(policy.deferred.length,3);assert.deepEqual(directories,["local","shared",undefined,undefined,undefined,undefined]);
 for(const object of [policy,policy.deferred,directories])assert.ok(Object.isFrozen(object));assert.throws(()=>inputRuleProofPolicy("auto"));assert.throws(()=>inputRuleProofPolicy(null));
 for(const args of [["local","shared","--current-runtime-only"],["--current-runtime-only","local"],["--current-runtime-only","local","shared","old"],["--current-runtime-only","local","--current-runtime-only"]])assert.throws(()=>parseInputRuleUiArguments(args));
});
test("installed proof defaults to fresh producers plus historical references, with no automatic fallback",()=>{
 assert.deepEqual(parseInputRuleInstalledArguments([]),{reusedRuntimes:false,policy:inputRuleProofPolicy()});
 for(const args of [["--reuse-runtimes"],["--current-runtime-only"],["--reuse-runtimes","--current-runtime-only"],["--current-runtime-only","--reuse-runtimes"]]){const parsed=parseInputRuleInstalledArguments(args);assert.equal(parsed.reusedRuntimes,args.includes("--reuse-runtimes"));assert.equal(parsed.policy.historicalReferences,!args.includes("--current-runtime-only"));assert.ok(Object.isFrozen(parsed));}
 for(const args of [["--skip-tests"],["--current-runtime-only","--current-runtime-only"],["--reuse-runtimes","--reuse-runtimes"],["local","shared"]])assert.throws(()=>parseInputRuleInstalledArguments(args));
});
