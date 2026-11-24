import {fail,limits} from "./budget.js";
import {attribute,isElement,plainText,type HtmlElement} from "./html_tree.js";
import type {HtmlConversion} from "./html_import.js";
import type {StyleState} from "./html_style.js";
import {element,type Element} from "./wire.js";
export function pixels(value:string|undefined):number|null {
  if(value===undefined)return null;const m=/^(\d+(?:\.\d+)?)(px|pt)?$/i.exec(value.trim());return m?Number(m[1])*(m[2]?.toLowerCase()==="pt"?4/3:1):null;
}
/** Reconstruct the complete bounded base-cell partition, never only rendered master cells. */
export function importTable(c:HtmlConversion,node:HtmlElement,state:StyleState):Element[] {
  const rows:{node:HtmlElement;state:StyleState;group:number;remaining:number}[]=[],colWidths:(number|null|undefined)[]=[],captions:Element[]=[];
  // V4 owners keep the first <caption> as the table's caption paragraph (see `tableCaption`).
  let caption:Element|undefined,captioned=false;
  let group=0;
  const widthHint=(node:HtmlElement,fallback?:number|null)=>{
    const raw=c.css(node).get("width")??attribute(node,"width");if(raw===undefined)return fallback;
    const width=pixels(raw);if(width===null)c.b.loss("table-width");return width;
  };
  const addWidth=(rawSpan:string|undefined,width:number|null|undefined)=>{
    const count=span(rawSpan,limits.columns);if(colWidths.length+count>limits.columns)fail("resource-limit");
    for(let i=0;i<count;i++)colWidths.push(width);
  };
  const addColumns=(parent:HtmlElement)=>{
    const children=parent.childNodes.filter(isElement),groupSpan=attribute(parent,"span"),groupWidth=widthHint(parent);
    // An absent group width leaves the existing cell width fallback available.
    if(!children.length){addWidth(groupSpan,groupWidth);return;}
    if(groupSpan!==undefined)c.b.loss("table-geometry");
    for(const child of children){
      if(child.tagName!=="col")fail("malformed-table");if(c.excluded(child))fail("unsupported-content");
      c.style(child,state);addWidth(attribute(child,"span"),widthHint(child,groupWidth));
    }
  };
  for(const n of node.childNodes){
    if(!isElement(n)){if(plainText(n).trim())fail("malformed-table");continue;}
    if(c.excluded(n))fail("unsupported-content");
    if(n.tagName==="caption"){
      const blocks=c.flow(n.childNodes,c.style(n,state),true);
      if(c.capabilities.tableCaptions===true&&!captioned){captioned=true;const kept=tableCaption(c,blocks);caption=kept.caption;captions.push(...kept.before);}
      else{c.b.loss("block-structure");captions.push(...blocks);}
      continue;
    }
    if(n.tagName==="colgroup"){c.style(n,state);addColumns(n);continue;}
    const groupState=n.tagName==="tr"?state:c.style(n,state),rowNodes=n.tagName==="tr"?[n]:["thead","tbody","tfoot"].includes(n.tagName)?n.childNodes.filter(isElement):null;
    if(rowNodes===null)fail("malformed-table");group++;
    for(const [i,row]of rowNodes.entries()){if(row.tagName!=="tr")fail("malformed-table");if(c.excluded(row))fail("unsupported-content");rows.push({node:row,state:groupState,group,remaining:rowNodes.length-i});}
  }
  if(!rows.length){c.b.loss("table-geometry");return caption?[...captions,caption]:captions;}
  if(rows.length>limits.rows)fail("resource-limit");
  const tableId=c.b.id(),rowIds=rows.map(()=>c.b.id()),columns:string[]=[],grid:({body:Element[];header:boolean}|undefined)[][]=rows.map(()=>[]),merges:{r:number;c:number;rs:number;cs:number}[]=[];
  const ensureColumn=(i:number)=>{if(i>=limits.columns||(i+1)*rows.length>limits.cells)fail("resource-limit");while(columns.length<=i)columns.push(c.b.id());};
  for(const [r,row]of rows.entries()){
    const rowStyle=c.style(row.node,row.state);let column=0;
    for(const cell of row.node.childNodes){
      if(!isElement(cell)){if(plainText(cell).trim())fail("malformed-table");continue;}
      if(!["td","th"].includes(cell.tagName))fail("malformed-table");if(c.excluded(cell))fail("unsupported-content");while(grid[r]![column])column++;
      const cs=span(attribute(cell,"colspan"),limits.columns),rawRowspan=attribute(cell,"rowspan"),requested=rawRowspan==="0"?row.remaining:span(rawRowspan,65534),rs=Math.min(requested,row.remaining);
      if(rs!==requested)c.b.loss("table-geometry");ensureColumn(column+cs-1);
      for(let y=r;y<r+rs;y++)for(let x=column;x<column+cs;x++)if(grid[y]![x])fail("malformed-table");
      const cellStyle=c.style(cell,rowStyle),parts=cell.childNodes.filter(isElement),partitioned=parts.some(n=>attribute(n,"data-breditor-cell-partition")!==undefined||attribute(n,"data-breditor-cell-row")!==undefined||attribute(n,"data-breditor-cell-column")!==undefined);
      if(partitioned){
        if(parts.length!==rs*cs||cell.childNodes.some(n=>!isElement(n)&&plainText(n).trim()))fail("malformed-table");
        for(const part of parts){
          const y=attribute(part,"data-breditor-cell-row"),x=attribute(part,"data-breditor-cell-column"),header=attribute(part,"data-breditor-cell-header");
          if(part.tagName!=="div"||attribute(part,"data-breditor-cell-partition")!=="1"||y===undefined||x===undefined||!/^\d+$/.test(y)||!/^\d+$/.test(x)||Number(y)>=rs||Number(x)>=cs||!["0","1"].includes(header??""))fail("malformed-table");
          const py=r+Number(y),px=column+Number(x);if(grid[py]![px])fail("malformed-table");const body=c.flow(part.childNodes,c.style(part,cellStyle),true);grid[py]![px]={body:body.length?body:[element(c.b,"paragraph")],header:header==="1"};
        }
      }else{
        const body=c.flow(cell.childNodes,cellStyle,true);if(!body.length)body.push(element(c.b,"paragraph"));
        for(let y=r;y<r+rs;y++)for(let x=column;x<column+cs;x++)grid[y]![x]={body:y===r&&x===column?body:[element(c.b,"paragraph")],header:cell.tagName==="th"};
      }
      const rawWidth=c.css(cell).get("width")??attribute(cell,"width"),width=pixels(rawWidth);
      if(width!==null&&cs===1&&colWidths[column]===undefined)colWidths[column]=width;else if(rawWidth!==undefined&&(width===null||cs>1))c.b.loss("table-width");
      if(rs>1||cs>1)merges.push({r,c:column,rs,cs});column+=cs;
    }
  }
  if(!columns.length){c.b.loss("table-geometry");return caption?[...captions,caption]:captions;}
  if(colWidths.length>columns.length){c.b.loss("table-geometry");for(let i=columns.length;i<colWidths.length;i++)ensureColumn(i);}
  const nativeRows=rows.map((_row,r)=>element(c.b,"table-row",columns.map((column,x)=>{
    let value=grid[r]![x];if(!value){value={header:false,body:[element(c.b,"paragraph")]};c.b.loss("table-geometry");}
    return element(c.b,"table-cell",value.body,{"breditor/column-id":column,"breditor/header":value.header});
  }),{"breditor/row-id":rowIds[r]}));
  const rawTableWidth=c.css(node).get("width")??attribute(node,"width"),tableWidth=pixels(rawTableWidth);
  if(rawTableWidth!==undefined&&tableWidth===null)c.b.loss("table-width");
  const nativeColumns=columns.map((id,i)=>{const source=colWidths[i]??(tableWidth===null?120:tableWidth/columns.length),width=Math.min(4096,Math.max(32,Math.round(source)));if(source!==width)c.b.loss("table-width");return{id,width};});
  const records=merges.map((m,i)=>({id:c.b.id(),lamport:"1",writer:"1",counter:String(i+1),rows:rowIds,columns,"first-row":rowIds[m.r],"last-row":rowIds[m.r+m.rs-1],"first-column":columns[m.c],"last-column":columns[m.c+m.cs-1]})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  return[...captions,element(c.b,"table",caption?[...nativeRows,caption]:nativeRows,{"breditor/table-id":tableId,"breditor/columns":nativeColumns,"breditor/merges":records,"breditor/retracted-merges":[]})];
}
/** One `<caption>` for a V4 owner: its single paragraph is the caption. A leading heading
 * becomes a paragraph with the same inline content; any further (or unsupported) blocks stay as flow
 * before the table. Both repairs report `block-structure`. An empty caption is an empty paragraph. */
function tableCaption(c:HtmlConversion,blocks:Element[]):{caption:Element|undefined;before:Element[]} {
  if(!blocks.length)return{caption:element(c.b,"paragraph"),before:[]};
  const [first,...rest]=blocks;
  if(rest.length)c.b.loss("block-structure");
  if(first!.type==="breditor/paragraph")return{caption:first,before:rest};
  if(first!.type==="breditor/heading"){c.b.loss("block-structure");const properties=Object.fromEntries(Object.entries(first!.properties).filter(([key])=>key!=="breditor/level"&&key!=="breditor/block-id"));return{caption:element(c.b,"paragraph",first!.children,properties),before:rest};}
  if(!rest.length)c.b.loss("block-structure");
  return{caption:undefined,before:blocks};
}
function span(value:string|undefined,maximum:number):number {
  if(value===undefined)return 1;if(!/^\d+$/.test(value))fail("malformed-table");const n=Number(value);if(!Number.isSafeInteger(n)||n<1)fail("malformed-table");if(n>maximum)fail("resource-limit");return n;
}
