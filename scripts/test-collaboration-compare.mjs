// Native diagnostic transport must finish a frame even while its input pipe remains open.
import {spawn} from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {compareEngineExports} from "../experiments/collaboration/browser/compare-exports.mjs";

const executable=fileURLToPath(new URL("../target/collaboration-native/debug/examples/compare_engine_exports",import.meta.url));

test("native comparison completes a request without input EOF",{timeout:10_000},async()=>{
 await new Promise((resolve,reject)=>{
  const child=spawn(executable,[],{stdio:["pipe","ignore","pipe"]});
  let stderr="";
  const timer=setTimeout(()=>{child.kill("SIGKILL");reject(Error("Comparison waited for input EOF"));},5_000);
  child.stderr?.on("data",chunk=>{stderr+=chunk.toString();});
  child.stdin?.on("error",error=>{clearTimeout(timer);child.kill("SIGKILL");reject(error);});
  child.once("error",error=>{clearTimeout(timer);reject(error);});
  child.once("close",(code,signal)=>{
   clearTimeout(timer);child.stdin?.destroy();
   if(code!==0){reject(Error(`Comparison failed: ${code??signal} ${stderr}`));return;}
   resolve();
  });
  child.stdin?.write('{"cases":[]}\n'); // Deliberately no end(): the frame, not EOF, completes input.
 });
});

test("asynchronous comparison preserves an empty result set",{timeout:20_000},async()=>{
 assert.deepEqual(await compareEngineExports([]),[]);
});
