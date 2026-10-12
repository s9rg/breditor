import assert from "node:assert/strict";
import {parseSync} from "rolldown/utils";

function children(node) {
  return Object.values(node).flatMap(value => Array.isArray(value)
    ? value.filter(item => item?.type) : value?.type ? [value] : []);
}
const isFunction = node => ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(node.type);

/** Capture initialized lexical bindings, never properties or module globals.
 * Later declarations still shadow outer bindings: omit them to avoid TDZ reads.
 */
function visibleBindings(ancestors, offset) {
  const bindings = new Map();
  const register = (declaration) => {
    assert.equal(declaration.id.type, "Identifier", "unsupported layout binding pattern");
    bindings.set(declaration.id.name,
      (declaration.init?.end ?? declaration.end) <= offset && !isFunction(declaration.init ?? {}));
  };
  for (const ancestor of ancestors) {
    if (isFunction(ancestor)) {
      for (const parameter of ancestor.params) {
        assert.equal(parameter.type, "Identifier", "unsupported layout parameter");
        bindings.set(parameter.name, true);
      }
    }
    if (ancestor.type === "BlockStatement") {
      for (const statement of ancestor.body) if (statement.type === "VariableDeclaration") {
        assert.ok(["let", "const"].includes(statement.kind), "unsupported layout var binding");
        statement.declarations.forEach(register);
      }
    }
    if (ancestor.type === "ForStatement" && ancestor.init?.type === "VariableDeclaration") {
      ancestor.init.declarations.forEach(register);
    }
  }
  const names = [...bindings].filter(([, ready]) => ready).map(([name]) => name);
  assert.ok(names.length <= 32 && names.every(name => /^[A-Za-z_$][\w$]*$/u.test(name)), "unexpected layout binding names");
  return names;
}

/** Patch only failing literal returns in an already-minified owned bundle.
 * No rebuild/remangling, generated getter reads, validation retries or fallback.
 * The original literals and every byte outside the selected function survive.
 */
export function traceRetainedNestedLayout(code) {
  const helper = "breditorRetainedNestedLayoutFailure";
  assert.ok(!code.includes(helper), "retained layout already traced");
  const parsed = parseSync("retained-nested-list.js", code);
  assert.deepEqual(parsed.errors, [], "retained bundle parse failed");
  const candidates = [];
  function find(node) {
    if (node.type === "FunctionDeclaration" && node.params.length === 4 && node.body) {
      const text = code.slice(node.body.start, node.body.end);
      if (text.includes("breditor/bullet-list") && text.includes("breditor/list-item") && /\b64\b/u.test(text)) candidates.push(node);
    }
    children(node).forEach(find);
  }
  find(parsed.program);
  assert.equal(candidates.length, 1, "retained nested layout is missing or ambiguous");
  const layout = candidates[0];
  assert.ok(!layout.async && !layout.generator, "asynchronous layout is unsupported");
  const patches = [], sites = [];
  function failingLiterals(expression, callback) {
    if (!expression) return;
    if (expression.type === "Literal" && [null, false, 0].includes(expression.value)) callback(expression);
    else if (expression.type === "UnaryExpression" && expression.operator === "!" && expression.argument.type === "Literal" && expression.argument.value === 1) callback(expression);
    else if (expression.type === "ConditionalExpression") {
      failingLiterals(expression.consequent, callback);
      failingLiterals(expression.alternate, callback);
    } else if (expression.type === "SequenceExpression") failingLiterals(expression.expressions.at(-1), callback);
    else if (expression.type === "ParenthesizedExpression") failingLiterals(expression.expression, callback);
  }
  function visit(node, ancestors) {
    const chain = [...ancestors, node];
    if (node.type === "ReturnStatement") failingLiterals(node.argument, literal => {
      const names = visibleBindings(chain, literal.start);
      const original = code.slice(literal.start, literal.end);
      const stage = `${layout.id.name}:${literal.start - layout.start}`;
      const fields = names.map(name => `[${JSON.stringify(name)}]:${name}`).join(",");
      patches.push({start: literal.start, end: literal.end, original,
        replacement: `(${helper}(${JSON.stringify(stage)},{${fields}}),${original})`});
      sites.push({stage, offset: literal.start - layout.start, names, original});
    });
    children(node).forEach(child => visit(child, chain));
  }
  visit(layout, []);
  assert.ok(sites.length >= 3 && sites.length <= 32, "unexpected retained layout rejection count");
  patches.push({start: layout.body.start + 1, end: layout.body.start + 1, original: "", replacement: `
const ${helper}=(stage,bindings)=>{try{console.error("breditor retained layout rejection",JSON.stringify({stage,bindings:Object.fromEntries(Object.entries(bindings).map(([name,value])=>[name,{type:typeof value,value:typeof value==="string"?value.slice(0,256):value===null||typeof value==="number"||typeof value==="boolean"?value:undefined,spelling:typeof value==="number"?String(value):undefined}]))}).slice(0,4096))}catch{}};
`});
  const ordered = patches.sort((a, b) => a.start - b.start);
  for (let index = 1; index < ordered.length; index++) assert.ok(ordered[index - 1].end <= ordered[index].start, "overlapping retained patches");
  let transformed = code;
  for (const patch of [...ordered].reverse()) transformed = transformed.slice(0, patch.start) + patch.replacement + transformed.slice(patch.end);
  assert.deepEqual(parseSync("traced-nested-list.js", transformed).errors, [], "traced bundle parse failed");
  return {code: transformed, patches: ordered, sites,
    layout: {name: layout.id.name, start: layout.start, end: layout.end, parameters: layout.params.map(parameter => parameter.name)}};
}
