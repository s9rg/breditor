/** Build the exact companion relay executables selected by Cargo. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {realpathSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {sourceEvidence} from "./candidate-release/evidence.mjs";
import {metadataReconciliationHosts,retainMetadataReconciliationHosts} from "./candidate-release/metadata-reconciliation-hosts.mjs";
import {nativeSuggestionTarget} from "./candidate-release/native-suggestion-build-evidence.mjs";

assert.deepEqual(process.argv.slice(2),[],"Build all three Native reconciliation fixtures");
const root=realpathSync(fileURLToPath(new URL("../",import.meta.url))),source=sourceEvidence(root);
const cargo=process.env.BREDITOR_CARGO??process.env.CARGO_BIN??"cargo";
const log=execFileSync(cargo,["build","--manifest-path","experiments/relay/Cargo.toml","--features","server",
 "--locked","--offline","--release","--message-format=json",...metadataReconciliationHosts.flatMap(name=>["--example",name])],{
 cwd:root,env:{...process.env,CARGO_TARGET_DIR:join(root,nativeSuggestionTarget)},
 encoding:"utf8",maxBuffer:32*1024*1024,stdio:["ignore","pipe","inherit"],
});
const messages=log.split("\n").filter(Boolean).map(line=>JSON.parse(line));
const outputs=metadataReconciliationHosts.map(name=>{
 const rows=messages.filter(row=>row.reason==="compiler-artifact"&&row.executable&&row.target.name===name&&row.target.kind.includes("example"));
 assert.equal(rows.length,1,"Cargo must report exactly one executable for "+name);
 return rows[0].executable;
});
console.log(JSON.stringify(retainMetadataReconciliationHosts(root,source,outputs)));
