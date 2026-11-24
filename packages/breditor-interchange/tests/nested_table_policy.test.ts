import {describe,it,expect} from "vitest";
import {createRichInterchange,type InterchangeOwner} from "../src/index.js";
/** Parser-unit staging stub only; counts native admissions so rejection is proven pre-native. */
function staging(){
  let calls=0;const owner:InterchangeOwner={supportsClipboardInterchange:()=>true,admitClipboardRoot(kind,root){calls++;return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind,structuredJson:JSON.stringify({kind,document:{root:JSON.parse(root)}}),plainText:""};},validateClipboard(source){return{format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:JSON.parse(source).kind??"flow",structuredJson:source,plainText:""};}};
  return{get calls(){return calls;},adapter:createRichInterchange(owner)};
}
// Documented in docs/RICH_TABLES.md#nested-table-policy.
describe("nested-table policy",()=>{
  it("rejects a whole HTML import containing a table inside a table cell, at any flow depth",()=>{
    for(const source of [
      '<p>Before</p><table><tr><td><table><tr><td>Inner</td></tr></table></td></tr></table><p>After</p>',
      '<table><tr><td><blockquote><div><table><tr><td>Inner</td></tr></table></div></blockquote></td></tr></table>',
      '<table><tr><td><ul><li><table><tr><td>Inner</td></tr></table></li></ul></td></tr></table>',
    ]){const test=staging();expect(test.adapter.importHtml(source)).toMatchObject({ok:false,error:"unsupported-content"});expect(test.calls).toBe(0);}
  });
  it("applies the same rejection to nested raw HTML tables in Markdown",()=>{
    const test=staging(),value=test.adapter.importMarkdown("<table><tr><td><table><tr><td>Inner</td></tr></table></td></tr></table>");
    expect(value).toMatchObject({ok:false,error:"unsupported-content"});expect(test.calls).toBe(0);
  });
  it("rejects a nested table in caption flow before native admission",()=>{
    const test=staging(),value=test.adapter.importHtml("<table><caption><blockquote><table><tr><td>Inner</td></tr></table></blockquote></caption><tr><td>Outer</td></tr></table>");
    expect(value).toMatchObject({ok:false,error:"unsupported-content"});expect(test.calls).toBe(0);
  });
  it("still admits sibling (non-nested) tables",()=>{
    const value=staging().adapter.importHtml('<table><tr><td>A</td></tr></table><table><tr><td>B</td></tr></table>');
    expect(value.ok).toBe(true);
  });
});
