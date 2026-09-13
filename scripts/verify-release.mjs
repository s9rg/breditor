/** One local, non-publishing release gate. Requires the documented toolchain. */
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const repository = dirname(dirname(fileURLToPath(import.meta.url)));

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
    check("typescript-tests", npm, ["test"]),
    check("typescript-types", npm, ["run", "typecheck"]),
    check("browser-test-types", npm, ["run", "typecheck:browser"]),
    check("demo-test-types", npm, ["run", "typecheck:demo"]),
    // This builds/verifies the browser, reference and Wasm packages, including
    // reproducibility, then tests actual packed consumers outside the repo.
    check("package-consumers", npm, ["run", "smoke:packages"]),
    check("wasm-abi", "bash", ["scripts/check-wasm-api.sh"]),
    // The package-consumer gate does not rebuild the React production app.
    check("demo-production", npm, ["run", "build", "--workspace", "@breditor/example-react"]),
    check("production-size", node, ["scripts/check-size-budgets.mjs"]),
    check("browser-matrix", node, [join(repository, "node_modules/@playwright/test/cli.js"), "test"]),
    check("demo-matrix", node, [join(repository, "node_modules/@playwright/test/cli.js"), "test", "-c", "playwright.demo.config.ts"]),
    check("diff-whitespace", "git", ["diff", "--check"]),
  ]);
}

/** Stop on the first unsuccessful or interrupted process; never report it green. */
export function runReleaseChecks(checks, run = spawnSync, report = console.log) {
  for (const [index, check] of checks.entries()) {
    report(`verify-release: [${index + 1}/${checks.length}] ${check.id}`);
    const result = run(check.command, check.args, {
      cwd: repository,
      env: { ...process.env, ...check.env },
      stdio: "inherit",
      shell: false,
    });
    if (result.error || result.signal || result.status !== 0) {
      report(`verify-release: FAILED ${check.id}; later gates were not run.`);
      return result.signal === "SIGINT" ? 130
        : result.signal === "SIGTERM" ? 143
        : Number.isInteger(result.status) && result.status > 0 ? result.status : 1;
    }
  }
  report(`verify-release: all ${checks.length} gates passed; nothing published.`);
  return 0;
}

function main(args) {
  if (args.length === 1 && args[0] === "--help") {
    console.log("Usage: node scripts/verify-release.mjs [--dry-run]\nRuns all local release checks; never publishes packages. --dry-run only prints the plan.");
    return 0;
  }
  if (args.length > 1 || (args.length === 1 && args[0] !== "--dry-run")) {
    console.error("verify-release: unknown argument; use --help.");
    return 2;
  }
  const checks = releaseChecks();
  if (args[0] === "--dry-run") {
    console.log(JSON.stringify({ executed: false, cwd: repository, checks }, null, 2));
    return 0;
  }
  return runReleaseChecks(checks);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
