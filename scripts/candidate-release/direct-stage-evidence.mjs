/** Compare a direct stage with its plan across checkout and tool locations. */
import assert from "node:assert/strict";
import path,{posix,win32} from "node:path";
import {isDeepStrictEqual} from "node:util";

const toolNames={NODE_BIN:"node",NPM_BIN:"npm",CARGO_BIN:"cargo",WASM_BINDGEN_BIN:"wasm-bindgen"};
// Bind fixed stage settings without freezing caller tools, generated remaps or runtime receipts.
const plannedProofVariables=[
 "BREDITOR_EXPECT_DISCUSSION_TRANSCRIPT","BREDITOR_NATIVE_INPUT_SOURCE_RUNTIME",
 "CARGO_TARGET_DIR","CARGO_PROFILE_DEV_DEBUG","CARGO_INCREMENTAL","RUSTDOCFLAGS","RUST_TEST_THREADS",
 "PLAYWRIGHT_JSON_OUTPUT_FILE",
];

function recordedCheckout(stage,log,paths){
 assert.ok(typeof stage.logPath==="string"&&paths.isAbsolute(stage.logPath),`Missing absolute log path for ${stage.id}`);
 const parts=stage.log.path.split(paths.sep);
 assert.ok(parts.length===4&&parts[0]==="target"&&parts[1]==="v1-candidate-runs"&&
  /^run-[a-z0-9]+$/iu.test(parts[2])&&parts[3]===log,`Unexpected recorded log path for ${stage.id}`);
 const suffix=paths.join(...parts),absolute=paths.normalize(stage.logPath);
 assert.ok(absolute.endsWith(paths.sep+suffix),`Recorded log locations disagree for ${stage.id}`);
 return paths.resolve(absolute.slice(0,-suffix.length));
}

function checkoutValue(value,checkout,paths){
 if(!paths.isAbsolute(value))return value;
 const relative=paths.relative(checkout,value);
 if(paths.isAbsolute(relative)||relative.split(paths.sep)[0]==="..")return value;
 return {checkoutPath:relative.split(paths.sep).join("/")};
}

export function verifyDirectStageEvidence(check,stage,{log,platform,repository,requireHosted}){
 assert.ok(stage.exitCode===0&&stage.signal===null,`Stage process did not exit successfully for ${check.id}`);
 const paths=platform==="win32"?win32:posix;
 const checkout=recordedCheckout(stage,log,paths);
 const tool=Object.keys(toolNames).find(key=>check.command===check.env[key]);
 const command=tool?stage.env?.[tool]:check.command;
 assert.ok(typeof command==="string"&&command&&stage.command===command,`Stage command differs from the plan for ${check.id}`);
 if(requireHosted&&tool){
  assert.ok(paths.basename(command)===toolNames[tool],`Unexpected hosted tool for ${check.id}`);
 }
 assert.ok(Array.isArray(stage.args)&&stage.args.every(argument=>typeof argument==="string"),`Missing stage arguments for ${check.id}`);
 assert.ok(isDeepStrictEqual(stage.args.map(argument=>checkoutValue(argument,checkout,paths)),
  check.args.map(argument=>checkoutValue(argument,repository,path))),`Stage arguments differ from the plan for ${check.id}`);
 for(const name of plannedProofVariables){
  if(!Object.hasOwn(check.env,name))continue;
  const value=stage.env?.[name];
  assert.ok(typeof value==="string"&&isDeepStrictEqual(checkoutValue(value,checkout,paths),
   checkoutValue(check.env[name],repository,path)),`Stage environment differs from the plan for ${check.id} (${name})`);
 }
 return checkout;
}
