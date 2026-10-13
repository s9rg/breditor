// Trace cold bootstrap error exits in exact retained bytes; no rebuild/remangle.
import assert from "node:assert/strict";
import {parseSync} from "rolldown/utils";

const helper="breditorRetainedBootstrapFailure";
const children=node=>Object.values(node).flatMap(value=>Array.isArray(value)
  ?value.filter(item=>item?.type):value?.type?[value]:[]);
const functions=new Set(["FunctionDeclaration","FunctionExpression","ArrowFunctionExpression"]);
const string=node=>node?.type==="Literal"&&typeof node.value==="string"?node.value
  :node?.type==="TemplateLiteral"&&node.expressions.length===0?node.quasis[0].value.cooked:undefined;
function boundNames(pattern) {
  if(!pattern)return [];
  if(pattern.type==="Identifier")return [pattern.name];
  if(pattern.type==="RestElement")return boundNames(pattern.argument);
  if(pattern.type==="AssignmentPattern")return boundNames(pattern.left);
  if(pattern.type==="ArrayPattern")return pattern.elements.flatMap(boundNames);
  if(pattern.type==="ObjectPattern")return pattern.properties.flatMap(p=>boundNames(p.value??p.argument));
  return [];
}
function shadowed(name,ancestors) {
  for(const node of ancestors) {
    if(functions.has(node.type)) {
      if(node.params.flatMap(boundNames).includes(name)||node.id?.name===name)return true;
      let found=false;
      function vars(part) {
        if(part!==node&&functions.has(part.type))return;
        if(part.type==="VariableDeclaration"&&part.kind==="var"&&
          part.declarations.flatMap(d=>boundNames(d.id)).includes(name))found=true;
        children(part).forEach(vars);
      }
      vars(node.body);if(found)return true;
    }
    if(node.type==="CatchClause"&&boundNames(node.param).includes(name))return true;
    if(node.type==="BlockStatement"&&node.body.some(s=>
      s.type==="VariableDeclaration"&&s.declarations.flatMap(d=>boundNames(d.id)).includes(name)
      ||["FunctionDeclaration","ClassDeclaration"].includes(s.type)&&s.id?.name===name))return true;
    if(["ForStatement","ForOfStatement","ForInStatement"].includes(node.type)) {
      const declaration=node.init??node.left;
      if(declaration?.type==="VariableDeclaration"&&declaration.declarations.flatMap(d=>boundNames(d.id)).includes(name))return true;
    }
  }
  return false;
}

/** Patch only evaluated Object.freeze error expressions whose error constant
 * has a proven unshadowed module binding. No generated reads or retries.
 * Conditional/inline branches retain evaluation order and returned identity.
 */
export function traceRetainedBootstrapFailures(code) {
  assert.ok(!code.includes(helper),"retained bootstrap already traced");
  const parsed=parseSync("retained-bootstrap.js",code);assert.deepEqual(parsed.errors,[]);
  const roots=new Set(parsed.program.body.filter(n=>n.type==="VariableDeclaration")
    .flatMap(n=>n.declarations.flatMap(d=>boundNames(d.id))));
  const aliases=new Map();
  function alias(node) {
    const id=node.type==="VariableDeclarator"?node.id:node.type==="AssignmentExpression"?node.left:undefined;
    const init=node.init??node.right;
    if(id?.type==="Identifier"&&init?.type==="CallExpression") {
      const labels=init.arguments.map(string).filter(v=>v?.startsWith("engine_bootstrap."));
      if(labels.length) {
        assert.equal(labels.length,1,"ambiguous bootstrap error initializer");
        assert.ok(roots.has(id.name),"bootstrap error binding is not module-scoped");
        assert.ok(!aliases.has(id.name),"duplicate bootstrap error initializer");
        aliases.set(id.name,labels[0]);
      }
    }
    children(node).forEach(alias);
  }
  alias(parsed.program);assert.ok(aliases.size>=2&&aliases.size<=16,"bootstrap constants missing");
  const writes=new Map([...aliases.keys()].map(name=>[name,0]));
  function countWrites(node,ancestors) {
    const targets=node.type==="VariableDeclarator"&&node.init?boundNames(node.id)
      :node.type==="AssignmentExpression"?boundNames(node.left)
      :node.type==="UpdateExpression"?boundNames(node.argument):[];
    for(const name of targets)if(writes.has(name)&&!shadowed(name,ancestors))writes.set(name,writes.get(name)+1);
    children(node).forEach(child=>countWrites(child,[...ancestors,node]));
  }
  countWrites(parsed.program,[]);
  assert.ok([...writes.values()].every(count=>count===1),"bootstrap error binding is reassigned");
  const edits=[],sites=[];
  function visit(node,ancestors) {
    const chain=[...ancestors,node];
    if(node.type==="CallExpression"&&node.callee?.type==="MemberExpression"&&
      node.callee.object?.name==="Object"&&node.callee.property?.name==="freeze"&&node.arguments.length===1) {
      const object=node.arguments[0];
      if(object.type==="ObjectExpression"&&object.properties.length===2) {
        const props=new Map(object.properties.map(p=>[p.key?.name??p.key?.value,p.value]));
        const ok=props.get("ok"),error=props.get("error");
        const falseValue=ok?.type==="Literal"&&ok.value===false||ok?.type==="UnaryExpression"&&ok.operator==="!"&&ok.argument?.value===1;
        if(falseValue&&error?.type==="Identifier"&&aliases.has(error.name)&&!shadowed(error.name,ancestors)) {
          const original=code.slice(node.start,node.end),stage=`bootstrap:${node.start}`;
          const replacement=`(${helper}(${JSON.stringify(stage)},${JSON.stringify(aliases.get(error.name))}),${original})`;
          edits.push({start:node.start,end:node.end,original,replacement});
          sites.push({stage,start:node.start,end:node.end,code:aliases.get(error.name)});
        }
      }
    }
    children(node).forEach(child=>visit(child,chain));
  }
  visit(parsed.program,[]);assert.ok(sites.length>=2&&sites.length<=128,"bootstrap exits missing or unexpected");
  const prefix=`function ${helper}(stage,code){try{console.error("breditor retained bootstrap rejection",JSON.stringify({stage,code}))}catch{}}\n`;
  edits.push({start:0,end:0,original:"",replacement:prefix});
  edits.sort((a,b)=>b.start-a.start);
  let traced=code;
  for(const edit of edits) {
    assert.equal(traced.slice(edit.start,edit.end),edit.original);
    traced=traced.slice(0,edit.start)+edit.replacement+traced.slice(edit.end);
  }
  assert.deepEqual(parseSync("traced-bootstrap.js",traced).errors,[]);
  return {code:traced,sites,edits};
}
