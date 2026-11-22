import {describe, expect, it} from "vitest";
import {codeLanguageForHighlighting, tokenizeCode} from "../src/code_syntax.js";

function colored(source: string, label: string, limit = 100) {
 const language = codeLanguageForHighlighting(label)!;
 return tokenizeCode(source, language, limit).map(({start, end, kind}) => [source.slice(start, end), kind]);
}

describe("code token ranges", () => {
 it("uses UTF-16 offsets and keeps comment markers inside quoted text", () => {
  expect(colored('const greeting = "🌱 //";+/* note */ false', "TS")).toEqual([
   ["const", "keyword"], ["=", "operator"], ['"🌱 //"', "string"], ["+", "operator"],
   ["/* note */", "comment"], ["false", "literal"],
  ]);
 });

 it("handles Python docstrings, partial quotes, and hash comments", () => {
  expect(colored('def café():\n    """notes\n    # inside"""\n    return "incomplete\n# outside\nNone', "python")).toEqual([
   ["def", "keyword"], [":", "operator"], ['"""notes\n    # inside"""', "string"],
   ["return", "keyword"], ['"incomplete', "string"], ["# outside", "comment"], ["None", "literal"],
  ]);
 });

 it("distinguishes Rust lifetimes, character literals, raw strings, and nested comments", () => {
  expect(colored('fn f<\'a>(s: &\'a str) { /* outer /* inner */ done */ let _ = r##"a "# b"##; let _ = \'🦀\'; }', "rs")).toEqual([
   ["fn", "keyword"], ["<", "operator"], [">", "operator"], [":", "operator"], ["&", "operator"],
   ["/* outer /* inner */ done */", "comment"], ["let", "keyword"], ["=", "operator"],
   ['r##"a "# b"##', "string"], ["let", "keyword"], ["=", "operator"], ["'🦀'", "string"],
  ]);
 });

 it("accepts only explicit aliases and stops at the range budget", () => {
  expect(codeLanguageForHighlighting("unknown")).toBeUndefined();
  expect(codeLanguageForHighlighting("constructor")).toBeUndefined();
  expect(colored('{"v":1.2e-3,"enabled":true}', "json", 3)).toEqual([
   ['"v"', "string"], [":", "operator"], ["1.2e-3", "number"],
  ]);
 });
});
