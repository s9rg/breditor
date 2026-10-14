// Exact localhost test resources. This is not the collaboration relay or production host.
import {createServer} from "node:http";
import {readFileSync,readdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const artifacts=resolve(root,"packages/breditor-experimental-rich-content/dist");
const resources=new Map([
  ["/",["text/html; charset=utf-8",Buffer.from(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Breditor rich owner contracts</title><h1>Rich owner functional checks</h1><p>Real generated Rust/Wasm, not a JavaScript editor model.</p><pre id="status">Loading…</pre><script type="module">import init,* as wasm from '/wasm.js';import {compileRichProfile,mountRichEditor,defaultToolbar,RichAssetStore,insertImageFiles} from '/rich.js';await init();window.rich={wasm,compileRichProfile,mountRichEditor,defaultToolbar,RichAssetStore,insertImageFiles,root:await(await fetch('/root.json')).json()};document.querySelector('#status').textContent='Ready';</script></html>`) ]],
  ["/wasm.js",["text/javascript; charset=utf-8",readFileSync(resolve(artifacts,"breditor_wasm.js"))]],
  ["/breditor_wasm_bg.wasm",["application/wasm",readFileSync(resolve(artifacts,"breditor_wasm_bg.wasm"))]],
  ["/rich.js",["text/javascript; charset=utf-8",readFileSync(resolve(root,"packages/breditor-experimental-rich-content/index.js"))]],
  ["/root.json",["application/json",readFileSync(resolve(root,"crates/breditor-core/tests/fixtures/rich-local-root.json"))]],
  ["/demo.mjs",["text/javascript; charset=utf-8",readFileSync(resolve(root,"experiments/rich-browser/demo.mjs"))]],
  ["/demo",["text/html; charset=utf-8",Buffer.from(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Breditor rich content demo</title><style>body{margin:0;padding:30px;background:#f2f5ef;font:16px system-ui;color:#173d37}header,footer{max-width:1100px;margin:0 auto 22px}h1{margin:0 0 8px;font-size:36px}header p{max-width:850px;line-height:1.5}.tools{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:13px}#export{padding:8px 12px}#notice{color:#526f65}#assets{font-size:12px;padding-left:20px}#assets li{margin:6px 0}#assets button{margin-left:10px}</style><header><h1>breditor</h1><p>Rich content powered by the original Rust core. Select cell + Shift-select creates a grid range; Enter returns to cell text. Image captions are editable. Use <code>alternate-asset</code> in Image asset to try an immutable asset replacement.</p><p id="ready">Loading matching Wasm…</p><div class="tools"><button id="export">Export exact local session</button><label>Restore session <input id="import" type="file" accept="application/json,.json"></label><label>Add image files <input id="images" type="file" multiple accept="image/png,image/jpeg,image/webp"></label><span id="revision"></span><span id="saved"></span></div><p id="notice">Files and exact local history survive reload in this tab. Uploads stay pending until a host provider is connected. Shared collaboration remains implementation work; this is not a production release.</p><details><summary>Offline image queue (bytes are retained for history)</summary><ul id="assets"></ul></details></header><main id="editor"></main><footer><p>Default Breditor packages are unchanged. No document data or asset bytes are sent to a server by this demo. Exported session JSON does not include asset bytes; retain this browser storage.</p></footer><script type="module" src="/demo.mjs"></script></html>`) ]],
]);
function browserModules(directory,prefix){
 for(const file of readdirSync(directory,{withFileTypes:true})){
  if(file.isDirectory())browserModules(resolve(directory,file.name),`${prefix}/${file.name}`);
  else if(file.isFile()&&file.name.endsWith(".js"))resources.set(`${prefix}/${file.name}`,["text/javascript; charset=utf-8",readFileSync(resolve(directory,file.name))]);
 }
}
browserModules(resolve(artifacts,"browser"),"/dist/browser");
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
