/** Canonical rich document fixtures for static rendering tests (no DOM, no Wasm). */
export type Json=Record<string,unknown>;
export const fingerprint=`sha256:${"ab".repeat(32)}`;
export const text=(value:string,formats:Json[]=[]):Json=>({kind:"text",text:value,formats});
export const el=(type:string,properties:Json,children:Json[]=[]):Json=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:Object.fromEntries(Object.entries(properties).map(([k,v])=>[`breditor/${k}`,v])),children});
export const p=(id:string,children:Json[]=[],extra:Json={}):Json=>el("paragraph",{"block-id":id,...extra},children);
export const envelope=(children:Json[]):Json=>({format:"breditor/document",formatVersion:2,schema:{name:"breditor/rich-test",version:1},schemaFingerprint:fingerprint,root:el("document",{"document-id":"doc"},children)});
export const f=(type:string,properties:Json={}):Json=>({type,properties});
export const link=(href:string,newWindow=false):Json=>f("breditor-inline/link",{"breditor-inline/href":href,"breditor-inline/new-window":newWindow});
const cell=(id:string,column:string,children:Json[],header=false):Json=>el("table-cell",{"block-id":id,"column-id":column,header},children);
export const merge=(id:string,lamport:string,rows:string[],columns:string[],first:[string,string],last:[string,string]):Json=>({id,lamport,writer:"1",counter:"1",rows,columns,"first-row":first[0],"last-row":last[0],"first-column":first[1],"last-column":last[1]});
/** 3×3 table: header row, one active 2×2 merge, one retracted and one overlapping merge. */
export function table(merges:Json[]=[merge("m1","5",["r1","r2","r3"],["a","b","c"],["r2","a"],["r3","b"]),merge("m2","9",["r1","r2","r3"],["a","b","c"],["r1","a"],["r1","b"]),merge("m3","1",["r1","r2","r3"],["a","b","c"],["r3","b"],["r3","c"])],retracted:string[]=["m2"]):Json{
 const columns=[{id:"a",width:120},{id:"b",width:96},{id:"c",width:200}];
 const row=(r:string,header=false)=>el("table-row",{"block-id":`row-${r}`,"row-id":r},columns.map(c=>cell(`cell-${r}-${c.id}`,c.id,[p(`p-${r}-${c.id}`,[text(`${r}${c.id}`)])],header)));
 return el("table",{"block-id":"tbl","table-id":"t1",columns,merges,"retracted-merges":retracted},[row("r1",true),row("r2"),row("r3")]);
}
/** Every rich node type and every standard inline V1 format. */
export function fullDocument():Json {
 return envelope([
  el("heading",{"block-id":"h1",level:2,"block-align":2,"block-direction":2,"block-indent":1,"line-height-percent":150},[text("Title")]),
  p("p1",[text("plain "),text("bold",[f("breditor/strong")]),text(" it",[f("breditor-inline/italic"),f("breditor-inline/underline")]),text(" s",[f("breditor-inline/strike")]),text(" c",[f("breditor-inline/code")]),text("2",[f("breditor-inline/subscript")]),text("3",[f("breditor-inline/superscript")]),
   text("link",[link("https://example.com/a?b=1&c=2",true),f("breditor/strong")]),text("red",[f("breditor-inline/text-color",{"breditor-inline/rgb24":0xff0000}),f("breditor-inline/background-color",{"breditor-inline/rgb24":0x00ff00})]),
   text("big",[f("breditor-inline/text-size",{"breditor-inline/pixels":24}),f("breditor-inline/font-family",{"breditor-inline/family":3})])]),
  p("empty"),
  el("bullet-list",{"block-id":"ul"},[el("list-item",{"block-id":"li1"},[p("li1p",[text("one")]),el("ordered-list",{"block-id":"ol",start:3},[el("list-item",{"block-id":"li2"},[p("li2p",[text("three")])])])])]),
  el("task-list",{"block-id":"tl"},[el("task-item",{"block-id":"ti1",checked:true},[p("ti1p",[text("done")])]),el("task-item",{"block-id":"ti2",checked:false},[p("ti2p",[text("todo")])])]),
  el("blockquote",{"block-id":"bq"},[p("bqp",[text("quoted")])]),
  el("code-block",{"block-id":"code",language:"ts","block-align":5},[text("if(a<b&&c>d)</script>")]),
  el("code-block",{"block-id":"code2"}),
  el("horizontal-rule",{"block-id":"hr"}),
  el("image",{"block-id":"img","image-id":"i1","asset-id":"a1","asset-generation":"g1","alt-text":"A \"diagram\" <b>","decorative":false,width:320,height:200},[p("cap",[text("Caption")])]),
  el("image",{"block-id":"img2","image-id":"i2","asset-id":"a2","asset-generation":"g2","alt-text":"","decorative":true}),
  table(),
 ]);
}
