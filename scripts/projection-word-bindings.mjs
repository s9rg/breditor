// Private generated-binding experiment; never patch class prototypes at runtime.
import assert from "node:assert/strict";
import {parseSync} from "rolldown/utils";

const pairs = ["childCount", "childAt", "formatCount", "formatPropertyCount", "headingLevel", "orderedListStart"];
const helper = `
const __breditorWordPrototype = Object.getPrototypeOf(Uint32Array.prototype);
const __breditorWordLength = Object.getOwnPropertyDescriptor(__breditorWordPrototype, "length").get;
const __breditorWordTag = Object.getOwnPropertyDescriptor(__breditorWordPrototype, Symbol.toStringTag).get;
const __breditorWordBuffer = Object.getOwnPropertyDescriptor(__breditorWordPrototype, "buffer").get;
const __breditorBufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength").get;
function __breditorOptionalU32(record) {
    const length = Reflect.apply(__breditorWordLength, record, []);
    const tag = Reflect.apply(__breditorWordTag, record, []);
    Reflect.apply(__breditorBufferLength, Reflect.apply(__breditorWordBuffer, record, []), []);
    if (length !== 2 || tag !== "Uint32Array") throw TypeError("invalid projection scalar words");
    const presence = record[0], value = record[1];
    if (presence === 0 && value === 0) return undefined;
    if (presence === 1) return value;
    throw TypeError("invalid projection scalar words");
}
`;
const integerHelper = `
const __breditorBigInt = BigInt;
const __breditorAsIntN = BigInt.asIntN;
const __breditorNumber = Number;
function __breditorOptionalInteger(record) {
    const length = Reflect.apply(__breditorWordLength, record, []);
    const tag = Reflect.apply(__breditorWordTag, record, []);
    Reflect.apply(__breditorBufferLength, Reflect.apply(__breditorWordBuffer, record, []), []);
    if (length !== 3 || tag !== "Uint32Array") throw TypeError("invalid projection integer words");
    const presence = record[0], low = record[1], high = record[2];
    if (presence === 0 && low === 0 && high === 0) return undefined;
    if (presence !== 1) throw TypeError("invalid projection integer words");
    const value = __breditorAsIntN(64, (__breditorBigInt(high) << 32n) | __breditorBigInt(low));
    if (value < -9007199254740991n || value > 9007199254740991n) throw TypeError("unsafe projection integer");
    return __breditorNumber(value);
}
`;

/** Preserve public names/parameters and native word-body cleanup, replacing only
 * legacy method bodies. Each getter calls its native word calculation once.
 * All six structural methods must exist; explicit integer opt-in additionally
 * requires the signed property pair. Public declarations stay unchanged.
 */
export function rewriteProjectionWordBindings(source, {privateIntegerWords = false} = {}) {
  assert.equal(typeof privateIntegerWords, "boolean");
  assert.ok(!source.includes("__breditor"), "binding helper collision");
  const file = parseSync("generated.js", source);
  assert.equal(file.errors.length, 0, "invalid generated JavaScript");
  const classes = file.program.body.map(node => node.declaration ?? node)
    .filter(node => node.type === "ClassDeclaration" && node.id?.name === "BreditorProjection");
  assert.equal(classes.length, 1, "expected exact generated projection class");
  const methods = new Map();
  for (const node of classes[0].body.body) if (node.type === "MethodDefinition" && node.kind === "method" && !node.static && node.key.type === "Identifier") {
    assert.ok(!methods.has(node.key.name), "duplicate projection method");
    methods.set(node.key.name, node.value);
  }
  const edits = [];
  for (const name of privateIntegerWords ? [...pairs, "formatPropertyInteger"] : pairs) {
    const legacy = methods.get(name), word = methods.get(`${name}Words`);
    assert.ok(legacy?.body && word?.body, `missing projection pair ${name}`);
    assert.equal(legacy.params.length, word.params.length, "getter arity mismatch");
    const rename = new Map(word.params.map((parameter, index) => {
      assert.ok(parameter.type === "Identifier" && legacy.params[index].type === "Identifier");
      return [parameter.name, legacy.params[index].name];
    }));
    const replacements = [];
    let returns = 0;
    const visit = node => {
      if (node.type === "ReturnStatement") {
        assert.ok(node.argument?.type === "Identifier", "word getter return shape changed");
        returns++;
        replacements.push({from: node.argument.start, to: node.argument.end,
          text: `${name === "formatPropertyInteger" ? "__breditorOptionalInteger" : "__breditorOptionalU32"}(${node.argument.name})`});
        return;
      } else if (node.type === "Identifier" && rename.has(node.name)) {
        replacements.push({from: node.start, to: node.end, text: rename.get(node.name)});
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) { for (const child of value) if (child?.type) visit(child); }
        else if (value?.type) visit(value);
      }
    };
    visit(word.body);
    assert.equal(returns, 1, "word getter must return exactly once");
    let body = source.slice(word.body.start, word.body.end), start = word.body.start;
    for (const edit of replacements.sort((a, b) => b.from - a.from)) {
      body = body.slice(0, edit.from - start) + edit.text + body.slice(edit.to - start);
    }
    edits.push({from: legacy.body.start, to: legacy.body.end, text: body});
  }
  for (const edit of edits.sort((a, b) => b.from - a.from)) source = source.slice(0, edit.from) + edit.text + source.slice(edit.to);
  return source + helper + (privateIntegerWords ? integerHelper : "");
}
