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
export function traceRetainedBootstrapFailures(code,{ownerFaults=false,smallRestoreChurn=false,checkpointExports=false}={}) {
  assert.equal(typeof ownerFaults,"boolean");
  assert.equal(typeof smallRestoreChurn,"boolean");
  assert.equal(typeof checkpointExports,"boolean");
  assert.ok(!smallRestoreChurn||ownerFaults,"small churn requires owner fault tracing");
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
  if(checkpointExports) {
    const candidates=[];
    const hasMember=(node,name)=>node.type==="MemberExpression"&&node.property?.name===name
      ||children(node).some(child=>hasMember(child,name));
    function findCheckpoint(node) {
      if(node.type==="FunctionDeclaration"&&node.params.length===3&&node.params.every(p=>p.type==="Identifier")&&
        hasMember(node.body,"checkpoint")&&hasMember(node.body,"checkpointJson"))candidates.push(node);
      children(node).forEach(findCheckpoint);
    }
    findCheckpoint(parsed.program);assert.equal(candidates.length,1,"checkpoint export boundary missing or ambiguous");
    const fn=candidates[0],params=fn.params.map(p=>p.name),rejections=[];
    function findRejections(node,ancestors) {
      if(node!==fn&&functions.has(node.type))return;
      if(node.type==="ReturnStatement"&&node.argument?.type==="CallExpression")
        rejections.push({node:node.argument,kind:"checkpoint-reader",ancestors});
      if(node.type==="ReturnStatement"&&node.argument?.type==="ConditionalExpression"&&
        node.argument.consequent?.type==="CallExpression"&&node.argument.alternate?.type==="CallExpression"&&
        hasMember(node.argument.alternate,"checkpointJson"))
        rejections.push({node:node.argument.consequent,kind:"checkpoint-snapshot",ancestors});
      children(node).forEach(child=>findRejections(child,[...ancestors,node]));
    }
    findRejections(fn,[fn]);
    assert.deepEqual(rejections.map(r=>r.kind),["checkpoint-reader","checkpoint-snapshot"],"checkpoint rejection shape changed");
    for(const {node,kind,ancestors} of rejections) {
      const names=initializedBindings(ancestors,node.start);
      assert.ok(params.every(name=>names.includes(name)));
      const original=code.slice(node.start,node.end),stage=`${kind}:${node.start}`;
      const fields=names.map(name=>`${JSON.stringify(name)}:${name}`).join(",");
      edits.push({start:node.start,end:node.end,original,
        replacement:`(${helper}(${JSON.stringify(stage)},${JSON.stringify(kind)},{${fields}}),${original})`});
      sites.push({stage,start:node.start,end:node.end,code:kind,names});
    }
  }
  let diagnosticWorkload;
  if(smallRestoreChurn) {
    const loops=[];
    function findLoop(node) {
      if(node.type==="ForOfStatement"&&node.right?.type==="ArrayExpression"&&
        JSON.stringify(node.right.elements.map(n=>n?.value))==="[10,100,500]")loops.push(node);
      children(node).forEach(findLoop);
    }
    findLoop(parsed.program);assert.equal(loops.length,1,"performance size loop missing or ambiguous");
    const loop=loops[0],ownerLoops=[];
    function findOwners(node) {
      if(node.type==="ForStatement"&&node.test?.type==="BinaryExpression"&&node.test.operator==="<"&&
        node.test.right?.type==="Literal"&&node.test.right.value===30)ownerLoops.push(node);
      children(node).forEach(findOwners);
    }
    findOwners(loop.body);assert.equal(ownerLoops.length,1,"performance owner loop changed");
    for(const [node,replacement] of [[loop.right,"[10]"],[ownerLoops[0].test.right,"300"]])
      edits.push({start:node.start,end:node.end,original:code.slice(node.start,node.end),replacement});
    diagnosticWorkload={variant:"small-restore-churn",sizes:[10],owners:300,expectedCases:300,warmupPreserved:true};
  }
  function initializedBindings(ancestors,offset) {
    const names=new Map();
    for(const scope of ancestors) {
      if(functions.has(scope.type))for(const parameter of scope.params)for(const name of boundNames(parameter))names.set(name,true);
      if(scope.type==="BlockStatement")for(const statement of scope.body)if(statement.type==="VariableDeclaration")
        for(const declaration of statement.declarations)for(const name of boundNames(declaration.id))
          names.set(name,!!declaration.init&&declaration.init.end<=offset);
    }
    const ready=[...names].filter(([,ready])=>ready).map(([name])=>name);
    assert.ok(ready.length<=32);return ready;
  }
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
    if(ownerFaults&&node.type==="CallExpression"&&node.callee?.type==="MemberExpression"&&
      node.callee.object?.type==="ThisExpression"&&node.callee.property?.type==="PrivateIdentifier"&&
      node.arguments.length===1&&string(node.arguments[0])==="toolbarDispatchFailed") {
      const original=code.slice(node.start,node.end),stage=`owner:${node.start}`;
      const names=initializedBindings(ancestors,node.start);
      const fields=names.map(name=>`${JSON.stringify(name)}:${name}`).join(",");
      edits.push({start:node.start,end:node.end,original,
        replacement:`(${helper}(${JSON.stringify(stage)},"toolbarDispatchFailed",{${fields}}),${original})`});
      sites.push({stage,start:node.start,end:node.end,code:"toolbarDispatchFailed",names});
    }
    children(node).forEach(child=>visit(child,chain));
  }
  visit(parsed.program,[]);assert.ok(sites.length>=2&&sites.length<=128,"bootstrap exits missing or unexpected");
  if(ownerFaults)assert.ok(sites.some(site=>site.code==="toolbarDispatchFailed"),"owner fault sites missing");
  let prefix=ownerFaults||checkpointExports?`function ${helper}(stage,code,bindings){try{
    const summarize=(value,depth=0)=>{
      const result={type:typeof value};
      if(value===null||typeof value==="boolean"||typeof value==="number")result.value=value;
      else if(typeof value==="string")result.value=value.slice(0,256);
      else if(typeof value==="object"&&depth<4){
        const fields={};
        for(const key of ["status","kind","operation","eventKind","phase","reason","code","ok","submission","result","command","actionState","projection"]){
          const descriptor=Object.getOwnPropertyDescriptor(value,key);
          if(descriptor&&"value" in descriptor)fields[key]=summarize(descriptor.value,depth+1);
        }
        result.fields=fields;
      }
      return result;
    };
    const values=bindings?Object.fromEntries(Object.entries(bindings).map(([name,value])=>[name,summarize(value)])):undefined;
    console.error("breditor retained owner/bootstrap rejection",JSON.stringify({stage,code,bindings:values}).slice(0,4096));
  }catch{}}\n`:`function ${helper}(stage,code){try{console.error("breditor retained bootstrap rejection",JSON.stringify({stage,code}))}catch{}}\n`;
  if(checkpointExports)prefix=prefix.replace('"actionState","projection"','"actionState","projection","error","checkpoint","snapshot","lineage","revision"');
  edits.push({start:0,end:0,original:"",replacement:prefix});
  edits.sort((a,b)=>b.start-a.start);
  let traced=code;
  for(const edit of edits) {
    assert.equal(traced.slice(edit.start,edit.end),edit.original);
    traced=traced.slice(0,edit.start)+edit.replacement+traced.slice(edit.end);
  }
  assert.deepEqual(parseSync("traced-bootstrap.js",traced).errors,[]);
  return {code:traced,sites,edits,diagnosticWorkload};
}
