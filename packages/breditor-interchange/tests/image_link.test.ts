import {describe,it,expect} from "vitest";
import {createRichInterchange,type InterchangeOwner} from "../src/index.js";
import {isImageLinkHrefV1} from "../src/image_link_href.js";
import {readFileSync} from "node:fs";
/** Parser-unit staging owner. Real native V4 admission is covered by the rich-browser Playwright spec. */
function staging(links:boolean){
 const owner:InterchangeOwner={supportsClipboardInterchange:()=>true,admitClipboardRoot(kind,root){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},validateClipboard(source){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:JSON.parse(source).kind??"flow",structuredJson:source,plainText:""};},...(links?{supportsImageLinks:()=>true}:{})};
 return createRichInterchange(owner,{resolveImage:({src})=>({asset:src.replace(/[^A-Za-z0-9]/g,"-"),generation:"g"}),exportImage:({asset})=>asset==="missing"?undefined:"https://cdn.example/a.png"});
}
type Adapter=ReturnType<typeof staging>;
type Result=ReturnType<Adapter["importHtml"]>;
const codes=(r:{readonly losses:readonly {readonly code:string;readonly count:number}[]})=>Object.fromEntries(r.losses.map(l=>[l.code,l.count]));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function blocks(value:Result):any[]{if(!value.ok)throw Error(value.error);return JSON.parse(value.value.structuredJson).document.root.children;}
const image=(value:Result)=>blocks(value).find(n=>n.type==="breditor/image");
const linkKeys=(node:{properties:Record<string,unknown>})=>Object.fromEntries(Object.entries(node.properties).filter(([k])=>k.startsWith("breditor/image-")&&k!=="breditor/image-id"));
const doc=(children:unknown[])=>JSON.stringify({kind:"flow",document:{root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children}}});
const el=(type:string,properties:Record<string,unknown>,children:unknown[]=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:Object.fromEntries(Object.entries(properties).map(([k,v])=>[`breditor/${k}`,v])),children});
const imageNode=(link:Record<string,unknown>,caption=false,asset="owned")=>el("image",{"block-id":"f","image-id":"i","asset-id":asset,"asset-generation":"g",decorative:false,"alt-text":"Chart",...link},caption?[el("paragraph",{"block-id":"c"},[{kind:"text",text:"Cap",formats:[]}])]:[]);

describe("candidate rich V4 image-link interchange",()=>{
 it("keeps the Rust/browser target subset (same table as Rust image_link.rs and the browser copy)",()=>{
  const good=["https://example.com/","http://example.com/","https://a/","https://example.com/a%20b?q=1&r=two#frag","https://example.com/?","https://example.com:8080/","http://example.com:443/","https://127.0.0.1/","https://xn--bcher-kva.de/","https://sub_domain.example-site.co/","https://example.com/it's/ok","https://example.com/a?x=/y?z","https://example.com/#a/b?c","https://example.com//double","https://example.com/..."];
  const bad=["","https://example.com","HTTPS://example.com/","https://Example.com/","ftp://example.com/","javascript:alert(1)","mailto:someone@example.com","//example.com/","/relative","https://user:pass@example.com/","https://example.com:443/","http://example.com:80/","https://example.com:/","https://example.com:08/","https://example.com:65536/","https://exa%6dple.com/","https://example..com/","https://example.com./","https://127.1/","https://01.2.3.4/","https://256.1.1.1/","https://example.123/","https://0x7f/","https://[::1]/","https://example.com/a b","https://example.com\\evil/","https://example.com/\"q\"","https://example.com/<t>","https://example.com/`t`","https://example.com/{b}","https://example.com/a|b","https://example.com/a^b","https://example.com/./a","https://example.com/a/..","https://example.com/%2E%2e/a","https://example.com/%zz","https://example.com/?q='x'","https://example.com/#a#b","https://example.com/é"];
  for(const value of good){expect(isImageLinkHrefV1(value),value).toBe(true);expect(new URL(value).href).toBe(value);}
  for(const value of bad)expect(isImageLinkHrefV1(value),value).toBe(false);
  // The browser copy is byte-identical from the character classes through isImageLinkHrefV1.
  const body=(path:string)=>{const source=readFileSync(new URL(path,import.meta.url),"utf8"),start=source.indexOf("const PCHAR"),end=source.indexOf("\n}\n",source.indexOf("export function isImageLinkHrefV1"));return source.slice(start,end);};
  const copy=body("../src/image_link_href.ts");expect(copy.length).toBeGreaterThan(1000);
  expect(copy).toBe(body("../../breditor-browser/src/image_link_href.ts"));
 });
 it("maps <a href><img></a> to the image link for V4 owners",()=>{
  const value=staging(true).importHtml('<p><a href="HTTPS://Example.com/x"><img src="a.png" alt="Chart"></a></p>');
  expect(linkKeys(image(value))).toEqual({"breditor/image-href":"https://example.com/x"});expect(value.losses).toEqual([]);
  const window=staging(true).importHtml('<a href="https://example.com/" target="_blank" rel="noopener noreferrer"><img src="a.png" alt="Chart"></a>');
  expect(linkKeys(image(window))).toEqual({"breditor/image-href":"https://example.com/","breditor/image-link-new-window":true});expect(window.losses).toEqual([]);
 });
 it("maps <figure><a><img></a><figcaption> to a linked image whose caption is not linked",()=>{
  const value=staging(true).importHtml('<figure><a href="https://example.com/"><img src="a.png" alt="Chart"></a><figcaption>Cap</figcaption></figure>');
  const node=image(value);expect(linkKeys(node)).toEqual({"breditor/image-href":"https://example.com/"});
  expect(node.children[0].children).toEqual([{kind:"text",text:"Cap",formats:[]}]);expect(value.losses).toEqual([]);
 });
 it("drops unsafe and decorative links with notices",()=>{
  for(const href of ["javascript:alert(1)","https://user:pw@example.com/","data:text/html,x"]){
   const value=staging(true).importHtml(`<figure><a href="${href}"><img src="a.png" alt="Chart"></a></figure>`);
   expect(linkKeys(image(value))).toEqual({});expect(codes(value)["unsafe-link"]).toBe(1);
  }
  // Canonical but outside the native subset (IPv6 host).
  const ipv6=staging(true).importHtml('<a href="https://[::1]/"><img src="a.png" alt="Chart"></a>');
  expect(linkKeys(image(ipv6))).toEqual({});expect(codes(ipv6)["unsafe-link"]).toBe(1);
  const decorative=staging(true).importHtml('<a href="https://example.com/"><img src="a.png" alt=""></a>');
  expect(linkKeys(image(decorative))).toEqual({});expect(image(decorative).properties["breditor/decorative"]).toBe(true);expect(codes(decorative)["image-alt"]).toBe(1);
 });
 it("keeps V1–V3 conversion exact: the link is dropped and figure anchors fall back",()=>{
  const inline=staging(false).importHtml('<p><a href="https://example.com/x"><img src="a.png" alt="Chart"></a></p>');
  expect(linkKeys(image(inline))).toEqual({});expect(inline.losses).toEqual([]);
  const unsafe=staging(false).importHtml('<p><a href="javascript:x"><img src="a.png" alt="Chart"></a></p>');
  expect(codes(unsafe)).toEqual({"unsafe-link":1});
  const figure=staging(false).importHtml('<figure><a href="https://example.com/"><img src="a.png" alt="Chart"></a><figcaption>Cap</figcaption></figure>');
  expect(linkKeys(image(figure))).toEqual({});expect(codes(figure)["block-structure"]).toBeGreaterThan(0);
  const markdown=staging(false).importMarkdown("[![Chart](a.png)](https://example.com/)");
  expect(linkKeys(image(markdown))).toEqual({});
 });
 it("exports the wrapping <a> and round trips HTML exactly",()=>{
  const adapter=staging(true),source=doc([imageNode({"image-href":"https://example.com/a?b=1&c=2","image-link-new-window":true},true)]);
  const html=adapter.exportHtml(source);if(!html.ok)throw Error(html.error);
  expect(html.value).toBe('<figure><a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer"><img src="https://cdn.example/a.png" alt="Chart"></a><figcaption><p style="white-space:pre-wrap">Cap</p></figcaption></figure>');
  expect(linkKeys(image(adapter.importHtml(html.value)))).toEqual({"breditor/image-href":"https://example.com/a?b=1&c=2","breditor/image-link-new-window":true});
  // Without a portable source the alt text keeps the link.
  const missing=adapter.exportHtml(doc([imageNode({"image-href":"https://example.com/"},false,"missing")]));if(!missing.ok)throw Error(missing.error);
  expect(missing.value).toBe('<p style="white-space:pre-wrap"><a href="https://example.com/">Chart</a></p>');
  expect(adapter.exportHtml(doc([imageNode({"image-href":"javascript:alert(1)"})]))).toMatchObject({ok:false,error:"native-admission"});
 });
 it("exports [![alt](src)](href) Markdown that reimports to the same link, else HTML",()=>{
  const adapter=staging(true),markdown=adapter.exportMarkdown(doc([imageNode({"image-href":"https://example.com/x"})]));if(!markdown.ok)throw Error(markdown.error);
  expect(markdown.value).toBe("[![Chart](<https://cdn.example/a.png>)](<https://example.com/x>)");expect(markdown.losses).toEqual([]);
  const back=adapter.importMarkdown(markdown.value);expect(linkKeys(image(back))).toEqual({"breditor/image-href":"https://example.com/x"});expect(back.losses).toEqual([]);
  const window=adapter.exportMarkdown(doc([imageNode({"image-href":"https://example.com/x","image-link-new-window":true})]));if(!window.ok)throw Error(window.error);
  expect(window.value.startsWith("<figure><a ")).toBe(true);expect(codes(window)["markdown-feature"]).toBe(1);
  expect(linkKeys(image(adapter.importMarkdown(window.value)))).toEqual({"breditor/image-href":"https://example.com/x","breditor/image-link-new-window":true});
  expect(linkKeys(image(adapter.importMarkdown("[![Chart](a.png)](https://example.com/)")))).toEqual({"breditor/image-href":"https://example.com/"});
 });
});
