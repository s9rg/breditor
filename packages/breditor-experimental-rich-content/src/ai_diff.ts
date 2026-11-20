/** Presentation-only word diff for the rewrite review. It never decides what is applied. */
export interface RichAiDiffPart {readonly kind:"same"|"removed"|"added";readonly text:string}
/** Whitespace runs, word runs, or one other code point (so surrogate pairs are never split). */
const tokenPattern=/\s+|[\p{L}\p{N}\p{M}_'’]+|[^\s\p{L}\p{N}\p{M}_'’]/gu;
/** Above this many LCS cells the changed middle is shown as one removal and one addition (still exact, coarser). */
const maxCells=2_000_000;
function push(parts:RichAiDiffPart[],kind:RichAiDiffPart["kind"],text:string):void{if(!text)return;const last=parts[parts.length-1];if(last&&last.kind===kind)parts[parts.length-1]={kind,text:last.text+text};else parts.push({kind,text});}
export function diffAiText(before:string,after:string):readonly RichAiDiffPart[] {
 const parts:RichAiDiffPart[]=[],a=before.match(tokenPattern)??[],b=after.match(tokenPattern)??[];
 let start=0;while(start<a.length&&start<b.length&&a[start]===b[start])start++;
 let end=0;while(end<a.length-start&&end<b.length-start&&a[a.length-1-end]===b[b.length-1-end])end++;
 push(parts,"same",a.slice(0,start).join(""));
 const x=a.slice(start,a.length-end),y=b.slice(start,b.length-end),n=x.length,m=y.length;
 if(n*m>maxCells){push(parts,"removed",x.join(""));push(parts,"added",y.join(""));}
 else{
  const width=m+1,table=new Uint32Array((n+1)*width);
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)table[i*width+j]=x[i]===y[j]?table[(i+1)*width+j+1]!+1:Math.max(table[(i+1)*width+j]!,table[i*width+j+1]!);
  let i=0,j=0;
  while(i<n&&j<m){if(x[i]===y[j]){push(parts,"same",x[i]!);i++;j++;}else if(table[(i+1)*width+j]!>=table[i*width+j+1]!){push(parts,"removed",x[i]!);i++;}else{push(parts,"added",y[j]!);j++;}}
  while(i<n)push(parts,"removed",x[i++]!);while(j<m)push(parts,"added",y[j++]!);
 }
 push(parts,"same",a.slice(a.length-end).join(""));
 return Object.freeze(parts.map(part=>Object.freeze(part)));
}
