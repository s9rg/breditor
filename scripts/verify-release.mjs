/** One local, non-publishing release gate. Requires the documented toolchain. */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDefaultBrowserReport } from "./candidate-release/default-browser-report.mjs";
import { defaultReleaseBrowserChecks, defaultReleaseBrowserEvidence, defaultReleaseBrowserPath } from "./candidate-release/default-release-browser-evidence.mjs";
import { saveEvidence } from "./candidate-release/evidence.mjs";

export const repository = dirname(dirname(fileURLToPath(import.meta.url)));
/** This pipeline builds default outputs, not the separately assembled nested archive. */
export const releaseScope = "default-packages";
const browserChecks = new Set(defaultReleaseBrowserChecks);
const passed = result => !result.error && !result.signal && result.status === 0;

/** Explicit argv avoids shell interpolation, including executable overrides. */
export function releaseChecks(environment = process.env) {
  const cargo = environment.CARGO_BIN || "cargo";
  const npm = environment.NPM_BIN || "npm";
  const node = process.execPath;
  const check = (id, command, args, env = {}) => Object.freeze({
    id, command, args: Object.freeze(args), env: Object.freeze(env),
  });
  return Object.freeze([
    check("gate-tests", node, ["--test", "scripts/verify-release.test.mjs"]),
    check("rust-format", cargo, ["fmt", "--all", "--", "--check"]),
    check("rust-lint", cargo, ["clippy", "--workspace", "--all-targets", "--all-features", "--locked", "--", "-D", "warnings"]),
    check("rust-tests", cargo, ["test", "--workspace", "--all-features", "--locked"]),
    check("rust-docs", cargo, ["doc", "--workspace", "--all-features", "--no-deps", "--locked"], {
      RUSTDOCFLAGS: `${environment.RUSTDOCFLAGS || ""} -D warnings`.trim(),
    }),
    check("wasm-target-tests", "bash", ["scripts/check-wasm-tests.sh"]),
    // Build the default distributions before workspace tests import them.
    check("package-consumers", npm, ["run", "smoke:packages"]),
    check("typescript-tests", npm, ["run", "test", "--workspaces", "--if-present"]),
    check("diagnostics-tests", npm, ["run", "test:diagnostics"]),
    check("typescript-types", npm, ["run", "typecheck"]),
    check("browser-test-types", npm, ["run", "typecheck:browser"]),
    check("demo-test-types", npm, ["run", "typecheck:demo"]),
    check("wasm-abi", "bash", ["scripts/check-wasm-api.sh"]),
    // The package-consumer gate does not rebuild the React production app.
    check("demo-production", npm, ["run", "build", "--workspace", "@breditor/example-react"]),
    check("production-size", node, ["scripts/check-size-budgets.mjs"]),
    check("browser-matrix", node, [join(repository, "node_modules/@playwright/test/cli.js"), "test"]),
    check("demo-matrix", node, [join(repository, "node_modules/@playwright/test/cli.js"), "test", "-c", "playwright.demo.config.ts"], {
      BREDITOR_RELEASE_DEMO_PREVIEW: "1",
    }),
    check("diff-whitespace", "git", ["diff", "--check"]),
  ]);
}

function browserReport(path) {
  const file = statSync(path);
  if (!file.isFile() || file.size > 32 * 1024 * 1024) throw Error("Expected a bounded Playwright JSON report");
  return JSON.parse(readFileSync(path, "utf8"));
}

function runBrowserCheck(check, options, run, report, evidenceRoot) {
  const directory = mkdtempSync(join(tmpdir(), "breditor-default-browser-"));
  try {
    const invoke = (args, filename) => run(check.command, [...check.args, ...args], {
      ...options, env: { ...options.env, PLAYWRIGHT_JSON_OUTPUT_FILE: filename },
    });
    const discoveryFile = join(directory, "discovery.json"), resultsFile = join(directory, "results.json");
    const discovery = invoke(["--list", "--reporter=json"], discoveryFile);
    if (!passed(discovery)) return discovery;
    const inventory = browserReport(discoveryFile);
    const retained = evidenceRoot && join(evidenceRoot, defaultReleaseBrowserPath(check.id));
    if (retained) saveEvidence(retained, defaultReleaseBrowserEvidence(check.id, inventory));
    const result = invoke(["--reporter=line,json"], resultsFile);
    if (!passed(result)) {
      if (retained && existsSync(resultsFile)) {
        try {
          saveEvidence(retained, defaultReleaseBrowserEvidence(check.id, inventory, browserReport(resultsFile)));
        } catch (error) {
          report(`verify-release: ${check.id} failed-result evidence unavailable: ${error.message}`);
        }
      }
      return result;
    }
    const execution = browserReport(resultsFile);
    if (retained) saveEvidence(retained, defaultReleaseBrowserEvidence(check.id, inventory, execution));
    const verified = validateDefaultBrowserReport(inventory, execution);
    report(`verify-release: ${check.id} verified ${verified.count} passing results in ${verified.projects.join(", ")}`);
    return result;
  } catch (error) {
    report(`verify-release: ${check.id} evidence rejected: ${error.message}`);
    return { status: 1 };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Stop on the first unsuccessful or interrupted process; never report it green. */
export function runReleaseChecks(checks, run = spawnSync, report = console.log, { evidenceRoot } = {}) {
  if (evidenceRoot) {
    for (const id of defaultReleaseBrowserChecks) {
      const path = join(evidenceRoot, defaultReleaseBrowserPath(id));
      mkdirSync(dirname(path), { recursive: true });
      rmSync(path, { force: true });
    }
  }
  for (const [index, check] of checks.entries()) {
    report(`verify-release: [${index + 1}/${checks.length}] ${check.id}`);
    const options = {
      cwd: repository,
      env: { ...process.env, ...check.env },
      stdio: "inherit",
      shell: false,
    };
    const result = browserChecks.has(check.id) ? runBrowserCheck(check, options, run, report, evidenceRoot) : run(check.command, check.args, options);
    if (!passed(result)) {
      report(`verify-release: FAILED ${check.id}; later gates were not run.`);
      return result.signal === "SIGINT" ? 130
        : result.signal === "SIGTERM" ? 143
        : Number.isInteger(result.status) && result.status > 0 ? result.status : 1;
    }
  }
  report(`verify-release: all ${checks.length} gates passed for default packages; opt-in nested lists, physical input and nested budget acceptance are not qualified; nothing published.`);
  return 0;
}

function main(args) {
  if (args.length === 1 && args[0] === "--help") {
    console.log("Usage: node scripts/verify-release.mjs [--dry-run | --candidate-evidence]\nRuns default-package release checks; never publishes packages. Opt-in nested lists, physical input and nested budget acceptance require separate qualification. --dry-run only prints the plan.");
    return 0;
  }
  if (args.length > 1 || (args.length === 1 && !["--dry-run","--candidate-evidence"].includes(args[0]))) {
    console.error("verify-release: unknown argument; use --help.");
    return 2;
  }
  const checks = releaseChecks();
  if (args[0] === "--dry-run") {
    console.log(JSON.stringify({ executed: false, scope: releaseScope, experimentalNestedListsQualified: false, cwd: repository, checks }, null, 2));
    return 0;
  }
  return runReleaseChecks(checks, spawnSync, console.log, { evidenceRoot: args[0] === "--candidate-evidence" ? repository : undefined });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
