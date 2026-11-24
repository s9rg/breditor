// @vitest-environment node
import {describe,expect,it} from "vitest";
import {renderStaticDocument,renderStaticDocumentWithReport,staticImageUrl,StaticDocumentError,staticInlineCatalogV1,staticInlineRecipesV1} from "../src/static_document.js";
import {el,envelope,f,fullDocument,link,merge,p,table,text,type Json} from "./static_document_fixture.js";

const render=(children:Json[],options={})=>renderStaticDocument(envelope(children),{fragment:true,...options});
const code=(run:()=>unknown):string=>{try{run();}catch(error){expect(error).toBeInstanceOf(StaticDocumentError);return (error as StaticDocumentError).code;}throw new Error("expected a StaticDocumentError");};
const noActiveMarkup=(html:string)=>{
 expect(html).not.toMatch(/<script|<iframe|<object|<embed|<svg|<math|<style|<link|<meta|<base|<form/i);
 // Attribute names only: escaped values may contain inert text such as "onerror".
 expect(html.replace(/="[^"]*"/g,'=""')).not.toMatch(/\son[a-z]+\s*=/i);
 expect(html).not.toMatch(/javascript:|vbscript:|data:text/i);
 expect(html).not.toMatch(/contenteditable/i);
};

describe("static document renderer (Node, no DOM, no Wasm)",()=>{
 it("runs without any DOM global",()=>{
  expect(typeof (globalThis as {document?:unknown}).document).toBe("undefined");
  expect(typeof (globalThis as {HTMLElement?:unknown}).HTMLElement).toBe("undefined");
  expect(renderStaticDocument(JSON.stringify(fullDocument()))).toMatch(/^<div class="breditor-rich-surface" data-breditor-rich="" data-breditor-static="">/);
 });

 it("renders every rich node type with the live presentation hooks",()=>{
  const {html,report}=renderStaticDocumentWithReport(fullDocument(),{fragment:true,resolveAsset:({image})=>image==="i1"?"https://cdn.example/i1.png":undefined});
  expect(html).toContain('<h2 data-rich-block="h1" data-rich-text="h1" style="text-align:center;margin-inline-start:2em;line-height:1.5" dir="rtl">Title</h2>');
  expect(html).toContain('<p data-rich-block="empty" data-rich-text="empty"><br></p>');
  expect(html).toContain('<strong data-rich-format="breditor/strong">bold</strong>');
  expect(html).toContain('<em data-rich-format="breditor-inline/italic"><u data-rich-format="breditor-inline/underline"> it</u></em>');
  expect(html).toContain('<s data-rich-format="breditor-inline/strike"> s</s>');
  expect(html).toContain('<code data-rich-format="breditor-inline/code"> c</code>');
  expect(html).toContain('<sub data-rich-format="breditor-inline/subscript">2</sub><sup data-rich-format="breditor-inline/superscript">3</sup>');
  expect(html).toContain('<a data-rich-format="breditor-inline/link" class="breditor-link" href="https://example.com/a?b=1&amp;c=2" rel="noopener noreferrer" target="_blank"><strong data-rich-format="breditor/strong">link</strong></a>');
  expect(html).toContain('style="color:#ff0000"');expect(html).toContain('style="background-color:#00ff00"');
  expect(html).toContain('<span data-rich-format="breditor-inline/text-size" class="breditor-inline-text-size" style="font-size:24px">');
  expect(html).toContain('class="breditor-inline-font-family" data-breditor-integer-token="serif"');
  expect(html).toContain('<ul data-rich-block="ul"><li data-rich-block="li1"><p data-rich-block="li1p" data-rich-text="li1p">one</p><ol data-rich-block="ol" start="3"><li data-rich-block="li2">');
  expect(html).toContain('<ul data-rich-block="tl" data-task-list="" role="list"><li data-rich-block="ti1" data-rich-task="ti1"><input type="checkbox" data-task-check="ti1" aria-label="Task completed" disabled="" checked=""><div data-task-body=""><p');
  expect(html).toContain('<input type="checkbox" data-task-check="ti2" aria-label="Task completed" disabled=""><div data-task-body="">');
  expect(html).toContain('<blockquote data-rich-block="bq"><p data-rich-block="bqp" data-rich-text="bqp">quoted</p></blockquote>');
  expect(html).toContain('<pre data-rich-block="code" data-rich-text="code" style="text-align:left" data-language="ts"><code>if(a&lt;b&amp;&amp;c&gt;d)&lt;/script&gt;</code></pre>');
  expect(html).toContain('<pre data-rich-block="code2" data-rich-text="code2"><code><br></code></pre>');
  expect(html).toContain('<hr data-rich-block="hr">');
  expect(html).toContain('<figure data-rich-block="img" data-rich-image="i1" data-asset-state="ready"><img alt="A &quot;diagram&quot; &lt;b&gt;" width="320" height="200" src="https://cdn.example/i1.png"><figcaption><p data-rich-block="cap" data-rich-text="cap">Caption</p></figcaption></figure>');
  expect(html).toContain('<figure data-rich-block="img2" data-rich-image="i2" data-asset-state="unresolved"><img alt=""></figure>');
  expect(html).toContain('<table data-rich-block="tbl" data-rich-table="t1"><colgroup><col style="width:120px"><col style="width:96px"><col style="width:200px"></colgroup><tbody>');
  expect(html).toContain('<tr><th rowspan="1" colspan="1" data-rich-cell="[&quot;t1&quot;,&quot;r1&quot;,&quot;a&quot;]"><div data-source-cell="{&quot;table&quot;:&quot;t1&quot;,&quot;row&quot;:&quot;r1&quot;,&quot;column&quot;:&quot;a&quot;}">');
  expect(html).toMatch(/<tr><td rowspan="2" colspan="2" data-rich-cell="\[&quot;t1&quot;,&quot;r2&quot;,&quot;a&quot;\]">(<div data-source-cell="[^"]+"><p [^>]+>r[23][ab]<\/p><\/div>){4}<\/td><td rowspan="1" colspan="1"[^>]*>.*?r2c.*?<\/td><\/tr><tr><td rowspan="1" colspan="1" data-rich-cell="\[&quot;t1&quot;,&quot;r3&quot;,&quot;c&quot;\]">/);
  expect(report).toEqual({skipped:[],images:[{image:"i1",state:"ready"},{image:"i2",state:"unresolved"}],hiddenTables:[],inactiveMerges:[{table:"t1",merge:"m3",reason:"overlap"}]});
  noActiveMarkup(html);
 });

 it("omits id hooks on request and accepts a bare root, a string or an object",()=>{
  const doc=fullDocument();
  const html=renderStaticDocument(doc,{blockIds:false,fragment:true});
  expect(html).not.toMatch(/data-rich-(block|text|cell|task)=/);
  expect(renderStaticDocument(JSON.stringify(doc))).toBe(renderStaticDocument(doc));
  expect(renderStaticDocument((doc as {root:Json}).root)).toBe(renderStaticDocument(doc));
  const v1={format:"breditor/document",formatVersion:1,schema:{name:"x/y",version:1},root:(doc as {root:Json}).root};
  expect(renderStaticDocument(v1)).toBe(renderStaticDocument(doc));
 });

 it("is deterministic and independent of property key order",()=>{
  const a=renderStaticDocument(fullDocument()),b=renderStaticDocument(fullDocument());
  expect(a).toBe(b);
  const reordered=JSON.parse(JSON.stringify(fullDocument()),(_key,value:unknown)=>value&&typeof value==="object"&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).reverse()):value) as Json;
  expect(renderStaticDocument(reordered)).toBe(a);
 });

 it("escapes text and attributes, including </script> and quote breaks",()=>{
  const html=render([p("x",[text(`</script><script>alert(1)</script>"'&<img src=x onerror=alert(1)>`)])]);
  expect(html).toBe(`<p data-rich-block="x" data-rich-text="x">&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;"'&amp;&lt;img src=x onerror=alert(1)&gt;</p>`);
  const alt=render([el("image",{"block-id":"i","image-id":"i","asset-id":"a","asset-generation":"g","alt-text":`x" onerror="alert(1)`,decorative:false})]);
  expect(alt).toContain('alt="x&quot; onerror=&quot;alert(1)"');noActiveMarkup(alt);
 });

 it("preserves carriage returns in static paragraph and code text",()=>{
  const sample="alpha\rbeta\ngamma\r\ndelta";
  const escaped="alpha&#13;beta\ngamma&#13;\ndelta";
  const html=render([p("line",[text(sample)]),el("code-block",{"block-id":"code"},[text(sample)])]);
  expect(html).toContain(`>${escaped}</p>`);
  expect(html).toContain(`<code>${escaped}</code>`);
 });

 it("renders links only through the shared safe link policy",()=>{
  for(const href of ["javascript:alert(1)","JaVaScRiPt:alert(1)"," https://example.com","data:text/html,<script>alert(1)</script>","vbscript:x","https://user:pw@example.com/","//example.com/x","/relative","https:\\\\example.com","http://exa mple.com","file:///etc/passwd","https://%65xample.com"]){
   const html=render([p("x",[text("t",[link(href)])])]);
   expect(html).toBe('<p data-rich-block="x" data-rich-text="x"><a data-rich-format="breditor-inline/link" class="breditor-link">t</a></p>');
  }
  const html=render([p("x",[text("t",[link('https://example.com/"><script>alert(1)</script>')])])]);
  expect(html).toContain('href="https://example.com/%22%3E%3Cscript%3Ealert(1)%3C/script%3E"');noActiveMarkup(html);
  expect(render([p("x",[text("t",[link("HTTPS://Example.COM")])])])).toContain('href="https://example.com/"');
 });

 it("admits image URLs only through the static image policy",()=>{
  expect(staticImageUrl("https://cdn.example/a.png")).toBe("https://cdn.example/a.png");
  expect(staticImageUrl("/assets/a%20b.png?v=1#x")).toBe("/assets/a%20b.png?v=1#x");
  expect(staticImageUrl("data:image/png;base64,iVBORw0KGgo=")).toBe("data:image/png;base64,iVBORw0KGgo=");
  for(const bad of ["javascript:alert(1)","data:image/svg+xml;base64,PHN2Zz4=","data:text/html;base64,PHNjcmlwdD4=","data:image/png,raw","//evil.example/a.png","/\\evil","/a b.png",'/a".png',"relative.png","blob:https://x/1","ftp://x/a.png","https://u:p@x/a.png",""])expect(staticImageUrl(bad)).toBeUndefined();
  const image=el("image",{"block-id":"i","image-id":"i","asset-id":"a","asset-generation":"g","alt-text":"alt",decorative:false});
  const {html,report}=renderStaticDocumentWithReport(envelope([image]),{fragment:true,resolveAsset:()=>"javascript:alert(1)"});
  expect(html).toBe('<figure data-rich-block="i" data-rich-image="i" data-asset-state="rejected"><img alt="alt"></figure>');
  expect(report.images).toEqual([{image:"i",state:"rejected"}]);
  expect(renderStaticDocumentWithReport(envelope([image]),{resolveAsset:()=>{throw new Error("boom");}}).report.images[0]!.state).toBe("error");
  const pending=renderStaticDocumentWithReport(envelope([image]),{resolveAsset:(()=>Promise.resolve("https://x/a.png")) as never});
  expect(pending.report.images[0]!.state).toBe("unresolved");expect(pending.html).not.toContain("src=");
  let seen:unknown;renderStaticDocument(envelope([image]),{resolveAsset:binding=>{seen=binding;return undefined;}});
  expect(seen).toEqual({image:"i",asset:"a",generation:"g"});expect(Object.isFrozen(seen)).toBe(true);
 });

 it("rejects attribute injection through properties instead of escaping it into output",()=>{
  expect(code(()=>render([el("code-block",{"block-id":"c",language:'js" onload="x'})]))).toBe("property");
  expect(code(()=>render([p('x" onclick="y')]))).toBe("property");
  expect(code(()=>render([p("x",[],{style:"color:red"})]))).toBe("property");
  expect(code(()=>render([el("paragraph",{"block-id":"x"},[]),{...el("paragraph",{"block-id":"y"}),properties:{"breditor/block-id":"y",onclick:"x"}}]))).toBe("property");
  expect(code(()=>renderStaticDocument('{"format":"breditor/document","formatVersion":1,"schema":{"name":"a/b","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"d","__proto__":{"x":1}},"children":[]}}'))).toBe("property");
  expect(code(()=>render([p("x",[],{"block-align":"center"})]))).toBe("property");
  expect(code(()=>render([el("horizontal-rule",{"block-id":"h","block-align":2})]))).toBe("property");
  expect(code(()=>render([el("heading",{"block-id":"h",level:7})]))).toBe("property");
  expect(code(()=>render([el("image",{"block-id":"i","image-id":"i","asset-id":"a","asset-generation":"g","alt-text":"   ",decorative:false})]))).toBe("property");
  expect(code(()=>render([el("image",{"block-id":"i","image-id":"i","asset-id":"a","asset-generation":"g","alt-text":"x",decorative:true})]))).toBe("property");
  expect(code(()=>render([el("image",{"block-id":"i","image-id":"i","asset-id":"a","asset-generation":"g","alt-text":"x",decorative:false,width:10})]))).toBe("property");
  expect(code(()=>render([p("x",[text("t",[f("breditor-inline/text-color",{"breditor-inline/rgb24":"red"})])])]))).toBe("format");
  expect(code(()=>render([p("x",[text("t",[f("breditor-inline/text-size",{"breditor-inline/pixels":200})])])]))).toBe("format");
  expect(code(()=>render([p("x",[text("t",[f("breditor/strong",{"x/y":1})])])]))).toBe("format");
  expect(code(()=>render([p("x",[text("t",[f("breditor/strong"),f("breditor/strong")])])]))).toBe("format");
  expect(code(()=>render([el("code-block",{"block-id":"c"},[text("t",[f("breditor/strong")])])]))).toBe("grammar");
 });

 it("enforces the rich child grammar",()=>{
  expect(code(()=>render([text("loose")]))).toBe("grammar");
  expect(code(()=>render([p("x",[p("y")])]))).toBe("grammar");
  expect(code(()=>render([el("bullet-list",{"block-id":"l"},[p("x")])]))).toBe("grammar");
  expect(code(()=>render([el("bullet-list",{"block-id":"l"},[el("list-item",{"block-id":"i"},[el("bullet-list",{"block-id":"n"},[])])])]))).toBe("grammar");
  expect(code(()=>render([el("bullet-list",{"block-id":"l"},[el("list-item",{"block-id":"i"},[el("horizontal-rule",{"block-id":"h"})])])]))).toBe("grammar");
  expect(code(()=>render([el("horizontal-rule",{"block-id":"h"},[text("x")])]))).toBe("grammar");
  expect(code(()=>render([el("ordered-list",{"block-id":"o",start:2147483647},[el("list-item",{"block-id":"a"},[p("a")]),el("list-item",{"block-id":"b"},[p("b")])])]))).toBe("grammar");
  expect(code(()=>renderStaticDocument(envelope([])))).toBe("grammar");
  expect(code(()=>renderStaticDocument({...envelope([p("x")]),extra:1}))).toBe("shape");
  expect(code(()=>renderStaticDocument({...envelope([p("x")]),format:"other"}))).toBe("format");
  expect(code(()=>renderStaticDocument("{not json"))).toBe("json");
  expect(code(()=>render([{...p("x"),entityId:"e"}]))).toBe("shape");
  expect(code(()=>render([p("x",[{kind:"text",text:"t",formats:[],html:"<b>"}])]))).toBe("shape");
  expect(code(()=>render([p("x",[text("\uD800")])]))).toBe("shape");
 });

 it("never passes unknown nodes or formats through",()=>{
  const unknown={kind:"element",type:"vendor/widget",entityId:null,properties:{"vendor/html":"<script>alert(1)</script>"},children:[text("secret <b>")]};
  expect(code(()=>render([unknown]))).toBe("unknown-node");
  expect(code(()=>render([p("x",[text("t",[f("vendor/blink")])])]))).toBe("unknown-format");
  try{render([unknown]);}catch(error){expect((error as Error).message).not.toContain("<script>");expect((error as StaticDocumentError).path).toBe("root.children[0]");}
  const {html,report}=renderStaticDocumentWithReport(envelope([p("a",[text("A")]),unknown,p("b",[text("B",[f("vendor/blink"),f("breditor/strong")])])]),{fragment:true,unknown:"skip"});
  expect(html).toBe('<p data-rich-block="a" data-rich-text="a">A</p><p data-rich-block="b" data-rich-text="b"><strong data-rich-format="breditor/strong">B</strong></p>');
  expect(report.skipped).toEqual([{kind:"node",type:"vendor/widget",path:"root.children[1]"},{kind:"format",type:"vendor/blink",path:"root.children[2].children[0].formats[0]"}]);
 });

 it("enforces input bounds before rendering",()=>{
  let deep:Json=p("leaf");for(let i=0;i<20;i++)deep=el("blockquote",{"block-id":`q${i}`},[deep]);
  expect(render([deep])).toContain("leaf");
  expect(code(()=>render([deep],{limits:{maxDepth:10}}))).toBe("limit");
  expect(code(()=>render(Array.from({length:50},(_,i)=>p(`p${i}`)),{limits:{maxNodes:20}}))).toBe("limit");
  expect(code(()=>renderStaticDocument(JSON.stringify(envelope([p("x",[text("x".repeat(2000))])])),{limits:{maxInputBytes:1000}}))).toBe("limit");
  expect(code(()=>renderStaticDocument(envelope([p("x",[text("é".repeat(600))])]),{limits:{maxInputBytes:1000}}))).toBe("limit");
  // A hostile depth far beyond the hard ceiling fails cleanly instead of exhausting the stack.
  let hostile:Json=p("leaf");for(let i=0;i<5000;i++)hostile=el("blockquote",{"block-id":`q${i}`},[hostile]);
  expect(code(()=>render([hostile],{limits:{maxDepth:100000}}))).toBe("limit");
 });

 it("validates table axes and ports the Rust merge resolution",()=>{
  const columns=Array.from({length:129},(_,i)=>({id:`c${i}`,width:40}));
  expect(code(()=>render([el("table",{"block-id":"t","table-id":"t",columns,merges:[],"retracted-merges":[]})]))).toBe("table");
  expect(code(()=>render([el("table",{"block-id":"t","table-id":"t",columns:[{id:"a",width:31}],merges:[],"retracted-merges":[]})]))).toBe("table");
  expect(code(()=>render([el("table",{"block-id":"t","table-id":"t",columns:[{id:"a",width:40,style:"x"}],merges:[],"retracted-merges":[]})]))).toBe("table");
  const bad=table();((bad["children"] as Json[])[0]!["children"] as Json[]).reverse();
  expect(code(()=>render([bad]))).toBe("table");
  const ctx=["r1","r2","r3"],cols=["a","b","c"];
  expect(code(()=>render([table([merge("m2","1",ctx,cols,["r1","a"],["r1","b"]),merge("m1","1",ctx,cols,["r2","a"],["r2","b"])],[])]))).toBe("table");
  expect(code(()=>render([table([merge("m1","01",ctx,cols,["r1","a"],["r1","b"])],[])]))).toBe("table");
  expect(code(()=>render([table([merge("m1","1",ctx,cols,["r1","a"],["r1","a"])],[])]))).toBe("table");
  expect(code(()=>render([table([merge("m1","1",ctx,cols,["r2","b"],["r1","a"])],[])]))).toBe("table");
  expect(code(()=>render([table([{...merge("m1","1",ctx,cols,["r1","a"],["r1","b"]),writer:"0"}],[])]))).toBe("table");
  // Equal stamps break ties by descending merge identity; the lower identity loses the overlap.
  const tie=renderStaticDocumentWithReport(envelope([table([merge("m1","1",ctx,cols,["r1","a"],["r1","b"]),merge("m2","1",ctx,cols,["r1","b"],["r1","c"])],[])]));
  expect(tie.report.inactiveMerges).toEqual([{table:"t1",merge:"m1",reason:"overlap"}]);
  expect(tie.html).toContain('<th rowspan="1" colspan="1" data-rich-cell="[&quot;t1&quot;,&quot;r1&quot;,&quot;a&quot;]">');
  expect(tie.html).toMatch(/<th rowspan="1" colspan="2" data-rich-cell="\[&quot;t1&quot;,&quot;r1&quot;,&quot;b&quot;\]">/);
  // Axes deleted from the current table deactivate captured intent without losing content.
  const gone=renderStaticDocumentWithReport(envelope([table([merge("m1","1",["x1","x2"],cols,["x1","a"],["x2","a"])],[])]));
  expect(gone.report.inactiveMerges).toEqual([{table:"t1",merge:"m1",reason:"axes-deleted"}]);
  const hidden=renderStaticDocumentWithReport(envelope([p("x"),el("table",{"block-id":"t","table-id":"empty",columns:[],merges:[],"retracted-merges":[]})]),{fragment:true});
  expect(hidden.html).toBe('<p data-rich-block="x" data-rich-text="x"><br></p>');expect(hidden.report.hiddenTables).toEqual(["empty"]);
 });

 it("keeps the twelve standard V1 kinds with links outermost",()=>{
  expect(staticInlineCatalogV1.map(format=>format.kind).sort()).toHaveLength(12);
  expect(staticInlineRecipesV1[0]!.formatKind).toBe("breditor-inline/link");
 });
});
