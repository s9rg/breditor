import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {createRichInterchange,type InterchangeLoss,type InterchangeOwner} from "../src/index.js";
/**
 * Word desktop (`mso-list` paragraphs) and Word for the web (flat `data-aria-level` lists) numbering on
 * candidate rich V4 owners (`supportsListNumbering()`) versus the original V1–V3 conversion. Parser
 * staging only: the stub stands in for native admission. Fixtures are reconstructed, not captured.
 */
function staging(numbering:boolean){
 const owner:InterchangeOwner={supportsClipboardInterchange:()=>true,admitClipboardRoot(kind,root){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},validateClipboard(source){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:JSON.parse(source).kind??"flow",structuredJson:source,plainText:""};},...(numbering?{supportsListNumbering:()=>true}:{})};
 return createRichInterchange(owner);
}
const fixture=(name:string)=>readFileSync(new URL(`./fixtures/producers/${name}`,import.meta.url),"utf8");
type Result=ReturnType<ReturnType<typeof staging>["importHtml"]>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function root(value:Result):any{if(!value.ok)throw Error(value.error);return JSON.parse(value.value.structuredJson).document.root;}
function json(value:Result):string{if(!value.ok)throw Error(value.error);return value.value.structuredJson;}
const text=(n:any):string=>n.kind==="text"?n.text:n.children.map(text).join("");
const styleNames:Record<number,string>={1:"decimal",2:"lower-alpha",3:"upper-alpha",4:"lower-roman",5:"upper-roman"};
/** List outline: `ol start=N style` / `ul` lines and item first-paragraph text. */
function lists(n:any,depth=0):string[]{
 if(n.kind!=="element")return[];const pad="  ".repeat(depth),p=n.properties;
 if(n.type==="breditor/ordered-list")return[`${pad}ol start=${p["breditor/start"]}${p["breditor/list-style"]!==undefined?" "+styleNames[p["breditor/list-style"]]:""}`,...n.children.flatMap((c:any)=>lists(c,depth+1))];
 if(n.type==="breditor/bullet-list")return[`${pad}ul`,...n.children.flatMap((c:any)=>lists(c,depth+1))];
 if(n.type==="breditor/list-item")return[`${pad}${text(n.children[0])}`,...n.children.slice(1).flatMap((c:any)=>lists(c,depth))];
 return n.children.flatMap((c:any)=>lists(c,depth));
}
const count=(value:Result,code:InterchangeLoss["code"])=>value.losses.find(l=>l.code===code)?.count??0;
const item=(level:number,marker:string,body:string,lfo="lfo1")=>`<p class=MsoListParagraphCxSpMiddle style='mso-list:l0 level${level} ${lfo}'><![if !supportLists]><span style='mso-list:Ignore'>${marker}<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span><![endif]>${body}<o:p></o:p></p>`;
const online=(style:string,levelText:string|undefined,items:string[],options:{listId?:string;level?:number;start?:number;itemStyle?:string}={})=>`<div class="ListContainerWrapper SCXW1 BCX0"><ol class="NumberListStyle2 SCXW1 BCX0" role="list" start="1" style="list-style-type: ${style};">${items.map((body,i)=>`<li${levelText===undefined?"":` data-leveltext="${levelText}"`} data-listid="${options.listId??"7"}" aria-setsize="-1" data-aria-posinset="${(options.start??1)+i}" data-aria-level="${options.level??1}" role="listitem"${options.itemStyle?` style="list-style-type: ${options.itemStyle};"`:""}><p class="Paragraph SCXW1 BCX0">${body}</p></li>`).join("")}</ol></div>`;
const wordOnlineFixture=(style:string)=>fixture("word-online.html").replace('list-style-type: decimal;','list-style-type: '+style+';');
describe("Word desktop mso-list numbering",()=>{
 it("maps the fixture's lettered and roman levels to V4 list styles without a list-numbering notice",()=>{
  const v4=staging(true).importHtml(fixture("word-desktop.html")),legacy=staging(false).importHtml(fixture("word-desktop.html"));
  expect(lists(root(v4))).toEqual(["ol start=1","  Freeze scope","  ol start=1 lower-alpha","    Review open issues","    Tag the candidate","    ol start=1 lower-roman","      Sign the build","  Publish the release notes","ul","  Owners","  ul","    Engineering","    ul","      On-call rota"]);
  expect(count(v4,"list-numbering")).toBe(0);
  // Original conversion is unchanged: decimal ordered lists and three reported markers; every other notice is identical.
  expect(lists(root(legacy))).toEqual(lists(root(v4)).map(l=>l.replace(/ (lower|upper)-(alpha|roman)$/,"")));
  expect(count(legacy,"list-numbering")).toBe(3);
  expect(v4.losses).toEqual(legacy.losses.filter(l=>l.code!=="list-numbering"));
 });
 it("reads continuations by ordinal and style, upper case, and starts",()=>{
  const source=item(1,"i.","One")+item(1,"ii.","Two")+item(1,"iii.","Three")+item(1,"iv.","Four")+item(1,"C.","Upper",  "lfo2")+item(1,"D.","Next","lfo2")+item(1,"h.","H","lfo3")+item(1,"i.","I","lfo3")+item(1,"j.","J","lfo3")+item(1,"IV)","Roman4","lfo4")+item(1,"V)","Roman5","lfo4")+item(1,"aa.","Twenty-seven","lfo5");
  const v4=staging(true).importHtml(source);
  expect(lists(root(v4))).toEqual(["ol start=1 lower-roman","  One","  Two","  Three","  Four","ol start=3 upper-alpha","  Upper","  Next","ol start=8 lower-alpha","  H","  I","  J","ol start=4 upper-roman","  Roman4","  Roman5","ol start=27 lower-alpha","  Twenty-seven"]);
  expect(v4.losses).toEqual([]);
  const legacy=staging(false).importHtml(source);
  expect(lists(root(legacy))).toEqual(["ol start=1","  One","  Two","  Three","  Four","ol start=3","  Upper","  Next","ol start=8","  H","  I","  J","ol start=4","  Roman4","  Roman5","ol start=27","  Twenty-seven"]);
  expect(count(legacy,"list-numbering")).toBe(12);
 });
 it("splits a level whose marker style changes and keeps decimal lists unstyled",()=>{
  const v4=staging(true).importHtml(item(1,"1.","One")+item(1,"2.","Two")+item(1,"c.","Three")+item(1,"d.","Four"));
  expect(lists(root(v4))).toEqual(["ol start=1","  One","  Two","ol start=3 lower-alpha","  Three","  Four"]);expect(v4.losses).toEqual([]);
 });
 it("still reports markers a native style cannot show exactly",()=>{
  for(const [marker,line] of [["(a)","ol start=1 lower-alpha"],["(iv)","ol start=4 lower-roman"],["(3)","ol start=3"],["2.3.","ol start=3"]] as const){
   const v4=staging(true).importHtml(item(1,marker,"Body"));expect(lists(root(v4))[0],marker).toBe(line);expect(v4.losses,marker).toEqual([{code:"list-numbering",count:1,effect:"loss"}]);
  }
  const custom=staging(true).importHtml(item(1,"Step 1:","Prepare"));expect(lists(root(custom))).toEqual(["ul","  Prepare"]);expect(count(custom,"list-numbering")).toBe(1);
 });
 it("round trips the imported V4 numbering through HTML export",()=>{
  const adapter=staging(true),first=adapter.importHtml(fixture("word-desktop.html")+item(1,"C.","Upper","lfo9"));
  const html=adapter.exportHtml(json(first));if(!html.ok)throw Error(html.error);
  expect(html.value).toContain('type="a"');expect(html.value).toContain('type="i"');expect(html.value).toContain('type="A"');
  const back=adapter.importHtml(html.value);expect(lists(root(back))).toEqual(lists(root(first)));expect(count(back,"list-numbering")).toBe(0);
  // Markdown cannot show letters or roman numerals: those lists keep exact HTML with a compatibility notice.
  const md=adapter.exportMarkdown(json(first));if(!md.ok)throw Error(md.error);expect(md.losses.some(l=>l.code==="markdown-feature")).toBe(true);
 });
});
describe("Word for the web data-leveltext numbering",()=>{
 it("keeps the explicit HTML numbering hints when Word omits CSS and item positions",()=>{
  const source='<ol type="A" start="7"><li data-aria-level="1" data-leveltext="%1.">Seven</li><li data-aria-level="1" data-leveltext="%1.">Eight</li></ol>';
  const adapter=staging(true),v4=adapter.importHtml(source);
  expect(lists(root(v4))).toEqual(["ol start=7 upper-alpha","  Seven","  Eight"]);
  expect(count(v4,"list-numbering")).toBe(0);
  const html=adapter.exportHtml(json(v4));if(!html.ok)throw Error(html.error);
  const tag=html.value.match(/^<ol[^>]+>/)?.[0];
  expect(tag).toContain('start="7"');expect(tag).toContain('type="A"');
  expect(lists(root(adapter.importHtml(html.value)))).toEqual(lists(root(v4)));

  const legacy=staging(false).importHtml(source);
  expect(lists(root(legacy))).toEqual(["ol start=7","  Seven","  Eight"]);
  expect(count(legacy,"list-numbering")).toBe(3);
 });
 it("prefers Word item positions and CSS numbering to HTML hints",()=>{
  const source='<ol start="7" type="A" style="list-style-type:lower-roman"><li data-aria-level="1" data-leveltext="%1." data-aria-posinset="4">Four</li><li data-aria-level="1" data-leveltext="%1.">Five</li></ol>';
  const v4=staging(true).importHtml(source);
  expect(lists(root(v4))).toEqual(["ol start=4 lower-roman","  Four","  Five"]);
  expect(count(v4,"list-numbering")).toBe(0);
 });
 it("applies the ordinary HTML start bounds to Word's missing-position fallback",()=>{
  const source=(start:string)=>`<ol type="1" start="${start}"><li data-aria-level="1" data-leveltext="%1.">Item</li></ol>`;
  const adapter=staging(true),zero=adapter.importHtml(source("0"));
  expect(lists(root(zero))).toEqual(["ol start=1","  Item"]);
  expect(count(zero,"list-numbering")).toBe(1);
  for(const start of ["bad","1000000001"]){
   expect(adapter.importHtml(source(start))).toMatchObject({ok:false,error:"unsupported-content"});
  }
 });
 it("maps lettered and roman list-style-type with %N. level text to V4 styles without a notice",()=>{
  for(const [css,name] of [["lower-alpha","lower-alpha"],["lower-latin","lower-alpha"],["upper-alpha","upper-alpha"],["lower-roman","lower-roman"],["upper-roman","upper-roman"]] as const){
   const v4=staging(true).importHtml(online(css,"%1.",["Alpha","Beta"]));
   expect(lists(root(v4)),css).toEqual([`ol start=1 ${name}`,"  Alpha","  Beta"]);expect(count(v4,"list-numbering"),css).toBe(0);
   // V1–V3 keep the original decimal list with one list notice plus one per item.
   const legacy=staging(false).importHtml(online(css,"%1.",["Alpha","Beta"]));
   expect(lists(root(legacy)),css).toEqual(["ol start=1","  Alpha","  Beta"]);expect(count(legacy,"list-numbering"),css).toBe(3);
   expect(v4.losses).toEqual(legacy.losses.filter(l=>l.code!=="list-numbering"));
  }
  const paren=staging(true).importHtml(online("lower-roman","%1)",["One"],{start:3}));expect(lists(root(paren))).toEqual(["ol start=3 lower-roman","  One"]);expect(count(paren,"list-numbering")).toBe(0);
 });
 it("maps the Word for the web fixture with a lettered numbered run and keeps the decimal fixture unchanged",()=>{
  const decimal=[staging(true),staging(false)].map(a=>a.importHtml(fixture("word-online.html")));
  expect(json(decimal[0]!)).toBe(json(decimal[1]!));expect(decimal[0]!.losses).toEqual(decimal[1]!.losses);
  const v4=staging(true).importHtml(wordOnlineFixture("lower-alpha")),legacy=staging(false).importHtml(wordOnlineFixture("lower-alpha"));
  expect(lists(root(v4))).toEqual(["ul","  Design review","  ul","    Accessibility pass","  Launch","ol start=1 lower-alpha","  Draft","  Approve"]);
  expect(count(v4,"list-numbering")).toBe(0);expect(count(legacy,"list-numbering")).toBe(3);
  expect(v4.losses).toEqual(legacy.losses.filter(l=>l.code!=="list-numbering"));
 });
 it("still reports numbering whose format cannot be proven, keeping the closest native style",()=>{
  // A known style without provable %N. level text keeps that style but is reported; an unknown style is decimal.
  for(const [style,levelText,line,notices] of [["lower-alpha",undefined,"ol start=1 lower-alpha",1],["lower-alpha","%1.%2.","ol start=1 lower-alpha",1],["upper-roman","(%1)","ol start=1 upper-roman",1],["decimal","%1.%2.","ol start=1",1],["georgian","%1.","ol start=1",2],["disc","%1.","ol start=1",1]] as const){
   const v4=staging(true).importHtml(online(style,levelText,["One"]));
   expect(lists(root(v4)),`${style} ${levelText}`).toEqual([line,"  One"]);expect(count(v4,"list-numbering"),`${style} ${levelText}`).toBe(notices);
  }
 });
 it("lets an item's own list-style-type win and splits runs whose style changes",()=>{
  const v4=staging(true).importHtml(online("decimal","%1.",["One","Two"])+online("lower-alpha","%1.",["Three"],{start:3})+online("decimal","%1.",["Four"],{start:4,itemStyle:"upper-roman"}));
  expect(lists(root(v4))).toEqual(["ol start=1","  One","  Two","ol start=3 lower-alpha","  Three","ol start=4 upper-roman","  Four"]);expect(count(v4,"list-numbering")).toBe(0);
  // The original conversion continues one decimal list across the same data-listid.
  const legacy=staging(false).importHtml(online("decimal","%1.",["One","Two"])+online("lower-alpha","%1.",["Three"],{start:3})+online("decimal","%1.",["Four"],{start:4,itemStyle:"upper-roman"}));
  expect(lists(root(legacy))).toEqual(["ol start=1","  One","  Two","  Three","  Four"]);
 });
 it("nests a lettered level under a decimal one and round trips through HTML export",()=>{
  const adapter=staging(true),first=adapter.importHtml(online("decimal","%1.",["Top"])+online("lower-alpha","%2.",["Sub one","Sub two"],{level:2})+online("decimal","%1.",["Next"],{start:2}));
  expect(lists(root(first))).toEqual(["ol start=1","  Top","  ol start=1 lower-alpha","    Sub one","    Sub two","  Next"]);expect(count(first,"list-numbering")).toBe(0);
  const html=adapter.exportHtml(json(first));if(!html.ok)throw Error(html.error);
  const back=adapter.importHtml(html.value);expect(lists(root(back))).toEqual(lists(root(first)));expect(back.losses).toEqual([]);
 });
});
