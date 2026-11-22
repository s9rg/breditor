// Exact immutable production files from the retained clean installed consumer, not workspace modules.
import {createServer} from "node:http";
import {readFileSync,readdirSync} from "node:fs";
import {resolve} from "node:path";
import {editorBrowserPort} from "./port.mjs";
const port=editorBrowserPort();
const consumer=process.env["BREDITOR_EDITOR_CONSUMER"]??JSON.parse(readFileSync("target/editor-installed-consumer.json","utf8")).consumer,resources=new Map(),mime={"html":"text/html; charset=utf-8","js":"text/javascript; charset=utf-8","css":"text/css; charset=utf-8","wasm":"application/wasm"};
function walk(directory,prefix=""){for(const entry of readdirSync(directory,{withFileTypes:true})){const key=`${prefix}/${entry.name}`;if(entry.isDirectory())walk(resolve(directory,entry.name),key);else if(entry.isFile()){const type=mime[entry.name.split(".").at(-1)];if(type)resources.set(key,[type,readFileSync(resolve(directory,entry.name))]);}}}
walk(resolve(consumer,"dist"));resources.set("/",resources.get("/index.html"));
const server=createServer((request,response)=>{const value=request.method==="GET"?resources.get(request.url?.split("?")[0]):undefined;if(!value){response.writeHead(404);response.end("Not found");return;}response.writeHead(200,{"Content-Type":value[0],"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});response.end(value[1]);});
server.listen(port,"127.0.0.1",()=>console.log(`Installed SDK production consumer http://127.0.0.1:${port}/`));for(const signal of ["SIGTERM","SIGINT"])process.on(signal,()=>server.close(()=>process.exit(0)));
