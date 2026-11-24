import {describe,expect,it} from "vitest";
import {createRichInterchange,exportHtmlPage,importHtmlPage,type InterchangeOwner} from "../src/index.js";

function fixture(){
  // Writer staging. The browser suite separately proves actual cold native restore.
  let validates=0;
  const owner:InterchangeOwner={
    supportsClipboardInterchange:()=>true,
    admitClipboardRoot(kind,root){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},
    validateClipboard(clipboardJson){validates++;return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:JSON.parse(clipboardJson).kind,structuredJson:clipboardJson,plainText:""};},
  };
  const adapter=createRichInterchange(owner);
  const transfer=(html:string)=>{const result=adapter.importHtml(html);if(!result.ok)throw Error(result.error);return result.value.structuredJson;};
  return{owner,adapter,transfer,get validates(){return validates;}};
}

describe("complete HTML page export",()=>{
  it("escapes the closed head fields and keeps the ordinary admitted body and losses",()=>{
    const {owner,adapter,transfer}=fixture(),source=transfer('<p><b>Body</b></p>');
    const fragment=adapter.exportHtml(source);
    if(!fragment.ok)throw Error(fragment.error);
    const metadata={title:'</title> & 概要 📝',description:'" onload="test <tag>',language:"PT-br",direction:"rtl"} as const;
    const page=exportHtmlPage(owner,source,metadata);
    expect(page).toEqual({ok:true,value:'<!doctype html><html lang="pt-BR" dir="rtl"><head><meta charset="utf-8"><title>&lt;/title&gt; &amp; 概要 📝</title>'+
      '<meta name="description" content="&quot; onload=&quot;test &lt;tag&gt;"></head><body>'+fragment.value+'</body></html>',losses:fragment.losses});
  });
  it("rejects open-ended metadata and applies text budgets before native reads",()=>{
    const t=fixture(),source=t.transfer("<p>Body</p>");
    expect(exportHtmlPage(t.owner,source,{title:"Title",...{stylesheet:"https://example.test/theme.css"}})).toEqual({ok:false,error:"unsupported-content",losses:[]});
    expect(exportHtmlPage(t.owner,source,{title:"Title",language:"x-extension"})).toEqual({ok:false,error:"unsupported-content",losses:[]});
    expect(exportHtmlPage(t.owner,source,{title:"題".repeat(342)})).toEqual({ok:false,error:"resource-limit",losses:[]});
    expect(exportHtmlPage(t.owner,source,{title:"A\ud800"})).toEqual({ok:false,error:"invalid-source",losses:[]});
    expect(exportHtmlPage(t.owner,source,{title:"Title",description:"B\udc00"})).toEqual({ok:false,error:"invalid-source",losses:[]});
    expect(t.validates).toBe(0);
  });
  it("checks the full output size and keeps normal image publication policy and notices",()=>{
    const t=fixture(),fragment=t.transfer("<p>"+("&amp;").repeat(209200)+"</p>");
    // The escaped fragment fits the output budget. The page plus its bounded description does not.
    expect(t.adapter.exportHtml(fragment).ok).toBe(true);
    expect(exportHtmlPage(t.owner,fragment,{title:"Title",description:"a".repeat(4096)})).toEqual({ok:false,error:"resource-limit",losses:[]});
    const importer=createRichInterchange(t.owner,{resolveImage:()=>({asset:"owned",generation:"p1"})});
    const admitted=importer.importHtml('<img src="a.png" alt="Figure">');
    if(!admitted.ok)throw Error(admitted.error);
    const absent=exportHtmlPage(t.owner,admitted.value.structuredJson,{title:"Title"});
    expect(absent.losses).toEqual([{code:"image-reference",count:1,effect:"loss"}]);
    const published=exportHtmlPage(t.owner,admitted.value.structuredJson,{title:"Title"},{exportImage:binding=>binding.asset==="owned"?"https://example.test/a.png":undefined});
    expect(published.ok&&published.value).toContain('<img src="https://example.test/a.png" alt="Figure">');
  });
});


describe("explicit full HTML page import",()=>{
  it("reads supported head fields separately and preserves the admitted body CSS",()=>{
    const {owner}=fixture();
    const page=importHtmlPage(owner,'<!doctype html><html lang="pt-br" dir="RTL"><head><meta charset="utf-8">'+
      '<title>News &amp; events 📝</title><meta name="description" content="First"><meta name="description" content="Second">'+
      '<base href="https://example.test/"><meta http-equiv="refresh" content="0"><link rel="stylesheet" href="/outside.css">'+
      '<style>p{font-size:20px}</style></head><body><p>Body</p></body></html>');
    if(!page.ok)throw Error(page.error);
    expect(page.value.metadata).toEqual({title:"News & events 📝",description:"First",language:"pt-BR",direction:"rtl"});
    expect(page.value.body.kind).toBe("flow");
    expect(page.losses).toEqual([{code:"removed-content",effect:"loss",count:3},{code:"unsupported-style",effect:"loss",count:1}]);
    const paragraph=JSON.parse(page.value.body.structuredJson).document.root.children[0];
    expect(paragraph.properties["breditor/block-direction"]).toBeUndefined();
    expect(paragraph.children[0].formats).toEqual([{type:"breditor-inline/text-size",properties:{"breditor-inline/pixels":20}}]);
  });
  it("rejects oversized metadata before native admission and reports invalid optional values",()=>{
    const {owner}=fixture();
    const oversized='<title>'+("点").repeat(342)+'</title><p>Body</p>';
    expect(importHtmlPage({...owner,admitClipboardRoot:()=>{throw Error("native was called");}},oversized)).toEqual({ok:false,error:"resource-limit",losses:[]});
    expect(importHtmlPage(owner,'<html lang="x-local" dir="down"><body><p>Body</p></body></html>')).toMatchObject({
      ok:true,value:{metadata:{title:""}},losses:[{code:"unsupported-attribute",count:2,effect:"loss"}],
    });
  });
  it("keeps ordinary fragment import's inherited body alignment and separate notice behavior",()=>{
    const {owner,adapter}=fixture(),source='<html dir="rtl"><head><base href="https://example.test/"></head><body><p>Body</p></body></html>';
    const page=importHtmlPage(owner,source),fragment=adapter.importHtml(source);
    if(!page.ok||!fragment.ok)throw Error("Expected both bounded HTML conversion modes");
    const paragraph=(result:{structuredJson:string})=>JSON.parse(result.structuredJson).document.root.children[0];
    expect(paragraph(page.value.body).properties["breditor/block-direction"]).toBeUndefined();
    expect(paragraph(fragment.value).properties["breditor/block-direction"]).toBe(2);
    expect(fragment.losses).toEqual([]);
    expect(page.losses).toEqual([{code:"removed-content",count:1,effect:"loss"}]);
  });
});
