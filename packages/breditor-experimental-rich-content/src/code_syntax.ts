export type CodeTokenKind = "comment" | "keyword" | "literal" | "number" | "operator" | "string";

export interface CodeToken {
 readonly start: number;
 readonly end: number;
 readonly kind: CodeTokenKind;
}

type Language = "javascript" | "typescript" | "json" | "python" | "rust";

const languages = new Map<string, Language>([
 ["js", "javascript"], ["javascript", "javascript"], ["mjs", "javascript"], ["cjs", "javascript"],
 ["ts", "typescript"], ["typescript", "typescript"], ["mts", "typescript"], ["cts", "typescript"],
 ["json", "json"], ["py", "python"], ["python", "python"], ["rs", "rust"], ["rust", "rust"],
]);

const words = (text: string): Set<string> => new Set(text.split(" "));
const javascript = "as async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch this throw try typeof var void while with yield";
const keywords: Record<Language, Set<string>> = {
 javascript: words(javascript),
 typescript: words(javascript + " abstract any asserts bigint boolean constructor declare enum implements infer interface is keyof module namespace never number object override private protected public readonly satisfies string symbol type unique unknown"),
 json: new Set(),
 python: words("and as assert async await break case class continue def del elif else except finally for from global if import in is lambda match nonlocal not or pass raise return try while with yield"),
 rust: words("as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while"),
};
const literals: Record<Language, Set<string>> = {
 javascript: words("true false null undefined"),
 typescript: words("true false null undefined"),
 json: words("true false null"),
 python: words("True False None"),
 rust: words("true false"),
};

const identifier = /[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*/uy;
const number = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.[\d_]+)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)(?:[iu](?:8|16|32|64|128|size)|f(?:32|64)|[nj])?/y;
const operator = /[+*/%=&|!<>^~?:.\-]+/y;
const rustCharacter = /'(?:\\(?:u\{[\da-fA-F_]{1,8}\}|x[\da-fA-F]{2}|[^\r\n])|[^\\'\r\n])'/uy;
const rustRawString = /(?:b|c)?r(#{0,32})"/y;
const lineEnd = /[\r\n]/g;

export function codeLanguageForHighlighting(label: string): Language | undefined {
 return languages.get(label.toLowerCase());
}

function matchAt(pattern: RegExp, source: string, start: number): RegExpExecArray | null {
 pattern.lastIndex = start;
 return pattern.exec(source);
}

function quotedEnd(source: string, start: number, delimiter: string): number {
 const multiline = delimiter === "`" || delimiter.length === 3;
 for (let offset = start + delimiter.length; offset < source.length; offset++) {
  if (source.startsWith(delimiter, offset)) return offset + delimiter.length;
  const character = source[offset];
  if (character === "\\") offset++;
  else if (!multiline && (character === "\n" || character === "\r")) return offset;
 }
 return source.length;
}

function blockCommentEnd(source: string, start: number, nested: boolean): number {
 if (!nested) {
  const end = source.indexOf("*/", start + 2);
  return end < 0 ? source.length : end + 2;
 }
 const delimiters = /\/\*|\*\//g;
 delimiters.lastIndex = start + 2;
 let depth = 1;
 for (let match = delimiters.exec(source); match; match = delimiters.exec(source)) {
  depth += match[0] === "/*" ? 1 : -1;
  if (depth === 0) return delimiters.lastIndex;
 }
 return source.length;
}

/** A bounded lexical pass over editor text. Offsets use DOM UTF-16 units. */
export function tokenizeCode(source: string, language: Language, limit: number): CodeToken[] {
 const tokens: CodeToken[] = [];
 const cStyle = language !== "json" && language !== "python";
 const javascriptFamily = language === "javascript" || language === "typescript";
 for (let start = 0; start < source.length && tokens.length < limit;) {
  const character = source[start];
  const pair = source.slice(start, start + 2);
  const rawString = language === "rust" && (character === "r" || character === "b" || character === "c")
   ? matchAt(rustRawString, source, start)
   : null;
  let kind: CodeTokenKind | undefined;
  let end = start + 1;
  if ((cStyle && pair === "//") || (language === "python" && character === "#")) {
   lineEnd.lastIndex = start;
   end = lineEnd.exec(source)?.index ?? source.length;
   kind = "comment";
  } else if (cStyle && pair === "/*") {
   end = blockCommentEnd(source, start, language === "rust");
   kind = "comment";
  } else if (rawString) {
   const delimiter = '"' + (rawString[1] ?? "");
   const closing = source.indexOf(delimiter, start + rawString[0].length);
   end = closing < 0 ? source.length : closing + delimiter.length;
   kind = "string";
  } else if (character === '"' || (character === "'" && (javascriptFamily || language === "python")) ||
      (character === "`" && javascriptFamily)) {
   const triple = character.repeat(3);
   end = quotedEnd(source, start, language === "python" && source.startsWith(triple, start) ? triple : character);
   kind = "string";
  } else {
   const literal = language === "rust" && character === "'" ? matchAt(rustCharacter, source, start) : null;
   const word = matchAt(identifier, source, start);
   const numeric = word || literal ? null : matchAt(number, source, start);
   const punctuation = word || literal || numeric ? null : matchAt(operator, source, start);
   if (literal) {
    end = start + literal[0].length;
    kind = "string";
   } else if (word) {
    end = start + word[0].length;
    if (keywords[language].has(word[0])) kind = "keyword";
    else if (literals[language].has(word[0])) kind = "literal";
   } else if (numeric || punctuation) {
    end = start + (numeric ?? punctuation)![0].length;
    kind = numeric ? "number" : "operator";
    // Leave a slash available for the next iteration to recognize an adjacent comment.
    if (punctuation && cStyle) {
     const comment = source.slice(start + 1, end + 1).search(/\/[/\*]/);
     if (comment >= 0) end = start + 1 + comment;
    }
   }
  }
  if (kind) tokens.push({ start, end, kind });
  start = end;
 }
 return tokens;
}
