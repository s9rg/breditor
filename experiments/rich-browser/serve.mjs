// Exact localhost test resources. This is not the collaboration relay or production host.
import {createServer} from "node:http";
import {readFileSync,readdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const artifacts=resolve(root,"packages/breditor-experimental-rich-content/dist");
const resources=new Map([
  ["/",["text/html; charset=utf-8",Buffer.from(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Breditor rich owner contracts</title><h1>Rich owner functional checks</h1><p>Real generated Rust/Wasm, not a JavaScript editor model.</p><pre id="status">Loading…</pre><script type="module">import init,* as wasm from '/wasm.js';import {compileRichProfile} from '/rich.js';await init();window.rich={wasm,compileRichProfile,root:await(await fetch('/root.json')).json()};document.querySelector('#status').textContent='Ready';</script></html>`) ]],
  ["/wasm.js",["text/javascript; charset=utf-8",readFileSync(resolve(artifacts,"breditor_wasm.js"))]],
  ["/breditor_wasm_bg.wasm",["application/wasm",readFileSync(resolve(artifacts,"breditor_wasm_bg.wasm"))]],
  ["/rich.js",["text/javascript; charset=utf-8",readFileSync(resolve(root,"packages/breditor-experimental-rich-content/index.js"))]],
  ["/root.json",["application/json",readFileSync(resolve(root,"crates/breditor-core/tests/fixtures/rich-local-root.json"))]],
]);
// wasm-bindgen's inline JS helpers are part of the matching module graph.
// Inventory only generated regular files; requests still use an exact whitelist.
const snippets=resolve(artifacts,"snippets");
for(const directory of readdirSync(snippets,{withFileTypes:true})){
 if(!directory.isDirectory())throw Error("Unexpected generated snippet entry");
 for(const file of readdirSync(resolve(snippets,directory.name),{withFileTypes:true})){
  if(!file.isFile()||!file.name.endsWith(".js"))throw Error("Unexpected generated helper file");
  resources.set(`/snippets/${directory.name}/${file.name}`,["text/javascript; charset=utf-8",readFileSync(resolve(snippets,directory.name,file.name))]);
 }
}
const server=createServer((request,response)=>{
 const resource=request.method==="GET"?resources.get(request.url):undefined;
 if(!resource){response.writeHead(404);response.end("Not found");return;}
 response.writeHead(200,{"Content-Type":resource[0],"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});response.end(resource[1]);
});
server.listen(49773,"127.0.0.1",()=>console.log("Rich owner contract host: http://127.0.0.1:49773/"));
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>server.close(()=>process.exit(0)));
