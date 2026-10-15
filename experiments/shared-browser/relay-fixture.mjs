// Test lifecycle only. The Rust binary owns actual account/lease/admission/durability authority.
import {spawn, execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdtemp, writeFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const binary = resolve(root, "target/relay-native/debug/breditor-collab-relay");
const execute = promisify(execFile);

export async function createRelay({configuration, input, origin}) {
  const directory = await mkdtemp(join(tmpdir(), "breditor-network-relay-"));
  const log = join(directory, "room.log"), profile = join(directory, "profile.json"), document = join(directory, "document.json"), auth = join(directory, "auth.json");
  const tokens = Object.fromEntries(["owner", "alice", "bob", "reader", "ungranted"].map((principal,i) => [principal,String(i+1).repeat(64)]));
  await writeFile(profile, configuration, {mode:0o600}); await writeFile(document,input,{mode:0o600});
  await writeFile(auth, JSON.stringify({format:"breditor/relay-auth",formatVersion:1,origins:[origin],accounts:Object.entries(tokens).map(([principal,token])=>({principal,tokenHash:[...createHash("sha256").update(token).digest()]}))}),{mode:0o600});
  let child, exit, address;
  async function stop() {
    if (!child) return;
    const current = child; child = undefined;
    current.kill("SIGTERM");
    const timer = setTimeout(()=>current.kill("SIGKILL"), 3000);
    try { await exit; } finally { clearTimeout(timer); }
  }
  async function start() {
    child = spawn(binary,["serve",log,auth,"127.0.0.1:0"],{cwd:root,stdio:["ignore","pipe","pipe"]});
    const current = child;
    exit = new Promise(resolveExit=>{current.once("exit",(code,signal)=>resolveExit({code,signal}));current.once("error",()=>resolveExit({code:null,signal:null}));});
    address = await new Promise((resolveAddress,reject)=>{
      let stdout="",stderr="";
      const timer=setTimeout(()=>reject(Error("Rust relay start timed out")),10_000);
      const fail=error=>{clearTimeout(timer);reject(error);};
      current.once("error",fail);current.once("exit",()=>fail(Error(`Rust relay exited before listening: ${stderr}`)));
      current.stderr.on("data",b=>{stderr=(stderr+b.toString()).slice(-16_384);});
      current.stdout.on("data",b=>{stdout+=b.toString();if(stdout.length>2048){fail(Error("Unbounded relay startup output"));return;}const newline=stdout.indexOf("\n");if(newline<0)return;try{const result=JSON.parse(stdout.slice(0,newline));if(result.kind!=="listening"||!/^127\.0\.0\.1:\d+$/.test(result.address))throw Error("Invalid loopback relay address");clearTimeout(timer);resolveAddress(result.address);}catch(e){fail(e);}});
    });
    return `ws://${address}/ws`;
  }
  try {
    await execute(binary,["init",log,profile,document,"owner"],{cwd:root,timeout:10_000,maxBuffer:16_384});
    const url = await start();
    return {url,tokens,async restart(){await stop();return start();},async dispose(){await stop();await rm(directory,{recursive:true,force:true});}};
  } catch(error) { await stop();await rm(directory,{recursive:true,force:true});throw error; }
}
