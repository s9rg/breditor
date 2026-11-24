/** Generate the Native seed for either shared browser matrix in a clean checkout. */
import {execFileSync} from "node:child_process";
import {mkdirSync} from "node:fs";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("../",import.meta.url));
const directory=fileURLToPath(new URL("../target/collaboration-feasibility-web/",import.meta.url));
mkdirSync(directory,{recursive:true});
execFileSync(process.env.BREDITOR_CARGO??process.env.CARGO_BIN??"cargo",
 ["run","--manifest-path","experiments/collaboration/Cargo.toml","--locked","--offline",
  "--example","export_vector","--","target/collaboration-feasibility-web/native-vector.json"],
 {cwd:root,stdio:"inherit"});
