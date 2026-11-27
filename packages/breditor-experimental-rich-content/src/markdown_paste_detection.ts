/**
 * Version-one conservative Markdown detector for an ordinary text/plain paste (docs/RICH_INTERCHANGE.md,
 * "Automatic Markdown paste"). It is a pure, deterministic line scanner: no parser, DOM, time or randomness.
 * It only decides whether a paste is offered to the host's explicit Markdown import; that import and the
 * native schema validation still decide what the content becomes.
 *
 * Signals and weights (lines inside a closed fence are excluded from every other signal):
 * - `table` 4: a GFM header row followed by a delimiter row (`| --- | :-: |`) with the same two or more columns.
 * - `task-list` 4: a run of two or more `- [ ]` / `- [x]` items.
 * - `fence` 3: at least one closed ``` or ~~~ fence.
 * - `heading` 2 each, at most two counted: `#`..`######`, a space and text, at the start or after a blank
 *   line, and not directly followed by a code-like line (a `# comment` in a script or YAML file).
 * - `bullet-list` / `ordered-list` 2 per run, at most two runs counted: two or more consecutive items. A
 *   lone `* note` or `1. note` line is not a list.
 * - `link` / `image` 2 once: `[text](target)` / `![alt](target)` with a scheme, `mailto:`, `/`, `./`, `../`
 *   or `#` target.
 * - `strong`, `emphasis`, `strike`, `inline-code` 1 each, at most 3 together. Delimiters must open after
 *   start, whitespace or opening punctuation and close before end, whitespace or punctuation, so
 *   `snake_case`, `a * b`, `2*3*4`, `src/**` and file globs never count.
 * - `blockquote` 1 once: a `>` line (e-mail replies quote this way, so it stays weak).
 *
 * Decision: Markdown when the score is at least 4 and two distinct signal kinds are present, or the only kind
 * is `table` or `task-list` (both unambiguous). Vetoes keep the text literal: fewer than two non-blank lines,
 * more than 256 KiB of input, a unified diff, or a code-like body (two or more code-like lines that are at
 * least a fifth of the non-blank lines outside fences; inline code spans are ignored for this test).
 */
export const markdownPasteDetectorV1="markdown-paste-detect-v1";
export type MarkdownPasteSignal="heading"|"fence"|"bullet-list"|"ordered-list"|"task-list"|"blockquote"|"table"|"strong"|"emphasis"|"strike"|"inline-code"|"link"|"image";
export type MarkdownPasteVeto="single-line"|"too-large"|"diff"|"code";
export interface MarkdownPasteDetection {
 readonly detector:typeof markdownPasteDetectorV1;
 readonly markdown:boolean;
 /** Weighted score after the per-signal caps; the threshold is 4. */
 readonly score:number;
 /** Distinct signal kinds in first-seen order. */
 readonly signals:readonly MarkdownPasteSignal[];
 readonly veto?:MarkdownPasteVeto;
}
const MAX_SOURCE=256*1024,THRESHOLD=4,INLINE_CAP=3,LINE_SCAN=4096;
const fenceOpen=/^ {0,3}(`{3,}|~{3,})[^`]*$/;
const heading=/^ {0,3}#{1,6}[ \t]+[^\s#]/;
const bullet=/^ {0,9}[-+*][ \t]+\S/;
const ordered=/^ {0,9}\d{1,9}[.)][ \t]+\S/;
const task=/^ {0,9}[-+*][ \t]+\[[ xX]\][ \t]+\S/;
const quote=/^ {0,3}>/;
const delimiterRow=/^ {0,3}\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/;
const diff=/^(diff --git |@@ -\d|\+\+\+ |--- a\/|index [0-9a-f]{7,}\.\.)/;
const codeLike=/(^\s*(import|export|from|def|class|function|const|let|var|return|if|elif|else|for|while|public|private|package|using|#include|#!)\b)|([;{}]\s*$)|(^\s*\$ )|(=>|::|->)|(^\s*[a-z_][\w.-]*:\s*$)/;
const isCode=(line:string):boolean=>codeLike.test(line.replace(/`[^`\n]*`/g,""));
// Inline delimiters: an opener after start/space/opening punctuation, a closer before end/space/punctuation.
const open="(?:^|[\\s(\\[{\"'])",close="(?=$|[\\s)\\]}\"'.,:;!?])";
const strong=new RegExp(`${open}(\\*\\*|__)(?=[^\\s*_])[^*_\\n]*?[^\\s*_\\\\]\\1${close}`);
const emphasis=new RegExp(`${open}([*_])(?=[^\\s*_])[^*_\\n]*?\\p{L}[^*_\\n]*?(?<=[^\\s\\\\])\\1${close}`,"u");
const strike=new RegExp(`${open}~~(?=\\S)[^~\\n]*?\\S~~${close}`);
const inlineCode=/(?:^|[^`\\])`[^`\n]+`(?!`)/;
const link=/(!?)\[[^\]\n]+\]\((?:[a-z][a-z0-9+.-]*:\/\/|mailto:|\/|\.{1,2}\/|#)[^\s)]*\)/i;
const cells=(line:string):number=>line.trim().replace(/^\|/,"").replace(/\|$/,"").split("|").length;
interface Tally {score:number;inline:number;links:number;readonly signals:MarkdownPasteSignal[]}
/** Classify `source`. Equal input always gives an equal, frozen result. */
export function detectMarkdownPaste(source:string):MarkdownPasteDetection {
 if(typeof source!=="string")throw new TypeError("Expected paste text");
 if(source.length>MAX_SOURCE)return result(0,[],"too-large");
 const lines=source.split(/\r\n|[\r\n]/);
 if(lines.filter(line=>line.trim()).length<2)return result(0,[],"single-line");
 if(lines.some(line=>diff.test(line)))return result(0,[],"diff");
 // Closed fences first; their lines are masked from every other signal. An unclosed fence is no signal.
 const visible:(string|undefined)[]=[...lines];let fences=0;
 for(let i=0;i<lines.length;i++){
  const opened=fenceOpen.exec(lines[i]!);if(!opened)continue;
  const marker=opened[1]!,closing=new RegExp(`^ {0,3}${marker[0]==="`"?"`":"~"}{${marker.length},}[ \\t]*$`);
  let end=i+1;while(end<lines.length&&!closing.test(lines[end]!))end++;
  if(end>=lines.length)break;
  for(let k=i;k<=end;k++)visible[k]=undefined;fences++;i=end;
 }
 const scanned=visible.filter((line):line is string=>line!==undefined&&!!line.trim()),code=scanned.filter(isCode).length;
 if(code>=2&&code*5>=scanned.length)return result(0,[],"code");
 const tally:Tally={score:0,inline:0,links:0,signals:[]};let headings=0,lists=0,quoted=false;
 if(fences){tally.score+=3;tally.signals.push("fence");}
 for(let i=0;i<visible.length;i++){
  const line=visible[i];if(line===undefined)continue;
  const previous=i>0?visible[i-1]:"",next=visible[i+1];
  if(heading.test(line)&&(previous===undefined||!previous.trim())&&!(next!==undefined&&!!next.trim()&&isCode(next))){
   if(headings++<2){tally.score+=2;tally.signals.push("heading");}
   inlineSignals(line,tally);continue;
  }
  if(line.includes("|")&&next!==undefined&&next.includes("|")&&delimiterRow.test(next)&&cells(line)>=2&&cells(line)===cells(next)){
   tally.score+=4;tally.signals.push("table");i++;
   while(i+1<visible.length&&visible[i+1]?.includes("|"))inlineSignals(visible[++i]!,tally);
   continue;
  }
  if(quote.test(line)){if(!quoted){tally.score+=1;tally.signals.push("blockquote");quoted=true;}inlineSignals(line,tally);continue;}
  if(bullet.test(line)||ordered.test(line)){
   // A run is consecutive item lines; a blank or other line ends it. Nested items join their parent's run.
   let end=i;while(end+1<visible.length&&visible[end+1]!==undefined&&(bullet.test(visible[end+1]!)||ordered.test(visible[end+1]!)))end++;
   const run=visible.slice(i,end+1) as string[];
   if(run.length>=2){
    if(run.filter(entry=>task.test(entry)).length>=2){tally.score+=4;tally.signals.push("task-list");}
    else if(lists++<2){tally.score+=2;tally.signals.push(ordered.test(run[0]!)?"ordered-list":"bullet-list");}
   }
   for(const entry of run)inlineSignals(entry,tally);
   i=end;continue;
  }
  inlineSignals(line,tally);
 }
 return result(tally.score+(tally.links?2:0)+tally.inline,tally.signals);
}
function result(score:number,signals:readonly MarkdownPasteSignal[],veto?:MarkdownPasteVeto):MarkdownPasteDetection {
 const kinds=[...new Set(signals)],only=kinds.length===1?kinds[0]:undefined;
 const markdown=veto===undefined&&score>=THRESHOLD&&(kinds.length>=2||only==="table"||only==="task-list");
 return Object.freeze({detector:markdownPasteDetectorV1,markdown,score,signals:Object.freeze(kinds),...(veto?{veto}:{})});
}
/** One line's inline signals. Links and images count once in total; the other kinds share a cap of three. */
function inlineSignals(line:string,tally:Tally):void {
 const text=line.length>LINE_SCAN?line.slice(0,LINE_SCAN):line,linked=link.exec(text);
 if(linked){if(!tally.links)tally.signals.push(linked[1]?"image":"link");tally.links++;}
 const plain=linked?text.replace(link," "):text;
 for(const [pattern,signal] of [[strong,"strong"],[emphasis,"emphasis"],[strike,"strike"],[inlineCode,"inline-code"]] as const)
  if(tally.inline<INLINE_CAP&&!tally.signals.includes(signal)&&pattern.test(plain)){tally.signals.push(signal);tally.inline++;}
}
