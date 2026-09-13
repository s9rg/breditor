import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { releaseChecks, repository, runReleaseChecks } from "./verify-release.mjs";

test("the plan covers each release boundary in a safe build order", () => {
  const checks = releaseChecks({});
  assert.deepEqual(checks.map(({ id }) => id), [
    "gate-tests", "rust-format", "rust-lint", "rust-tests", "rust-docs",
    "wasm-target-tests", "typescript-tests", "typescript-types",
    "browser-test-types", "demo-test-types", "package-consumers", "wasm-abi",
    "demo-production", "production-size", "browser-matrix", "demo-matrix", "diff-whitespace",
  ]);
  for (const id of ["rust-lint", "rust-tests", "rust-docs"]) {
    assert.ok(checks.find((check) => check.id === id).args.includes("--locked"));
  }
  assert.ok(Object.isFrozen(checks));
  assert.ok(checks.every((check) => Object.isFrozen(check) && Object.isFrozen(check.args)));
  assert.equal(checks.some((check) => check.args.some((arg) => /^(publish|push|tag|install|ci)$/.test(arg))), false);
});

test("executable overrides remain one argv item and docs retain strict warnings", () => {
  const checks = releaseChecks({ CARGO_BIN: "/tool path/cargo", NPM_BIN: "/tool path/npm", RUSTDOCFLAGS: "--cfg custom" });
  assert.equal(checks.find((check) => check.id === "rust-tests").command, "/tool path/cargo");
  assert.equal(checks.find((check) => check.id === "typescript-tests").command, "/tool path/npm");
  assert.equal(checks.find((check) => check.id === "rust-docs").env.RUSTDOCFLAGS, "--cfg custom -D warnings");
});

test("all successful stages run sequentially from the repository without a shell", () => {
  const checks = releaseChecks({});
  let calls = 0;
  const reports = [];
  assert.equal(runReleaseChecks(checks, (command, args, options) => {
    assert.equal(command, checks[calls].command);
    assert.deepEqual(args, checks[calls].args);
    assert.equal(options.cwd, repository);
    assert.equal(options.shell, false);
    calls += 1;
    return { status: 0 };
  }, (message) => reports.push(message)), 0);
  assert.equal(calls, checks.length);
  assert.match(reports.at(-1), /all 17 gates passed/);
});

for (const [name, failure, expected] of [
  ["exit failure", { status: 7 }, 7],
  ["launch failure", { status: null, error: new Error("missing executable") }, 1],
  ["interrupt", { status: null, signal: "SIGINT" }, 130],
  ["termination", { status: null, signal: "SIGTERM" }, 143],
]) {
  test(`${name} stops before later gates and never claims success`, () => {
    let calls = 0;
    const reports = [];
    const result = runReleaseChecks(releaseChecks({}), () => ++calls === 2 ? failure : { status: 0 }, (message) => reports.push(message));
    assert.equal(result, expected);
    assert.equal(calls, 2);
    assert.match(reports.at(-1), /FAILED rust-format/);
    assert.equal(reports.some((message) => /all .* gates passed/.test(message)), false);
  });
}

test("dry-run is explicitly non-executing and rejects unknown options", () => {
  const script = join(repository, "scripts/verify-release.mjs");
  const preview = spawnSync(process.execPath, [script, "--dry-run"], { cwd: "/tmp", encoding: "utf8" });
  assert.equal(preview.status, 0);
  const plan = JSON.parse(preview.stdout);
  assert.equal(plan.executed, false);
  assert.equal(plan.cwd, repository);
  assert.equal(plan.checks.length, 17);
  const rejected = spawnSync(process.execPath, [script, "--skip-tests"], { encoding: "utf8" });
  assert.equal(rejected.status, 2);
  assert.match(rejected.stderr, /unknown argument/);
});

test("a symlinked entry point still runs the gate instead of silently exiting", () => {
  const temporary = mkdtempSync(join(tmpdir(), "breditor-release-entry-"));
  try {
    const alias = join(temporary, "verify-release.mjs");
    symlinkSync(join(repository, "scripts/verify-release.mjs"), alias);
    const preview = spawnSync(process.execPath, [alias, "--dry-run"], { encoding: "utf8" });
    assert.equal(preview.status, 0);
    assert.equal(JSON.parse(preview.stdout).checks.length, 17);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
