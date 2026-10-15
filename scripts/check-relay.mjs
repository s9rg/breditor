// Isolated native reference-relay checks. Does not start a server, publish or alter shipping builds.
import {execFileSync} from "node:child_process";
import {existsSync} from "node:fs";
import {homedir} from "node:os";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundled = resolve(homedir(), ".cargo/bin/cargo");
const cargo = process.env.BREDITOR_CARGO ?? (existsSync(bundled) ? bundled : "cargo");
const manifest = "experiments/relay/Cargo.toml";
// Separate workspace/lockfile: do not mix its Rust crate identities with editor fixture rlibs.
const env = {...process.env, CARGO_TARGET_DIR: resolve(root, "target/relay-native"),
  CARGO_PROFILE_DEV_DEBUG: "0", CARGO_PROFILE_TEST_DEBUG: "0", CARGO_INCREMENTAL: "0"};
for (const args of [
  ["fmt", "--manifest-path", manifest, "--check"],
  ["clippy", "--manifest-path", manifest, "--locked", "--all-targets", "--quiet"],
  ["test", "--manifest-path", manifest, "--locked", "--quiet"],
  ["clippy", "--manifest-path", manifest, "--locked", "--features", "server", "--all-targets", "--quiet"],
  ["test", "--manifest-path", manifest, "--locked", "--features", "server", "--quiet"],
  ["build", "--manifest-path", manifest, "--locked", "--features", "server", "--bin", "breditor-collab-relay", "--quiet"],
]) execFileSync(cargo, args, {cwd: root, env, stdio: "inherit"});
