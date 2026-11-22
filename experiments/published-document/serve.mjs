import {createServer} from "node:http";
import {renderStaticDocument} from "@breditor/editor/static";

const text=value=>({kind:"text",text:value,formats:[]});
const block=(type,id,properties={},children=[])=>({
 kind:"element",type:`breditor/${type}`,entityId:null,
 properties:{"breditor/block-id":id,...properties},children,
});
const heading=(id,value)=>block("heading",id,{"breditor/level":2},[text(value)]);
const paragraph=(id,value)=>block("paragraph",id,{},[text(value)]);
const code=(id,language,value)=>block("code-block",id,{"breditor/language":language},[text(value)]);
const retryColumns=[{id:"option",width:136},{id:"setting",width:136}];
const retryRow=(id,values,header=false)=>block("table-row",id,{"breditor/row-id":id},
 retryColumns.map(({id:column},index)=>block("table-cell",`${id}-${column}`,
  {"breditor/column-id":column,"breditor/header":header},[paragraph(`${id}-${column}-text`,values[index])])));
const document={
 format:"breditor/document",formatVersion:2,
 schema:{name:"breditor-editor/standard",version:4},
 schemaFingerprint:"sha256:7ac98189f850119abd83956f49b82fdbdcc91a77033781fbde090ba931fccc77",
 root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"retry-guide"},children:[
  heading("retry","When to retry"),
  paragraph("retry-intro","Retry temporary network failures up to three times. Increase the delay after each failed request."),
  code("retry-example","typescript",[
   "const maximumAttempts = 3;",
   "",
   "function retryDelay(attempt: number): number | null {",
   "  if (attempt >= maximumAttempts) return null;",
   "  return 250 * 2 ** attempt;",
   "}",
  ].join("\n")),
  block("page-break","configuration-page"),
  heading("configuration","Client configuration"),
  paragraph("configuration-intro","Set the retry limit and the delay strategy in the client configuration."),
  code("configuration-example","json",[
   "{",
   '  "maximumAttempts": 3,',
   '  "delayStrategy": "exponential",',
   '  "initialDelayMs": 250',
   "}",
  ].join("\n")),
  block("table","retry-defaults",{"breditor/table-id":"defaults","breditor/columns":retryColumns,
   "breditor/merges":[],"breditor/retracted-merges":[]},[
   retryRow("column-labels",["Option","Default setting"],true),
   retryRow("attempts",["Maximum attempts","3"]),
   retryRow("delay",["Initial delay","250 ms"]),
   retryRow("backoff",["Delay strategy","Exponential"]),
   paragraph("defaults-caption","Default retry settings"),
  ]),
 ]},
};

const styles=`
*{box-sizing:border-box}
body{margin:0;background:#eef4f2;color:#192e2b;font:1rem/1.6 system-ui,sans-serif}
main{margin:clamp(1rem,5vw,4rem) auto;max-width:50rem;background:white;border:1px solid #c9d9d3;border-radius:1rem;padding:clamp(1.15rem,5vw,3.5rem)}
header h1{margin:.3rem 0;font-size:clamp(2rem,6vw,3.35rem);line-height:1.1;letter-spacing:-.045em}
header p{color:#405b54;margin:.55rem 0 1.65rem}
header nav{display:flex;flex-wrap:wrap;gap:.5rem}
header .paper-size{font-size:.875rem;font-weight:650}
header a{padding:.28rem .75rem;border:1px solid #c9d9d3;border-radius:.45rem}
header a[aria-current=page]{background:#dbece3;font-weight:650}
a{color:#205e4e;text-underline-offset:.22em}
a:focus-visible{outline:2px solid #1a6653;outline-offset:3px}
.skip-link{position:absolute;inset-block-start:.5rem;inset-inline-start:.5rem;transform:translateY(-200%);padding:.4rem .7rem;background:#fff;z-index:1}
.skip-link:focus{transform:none}
[data-breditor-static] nav{padding:.75rem 1.1rem;background:#edf5f0;border:1px solid #d3e2da;border-radius:.6rem}
[data-breditor-static] nav h2{margin:0;font-size:1.05rem}
[data-breditor-static] nav ol{margin:.4rem 0 0;padding-inline-start:1.2rem}
[data-breditor-static] h2{line-height:1.25;margin:1.6rem 0 .55rem}
[data-breditor-static] p{margin:.45rem 0}
pre{background:#f4f7fa;border:1px solid #d6e0e7;border-radius:.55rem;padding:.85rem 1rem;overflow:auto;line-height:1.55}
[data-breditor-static] table{width:100%;border-collapse:collapse;margin-block:1.5rem}
[data-breditor-static] :is(th,td){border:1px solid #c9d9d3;padding:.25rem .65rem;text-align:start}
[data-breditor-static] th{background:#edf5f0}
[data-breditor-static] caption{padding-top:.4rem;color:#405b54;font-size:.875rem}
@media print{
 body{background:#fff}
 main{margin:0;padding:0;border:0;max-width:none}
 .skip-link,header nav,header .paper-size{display:none}
 pre{white-space:pre-wrap;overflow:visible}
}
`;

function page(mode,render=renderStaticDocument){
 const landscape=mode==="landscape";
 const print=landscape?{size:"A4",orientation:"landscape",margin:"narrow"}:mode==="print";
 const printLabel=landscape?"A4 landscape · Narrow margins":"A4 portrait · Normal margins";
 const contents=render(document,{codeHighlighting:true,
  tableOfContents:{label:"On this page",idPrefix:"published"},print});
 return `<!doctype html>
<html lang="en">
<head>
 <meta charset="utf-8">
 <meta name="viewport" content="width=device-width, initial-scale=1">
 <title>Retry policy · Published Breditor document</title>
 <style>${styles}</style>
</head>
<body>
 <a class="skip-link" href="#published-content">Skip to document</a>
 <main>
  <header>
   <nav aria-label="Preview mode">
    <a href="/"${mode==="web"?' aria-current="page"':""}>Web view</a>
    <a href="/print"${mode==="print"?' aria-current="page"':""}>Print view</a>
    <a href="/print/landscape"${landscape?' aria-current="page"':""}>Landscape print</a>
    <a href="/react"${mode==="react"?' aria-current="page"':""}>React view</a>
   </nav>
   <h1>Retry policy</h1>
   <p>Configure how an API client retries temporary failures.</p>
   ${print?`<p class="paper-size">${printLabel}</p>`:""}
  </header>
  <article id="published-content" aria-label="Retry policy document" tabindex="-1">
   ${contents}
  </article>
 </main>
</body>
</html>`;
}
const pages=new Map([["/",page("web")],["/print",page("print")],["/print/landscape",page("landscape")]]);
async function reactPage(){
 const [{createElement},{renderToStaticMarkup},{BreditorStaticDocument}]=await Promise.all([
  import("react"),import("react-dom/server"),import("@breditor/editor/react"),
 ]);
 return page("react",(document,options)=>renderToStaticMarkup(createElement(BreditorStaticDocument,{document,options})));
}
const server=createServer(async(request,response)=>{
 const read=request.method==="GET"||request.method==="HEAD";
 if(read&&request.url==="/react"&&!pages.has("/react")){
  try{pages.set("/react",await reactPage());}
  catch{response.writeHead(503).end("Build the candidate SDK and install React to use this preview.");return;}
 }
 const html=read&&pages.get(request.url);
 if(!html){response.writeHead(404).end("Not found");return;}
 response.writeHead(200,{"Content-Type":"text/html; charset=utf-8","X-Content-Type-Options":"nosniff","Cache-Control":"no-store","Content-Length":Buffer.byteLength(html)});
 response.end(request.method==="HEAD"?undefined:html);
});
const port=Number(process.env.BREDITOR_PUBLISHED_PORT??49787);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error("Invalid published demo port");
server.listen(port,"127.0.0.1",()=>console.log(`Published document: http://127.0.0.1:${port}/`));
