// Local developer demo only. Generated credentials stay in ignored private state, never source
// control or ASTs. The HTTP bootstrap intentionally grants both demo accounts to this local UI.
import {spawn} from "node:child_process";
import {mkdir,readFile,writeFile,lstat} from "node:fs/promises";
import {randomBytes,createHash} from "node:crypto";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),binary=resolve(root,"target/relay-native/debug/examples/network_demo");
const equalJson=(a,b)=>JSON.stringify(JSON.parse(a))===JSON.stringify(JSON.parse(b));
async function once(path,value){try{await writeFile(path,value,{flag:"wx",mode:0o600});}catch(error){if(error.code!=="EEXIST")throw error;if(!equalJson(await readFile(path,"utf8"),value))throw Error("Saved demo profile/input differs; preserve this state and choose a new explicit demo directory");}}
async function launch(command,args,env,match){
 const child=spawn(command,args,{cwd:root,env,stdio:["ignore","pipe","pipe"]});
 const exit=new Promise(resolveExit=>{child.once("exit",(code,signal)=>resolveExit({code,signal}));child.once("error",()=>resolveExit({code:null,signal:null}));});
 let stopPromise;
 const stop=()=>stopPromise??=(async()=>{if(child.exitCode!==null||child.signalCode!==null)return;child.kill("SIGTERM");const timer=setTimeout(()=>child.kill("SIGKILL"),3000);try{await exit;}finally{clearTimeout(timer);}})();
 try{const result=await new Promise((accept,reject)=>{let output="";const timer=setTimeout(()=>reject(Error("Local demo startup timed out")),10_000),fail=error=>{clearTimeout(timer);reject(error);};child.once("error",()=>fail(Error("Demo runtime missing; run the functional build first")));child.once("exit",()=>fail(Error("Local demo exited before listening; check ports and retained state")));child.stderr.on("data",()=>{});child.stdout.on("data",chunk=>{output+=chunk.toString();if(output.length>16_384){fail(Error("Demo startup output budget"));return;}for(const line of output.split("\n").slice(0,-1)){const value=match(line);if(value){clearTimeout(timer);accept(value);return;}}});});return{child,result,exit,stop};}catch(error){await stop();throw error;}
}
/** Start a loopback-only real Rust room plus immutable frontend snapshot. Stopping retains all
 * logs, blobs and credential files; restarting reuses them instead of replacing room history. */
export async function startNetworkDemo({port=49781,relayPort=49782,directory=resolve(root,"target/network-demo-model11-journal12-v1")}={}){
 if(!Number.isInteger(port)||port<1024||port>65535||!Number.isInteger(relayPort)||relayPort<0||relayPort>65535||port===relayPort)throw Error("Invalid local demo ports");
 await mkdir(directory,{recursive:true,mode:0o700});if(!(await lstat(directory)).isDirectory())throw Error("Private demo directory required");
 const vector=JSON.parse(await readFile(resolve(root,"target/collaboration-feasibility-web/native-vector.json"),"utf8")).shared_profile;
 const profile=join(directory,"profile.json"),document=join(directory,"document.json"),credentials=join(directory,"accounts.json"),auth=join(directory,"server-auth.json"),bootstrap=join(directory,"browser-bootstrap.json");
 await once(profile,JSON.stringify(vector.configuration));await once(document,vector.input);
 let tokens;try{tokens=JSON.parse(await readFile(credentials,"utf8"));}catch(error){if(error.code!=="ENOENT")throw error;tokens={alice:randomBytes(32).toString("hex"),bob:randomBytes(32).toString("hex")};await writeFile(credentials,JSON.stringify(tokens),{flag:"wx",mode:0o600});}
 if(Object.keys(tokens).sort().join(",")!=="alice,bob"||Object.values(tokens).some(t=>typeof t!=="string"||!/^[0-9a-f]{64}$/.test(t))||tokens.alice===tokens.bob)throw Error("Invalid retained demo accounts");
 await writeFile(auth,JSON.stringify({format:"breditor/relay-auth",formatVersion:1,origins:[`http://127.0.0.1:${port}`],accounts:Object.entries(tokens).map(([principal,token])=>({principal,tokenHash:[...createHash("sha256").update(token).digest()]}))}),{mode:0o600});
 let relay,frontend;
 try{
  relay=await launch(binary,[join(directory,"room.log"),profile,document,auth,`127.0.0.1:${relayPort}`],process.env,line=>{try{const r=JSON.parse(line);return r.kind==="listening"&&/^127\.0\.0\.1:\d+$/.test(r.address)?r.address:undefined;}catch{return undefined;}});
  const endpoint=`ws://${relay.result}/ws`;
  await writeFile(bootstrap,JSON.stringify({format:"breditor/network-demo",formatVersion:1,endpoint,configuration:vector.configuration,tokens}),{mode:0o600});
  frontend=await launch(process.execPath,["experiments/shared-browser/serve.mjs"],{...process.env,BREDITOR_SHARED_PORT:String(port),BREDITOR_NETWORK_BOOTSTRAP:bootstrap},line=>line.startsWith("Shared editor functional host:")?true:undefined);
  let stopped=false;
  return{url:`http://127.0.0.1:${port}/network-demo`,endpoint,directory,async stop(){if(stopped)return;stopped=true;await frontend.stop();await relay.stop();},closed:Promise.race([relay.exit,frontend.exit])};
 }catch(error){await frontend?.stop();await relay?.stop();throw error;}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{const demo=await startNetworkDemo();console.log(`Network demo: ${demo.url}`);console.log("Loopback developer accounts only; state retained under target/network-demo-model11-journal12-v1. Not public deployment.");const stop=()=>{void demo.stop();};process.once("SIGINT",stop);process.once("SIGTERM",stop);await demo.closed;await demo.stop();}catch(error){console.error(error.message);process.exitCode=1;}
}
