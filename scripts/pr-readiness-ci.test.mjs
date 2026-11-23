import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const load = file => JSON.parse(readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8"));

test("the fast PR check uses the proposed merge with read-only permissions", () => {
 const workflow = load("pr-readiness.yml");
 assert.deepEqual(workflow.on, {pull_request: {branches: ["main"]}});
 assert.deepEqual(workflow.permissions, {contents: "read"});
 assert.deepEqual(Object.keys(workflow.jobs), ["readiness-contracts"]);
 const job = workflow.jobs["readiness-contracts"];
 assert.equal(job["runs-on"], "ubuntu-24.04");
 assert.equal(job["timeout-minutes"], 10);
 const [checkout, node, contracts] = job.steps;
 const candidateSteps = load("candidate-qualification.yml").jobs.qualify.steps;
 const candidateCheckout = candidateSteps.find(step => step.id === "checkout");
 const candidateNode = candidateSteps.find(step => step.id === "node");
 assert.equal(checkout.uses, candidateCheckout.uses);
 assert.deepEqual(checkout.with, {"persist-credentials": false, "fetch-depth": 1});
 assert.equal(node.uses, candidateNode.uses);
 assert.deepEqual(node.with, candidateNode.with);
 assert.equal(job.steps.length, 3);
 assert.equal(contracts.run, "node --test scripts/check-v1-readiness.test.mjs scripts/candidate-ci.test.mjs scripts/verify-candidate.test.mjs scripts/activation-qualification.test.mjs scripts/pr-readiness-ci.test.mjs scripts/*-candidate-plan.test.mjs");
 assert.equal(contracts.if, undefined);
 assert.equal(contracts["continue-on-error"], undefined);
});
