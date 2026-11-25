// Loopback demo and pilot. The developer UI receives its demo tokens. Pilot participants
// enter their separately supplied code and the browser bootstrap contains no credentials.
import {spawn} from "node:child_process";
import {constants,createReadStream} from "node:fs";
import {mkdir,readFile,writeFile,lstat,open,mkdtemp,rename,rm} from "node:fs/promises";
import {randomBytes,createHash} from "node:crypto";
import {resolve,dirname,join,basename} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),binary=resolve(root,"target/relay-native/debug/examples/network_demo");
const equalJson=(a,b)=>JSON.stringify(JSON.parse(a))===JSON.stringify(JSON.parse(b));
const readText=path=>readFile(path,"utf8");
async function fileSha256(path){
 const digest=createHash("sha256");
 for await(const bytes of createReadStream(path))digest.update(bytes);
 return digest.digest("hex");
}
const writeState=(path,value)=>writeFile(path,value,{mode:0o600});
function assertPrivatePilotFile(path,stats){
 if(!stats.isFile()||(process.platform!=="win32"&&(stats.mode&0o077)!==0)){
  throw Error(`Use a private regular pilot state file for ${basename(path)}`);
 }
}
async function checkPilotFile(path,allowMissing=false){
 try{assertPrivatePilotFile(path,await lstat(path));}
 catch(error){if(!allowMissing||error.code!=="ENOENT")throw error;}
}
async function readPilotFile(path){
 await checkPilotFile(path);
 const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
 try{assertPrivatePilotFile(path,await file.stat());return await file.readFile("utf8");}
 finally{await file.close();}
}
async function replacePilotFile(path,value){
 await checkPilotFile(path,true);
 // A private sibling is fully written before replacing the mutable launcher state.
 const directory=await mkdtemp(join(dirname(path),".pilot-update-")),temporary=join(directory,"state");
 try{await writeFile(temporary,value,{flag:"wx",mode:0o600});await rename(temporary,path);}
 finally{await rm(directory,{recursive:true,force:true});}
}
async function once(path,value,read){try{await writeFile(path,value,{flag:"wx",mode:0o600});}catch(error){if(error.code!=="EEXIST")throw error;if(!equalJson(await read(path),value))throw Error("Saved demo profile/input differs; preserve this state and choose a new explicit demo directory");}}
async function launch(command,args,env,match){
 const child=spawn(command,args,{cwd:root,env,stdio:["ignore","pipe","pipe"]});
 const exit=new Promise(resolveExit=>{child.once("exit",(code,signal)=>resolveExit({code,signal}));child.once("error",()=>resolveExit({code:null,signal:null}));});
 let stopPromise;
 const stop=()=>stopPromise??=(async()=>{if(child.exitCode!==null||child.signalCode!==null)return;child.kill("SIGTERM");const timer=setTimeout(()=>child.kill("SIGKILL"),3000);try{await exit;}finally{clearTimeout(timer);}})();
 try{const result=await new Promise((accept,reject)=>{let output="";const timer=setTimeout(()=>reject(Error("Local demo startup timed out")),10_000),fail=error=>{clearTimeout(timer);reject(error);};child.once("error",()=>fail(Error("Demo runtime missing; run the functional build first")));child.once("exit",()=>fail(Error("Local demo exited before listening; check ports and retained state")));child.stderr.on("data",()=>{});child.stdout.on("data",chunk=>{output+=chunk.toString();if(output.length>16_384){fail(Error("Demo startup output budget"));return;}for(const line of output.split("\n").slice(0,-1)){const value=match(line);if(value){clearTimeout(timer);accept(value);return;}}});});return{child,result,exit,stop};}catch(error){await stop();throw error;}
}
/** Start a loopback-only real Rust room plus immutable frontend snapshot. Stopping retains all
 * logs, blobs and credential files; restarting reuses them instead of replacing room history. */
export async function startNetworkDemo({
 pilot=false,port=pilot?49783:49781,relayPort=pilot?49784:49782,
 directory=resolve(root,pilot?"target/pilot-model11-journal12-v1":"target/network-demo-model11-journal12-v1"),
}={}){
 if(typeof pilot!=="boolean")throw TypeError("Expected a Boolean pilot option");
 const receipt=resolve(root,"target/editor-installed-consumer.json");
 if(pilot){
  try{await lstat(receipt);}
  catch(error){if(error.code!=="ENOENT")throw error;throw Error("Prepare the installed SDK with node scripts/check-editor-package.mjs first");}
 }
 if(!Number.isInteger(port)||port<1024||port>65535||!Number.isInteger(relayPort)||relayPort<0||relayPort>65535||port===relayPort)throw Error("Invalid local demo ports");
 await mkdir(directory,{recursive:true,mode:0o700});
 const state=await lstat(directory);
 if(!state.isDirectory()||(pilot&&process.platform!=="win32"&&(state.mode&0o077)!==0))throw Error("Private demo directory required");
 const profile=join(directory,"profile.json"),document=join(directory,"document.json"),credentials=join(directory,"accounts.json"),auth=join(directory,"server-auth.json"),bootstrap=join(directory,"browser-bootstrap.json");
 if(pilot)await Promise.all([profile,document,credentials,auth,bootstrap].map(path=>checkPilotFile(path,true)));
 const receiptSha256=pilot?await fileSha256(receipt):undefined;
 const relaySha256=pilot?await fileSha256(binary):undefined;
 const read=pilot?readPilotFile:readText,write=pilot?replacePilotFile:writeState;
 const vector=JSON.parse(await readFile(resolve(root,"target/collaboration-feasibility-web/native-vector.json"),"utf8")).shared_profile;
 let input=vector.input;
 if(pilot){
  const seed=JSON.parse(input);
  seed.root=JSON.parse(await readFile(resolve(root,"experiments/shared-browser/pilot-root.json"),"utf8"));
  input=JSON.stringify(seed);
 }
 await once(profile,JSON.stringify(vector.configuration),read);await once(document,input,read);
 let tokens;try{tokens=JSON.parse(await read(credentials));}catch(error){if(error.code!=="ENOENT")throw error;tokens={alice:randomBytes(32).toString("hex"),bob:randomBytes(32).toString("hex")};await writeFile(credentials,JSON.stringify(tokens),{flag:"wx",mode:0o600});}
 if(Object.keys(tokens).sort().join(",")!=="alice,bob"||Object.values(tokens).some(t=>typeof t!=="string"||!/^[0-9a-f]{64}$/.test(t))||tokens.alice===tokens.bob)throw Error("Invalid retained demo accounts");
 await write(auth,JSON.stringify({format:"breditor/relay-auth",formatVersion:1,origins:[`http://127.0.0.1:${port}`],accounts:Object.entries(tokens).map(([principal,token])=>({principal,tokenHash:[...createHash("sha256").update(token).digest()]}))}));
 let relay,frontend;
 try{
  relay=await launch(binary,[join(directory,"room.log"),profile,document,auth,`127.0.0.1:${relayPort}`],process.env,line=>{try{const r=JSON.parse(line);return r.kind==="listening"&&/^127\.0\.0\.1:\d+$/.test(r.address)?r.address:undefined;}catch{return undefined;}});
  const endpoint=`ws://${relay.result}/ws`;
  const settings={format:pilot?"breditor/first-party-pilot":"breditor/network-demo",formatVersion:1,endpoint,configuration:vector.configuration};
  await write(bootstrap,JSON.stringify(pilot?settings:{...settings,tokens}));
  const frontendEnv={...process.env,BREDITOR_SHARED_PORT:String(port)};
  delete frontendEnv.BREDITOR_NETWORK_BOOTSTRAP;
  delete frontendEnv.BREDITOR_PILOT_BOOTSTRAP;
  delete frontendEnv.BREDITOR_PILOT_RELAY_SHA256;
  if(pilot){
   frontendEnv.BREDITOR_PILOT_BOOTSTRAP=bootstrap;
   frontendEnv.BREDITOR_SHARED_INSTALLED="application";
   frontendEnv.BREDITOR_SHARED_INSTALLED_RECEIPT_SHA256=receiptSha256;
   frontendEnv.BREDITOR_PILOT_RELAY_SHA256=relaySha256;
  }else frontendEnv.BREDITOR_NETWORK_BOOTSTRAP=bootstrap;
  frontend=await launch(process.execPath,["experiments/shared-browser/serve.mjs"],frontendEnv,line=>line.startsWith("Shared editor functional host:")?true:undefined);
  if(pilot&&await fileSha256(binary)!==relaySha256)throw Error("Pilot relay executable changed during startup");
  let stopped=false;
  return{url:`http://127.0.0.1:${port}/${pilot?"pilot":"network-demo"}`,endpoint,directory,async stop(){if(stopped)return;stopped=true;await frontend.stop();await relay.stop();},closed:Promise.race([relay.exit,frontend.exit])};
 }catch(error){await frontend?.stop();await relay?.stop();throw error;}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2),pilot=args[0]==="--pilot";
  if(args.length!==0&&(args.length!==1||!pilot))throw Error("Usage: node scripts/demo-shared-relay.mjs [--pilot]");
  const demo=await startNetworkDemo({pilot});
  console.log(`${pilot?"Breditor pilot":"Network demo"}: ${demo.url}`);
  console.log(pilot?`Private participant codes: ${join(demo.directory,"accounts.json")}`:`Loopback developer accounts and state: ${demo.directory}`);
  const stop=()=>{void demo.stop();};
  process.once("SIGINT",stop);process.once("SIGTERM",stop);
  await demo.closed;await demo.stop();
 }catch(error){console.error(error.message);process.exitCode=1;}
}
