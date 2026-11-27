// Loopback fixture host for the strict Content Security Policy gate. It serves the Vite production
// build of tests/csp/app (target/csp-app) and nothing else. Every HTML response carries a fresh nonce,
// published to the page as <meta property="csp-nonce">, and the exact policy from ./policy.mjs.
// `?policy=style-attributes` selects the documented style-attribute relaxation instead.
import {randomBytes} from "node:crypto";
import {createServer} from "node:http";
import {readFileSync,readdirSync} from "node:fs";
import {dirname,extname,relative,resolve,sep} from "node:path";
import {fileURLToPath} from "node:url";
import {strictContentSecurityPolicy,styleAttributeContentSecurityPolicy} from "./policy.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../.."),output=resolve(root,"target/csp-app");
const types=new Map([[".html","text/html; charset=utf-8"],[".js","text/javascript; charset=utf-8"],[".css","text/css; charset=utf-8"],[".wasm","application/wasm"],[".json","application/json"]]);
const NONCE_PLACEHOLDER="__BREDITOR_CSP_NONCE__";
const resources=new Map();
function walk(directory){
 for(const entry of readdirSync(directory,{withFileTypes:true})){
  const path=resolve(directory,entry.name);
  if(entry.isDirectory()){walk(path);continue;}
  const type=types.get(extname(entry.name));
  if(!entry.isFile()||type===undefined)throw Error(`Unexpected build output ${entry.name}`);
  resources.set(`/${relative(output,path).split(sep).join("/")}`,[type,readFileSync(path)]);
 }
}
walk(output);
for(const page of ["index","shared"])if(!resources.has(`/${page}.html`))throw Error(`Missing ${page}.html; run vite build --config vite.csp.config.ts`);
resources.set("/",resources.get("/index.html"));

const server=createServer((request,response)=>{
 const url=new URL(request.url??"/","http://fixture.invalid"),resource=request.method==="GET"?resources.get(url.pathname):undefined;
 if(!resource){response.writeHead(404,{"Content-Type":"text/plain; charset=utf-8"});response.end("Not found");return;}
 const headers={"Content-Type":resource[0],"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
 let body=resource[1];
 if(resource[0].startsWith("text/html")){
  const policy=url.searchParams.get("policy");
  if(policy!==null&&policy!=="style-attributes"){response.writeHead(400);response.end("Unknown policy");return;}
  const nonce=randomBytes(16).toString("base64");
  const text=body.toString("utf8");
  if(text.split(NONCE_PLACEHOLDER).length!==2)throw Error("Each page publishes exactly one nonce carrier");
  body=Buffer.from(text.replace(NONCE_PLACEHOLDER,nonce));
  headers["Content-Security-Policy"]=policy===null?strictContentSecurityPolicy(nonce):styleAttributeContentSecurityPolicy(nonce);
 }
 response.writeHead(200,headers);response.end(body);
});
const port=Number(process.env["BREDITOR_CSP_PORT"]??49791);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error("Invalid BREDITOR_CSP_PORT");
server.listen(port,"127.0.0.1",()=>console.log(`Strict CSP fixture host: http://127.0.0.1:${port}/`));
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>server.close(()=>process.exit(0)));
