import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import test from "node:test";
import {auditPath, main, repository, summarizeAudit, validateAudit} from "./check-v1-readiness.mjs";

const load = () => JSON.parse(readFileSync(auditPath, "utf8"));

test("the checked-in audit has resolvable sources and evidence without claiming readiness", () => {
  const audit = load();
  assert.equal(validateAudit(audit), audit);
  const result = summarizeAudit(audit);
  assert.equal(result.ledgerComplete, false);
  assert.equal(result.testsExecuted, false);
  assert.equal(result.coverage, "grouped-audit-not-exhaustive");
  assert.equal(Object.values(result.counts).reduce((sum, value) => sum + value, 0), audit.features.length);
  assert.equal(result.openGates.length, audit.gates.filter(row => row.status === "open").length);
  assert.ok(result.featureGaps.some(row => row.id === "basic-inline-formatting"));
  assert.ok(result.openGates.some(row => row.id === "browser-reliability"));
  assert.ok(result.openGates.some(row => row.id === "distribution"));
});

for (const [name, mutate] of [
  ["wrong format", value => {value.formatVersion = 2;}],
  ["invalid date", value => {value.reviewedAt = "2026-02-30";}],
  ["missing date", value => {delete value.reviewedAt;}],
  ["short baseline", value => {value.baselineCommit = "85b21d1";}],
  ["exhaustive claim", value => {value.coverage = "full-parity";}],
  ["no features", value => {value.features = [];}],
  ["no release gates", value => {value.gates = [];}],
  ["duplicate feature", value => {value.features.push(value.features[0]);}],
  ["unknown status", value => {value.features[0].status = "ready";}],
  ["unknown source", value => {value.features[0].sources = ["uninspected-blog"];}],
  ["duplicate source", value => {value.sources.push(value.sources[0]);}],
  ["HTTP source", value => {value.sources[0].url = "http://example.org";}],
  ["empty acceptance", value => {value.features[0].acceptance = " ";}],
  ["missing evidence", value => {value.features[0].evidence = ["docs/not-a-real-evidence-file.md"];}],
  ["outside evidence", value => {value.features[0].evidence = ["../other-project/README.md"];}],
  ["absolute evidence", value => {value.features[0].evidence = [auditPath];}],
  ["duplicate gate", value => {value.gates.push(value.gates[0]);}],
  ["unknown gate state", value => {value.gates[0].status = "skipped";}],
]) {
  test(`invalid ledger rejects ${name} instead of claiming a pass`, () => {
    const audit = load();
    mutate(audit);
    assert.throws(() => validateAudit(audit));
  });
}

test("complete feature labels cannot hide an open qualification gate", () => {
  const audit = load();
  for (const row of audit.features) row.status = "implemented";
  const result = summarizeAudit(audit);
  assert.equal(result.featureGaps.length, 0);
  assert.equal(result.ledgerComplete, false);
  assert.ok(result.openGates.length > 0);
});

test("passed gates cannot hide missing feature groups", () => {
  const audit = load();
  for (const row of audit.gates) row.status = "passed";
  assert.equal(summarizeAudit(audit).ledgerComplete, false);
});

test("even a fully reviewed ledger explicitly does not execute behavioral tests", () => {
  const audit = load();
  for (const row of audit.features) row.status = "implemented";
  for (const row of audit.gates) row.status = "passed";
  const result = summarizeAudit(audit);
  assert.equal(result.ledgerComplete, true);
  assert.equal(result.testsExecuted, false);
});

test("CLI is cwd-independent, read-only and machine readable; the readiness gate fails", () => {
  const script = join(repository, "scripts/check-v1-readiness.mjs");
  const before = readFileSync(auditPath, "utf8");
  const report = spawnSync(process.execPath, [script, "--json"], {cwd: "/tmp", encoding: "utf8"});
  assert.equal(report.status, 0, report.stderr);
  assert.equal(JSON.parse(report.stdout).ledgerComplete, false);
  const gate = spawnSync(process.execPath, [script, "--json", "--require-ready"], {cwd: "/tmp", encoding: "utf8"});
  assert.equal(gate.status, 1, gate.stderr);
  assert.equal(JSON.parse(gate.stdout).testsExecuted, false);
  assert.equal(readFileSync(auditPath, "utf8"), before);
});

test("help and invalid options do not run a gate or hide errors", () => {
  const reports = [], errors = [];
  assert.equal(main(["--help"], value => reports.push(value), value => errors.push(value)), 0);
  assert.match(reports[0], /Does not run tests/);
  for (const args of [["--skip"], ["--help", "--require-ready"], ["--json", "--json"]]) {
    assert.equal(main(args, value => reports.push(value), value => errors.push(value)), 2);
  }
  assert.equal(errors.length, 3);
});

test("workspace scripts expose both reporting and fail-closed qualification guards", () => {
  const {scripts} = JSON.parse(readFileSync(join(repository, "package.json"), "utf8"));
  assert.equal(scripts["audit:v1"], "node scripts/check-v1-readiness.mjs");
  assert.equal(scripts["check:v1"], "node scripts/check-v1-readiness.mjs --require-ready");
  assert.ok(scripts["test:scripts"].includes("scripts/*.test.mjs"));
});
