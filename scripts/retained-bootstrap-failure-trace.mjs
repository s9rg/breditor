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
export function traceRetainedBootstrapFailures(code,{ownerFaults=false,smallRestoreChurn=false,checkpointExports=false,inputRoutes=false,checkpointReader=false,checkpointValidation=false,checkpointPredicates=false,checkpointCapture=false,checkpointContractCapture=false,ownerReasons=false}={}) {
  assert.equal(typeof ownerFaults,"boolean");
  assert.equal(typeof smallRestoreChurn,"boolean");
  assert.equal(typeof checkpointExports,"boolean");
  assert.equal(typeof inputRoutes,"boolean");
  assert.equal(typeof checkpointReader,"boolean");
  assert.equal(typeof checkpointValidation,"boolean");
  assert.equal(typeof checkpointPredicates,"boolean");
  assert.equal(typeof checkpointCapture,"boolean");
  assert.equal(typeof ownerReasons,"boolean");
  assert.ok(!checkpointCapture||checkpointReader,"checkpoint capture requires reader tracing");
  assert.equal(typeof checkpointContractCapture,"boolean");
  assert.ok(!checkpointContractCapture||checkpointCapture,"contract capture requires checkpoint capture");
  assert.ok(!checkpointPredicates||checkpointValidation,"checkpoint predicates require validation tracing");
  assert.ok(!checkpointValidation||checkpointReader,"checkpoint validation requires reader tracing");
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
  if(ownerReasons) {
    const candidates=[];
    function findOwner(node) {
      if(node.type==="MethodDefinition"&&node.key.type==="PrivateIdentifier"&&node.value.params.length===1&&node.value.params[0].type==="Identifier") {
        const body=node.value.body.body,logical=body[0]?.expression;
        const sequence=logical?.right?.type==="ParenthesizedExpression"?logical.right.expression:logical?.right;
        const compact=logical?.type==="LogicalExpression"&&logical.operator==="&&"&&
          logical.left?.type==="BinaryExpression"&&logical.left.operator==="==="&&
          logical.left.left?.property?.name==="phase"&&string(logical.left.right)==="live"&&sequence?.type==="SequenceExpression";
        const guarded=body[0]?.type==="IfStatement"&&body[0].test?.type==="BinaryExpression"&&body[0].test.operator==="!=="&&
          body[0].test.left?.property?.name==="phase"&&string(body[0].test.right)==="live";
        const assignment=compact?sequence.expressions[0]:body[1]?.expression;
        const record=assignment?.right?.arguments?.[0];
        if((compact||guarded)&&assignment?.type==="AssignmentExpression"&&
          assignment.right?.callee?.object?.name==="Object"&&assignment.right.callee.property?.name==="freeze"&&
          assignment.left?.property?.type==="PrivateIdentifier"&&record?.type==="ObjectExpression"&&
          record.properties.some(p=>p.key?.name==="phase"&&string(p.value)==="faulted")&&
          record.properties.some(p=>p.key?.name==="reason"&&p.value?.name===node.value.params[0].name))candidates.push({node,compact,assignment});
      }
      children(node).forEach(findOwner);
    }
    findOwner(parsed.program);assert.equal(candidates.length,1,"owner fault reason boundary missing or ambiguous");
    const {node,compact,assignment}=candidates[0],offset=node.value.body.body[0].end,reason=node.value.params[0].name;
    const stage=`owner-reason:${node.start}`;
    const log=`${helper}(${JSON.stringify(stage)},"owner-terminal",{reason:${reason}})`;
    if(compact) {
      const original=code.slice(assignment.start,assignment.end);
      edits.push({start:assignment.start,end:assignment.end,original,replacement:`(${log},${original})`});
    } else edits.push({start:offset,end:offset,original:"",replacement:`;${log};`});
    sites.push({stage,start:compact?assignment.start:offset,end:compact?assignment.end:offset,code:"owner-terminal",names:[reason]});
  }
  if(checkpointValidation) {
    const has=(node,predicate)=>predicate(node)||children(node).some(child=>has(child,predicate));
    const readers=parsed.program.body.filter(node=>node.type==="FunctionDeclaration"&&node.params.length===5&&
      has(node.body,n=>n.type==="MemberExpression"&&n.property?.name==="takeValue")&&
      has(node.body,n=>n.type==="Property"&&n.key?.name==="checkpointJson"));
    assert.equal(readers.length,1,"checkpoint validation reader missing");
    const raw=[],calls=[];
    function collect(node) {
      if(node.type==="VariableDeclarator"&&node.init?.callee?.object?.name==="Reflect"&&node.init.callee.property?.name==="apply")raw.push(node.id.name);
      if(node.type==="VariableDeclarator"&&node.init?.type==="CallExpression"&&node.init.callee.type==="Identifier"&&node.init.arguments.length===3)calls.push(node.init);
      children(node).forEach(collect);
    }
    collect(readers[0].body);assert.equal(raw.length,1);
    const selected=calls.filter(call=>call.arguments[0]?.name===raw[0]);assert.equal(selected.length,1,"checkpoint byte validator changed");
    const functions=parsed.program.body.filter(n=>n.type==="FunctionDeclaration");
    const validator=functions.find(n=>n.id.name===selected[0].callee.name);assert.equal(validator?.params.length,3);
    const envelopeCall=validator.body.body[0]?.declarations?.[0]?.init;
    assert.equal(envelopeCall?.callee?.type,"Identifier");assert.equal(envelopeCall.arguments.length,2);
    const envelope=functions.find(n=>n.id.name===envelopeCall.callee.name);assert.equal(envelope?.params.length,2);
    if(checkpointPredicates) {
      const flatten=node=>node.type==="LogicalExpression"&&node.operator==="||"?[...flatten(node.left),...flatten(node.right)]:[node];
      const guards=[];
      function findGuard(node) {
        if(node.type==="IfStatement") {
          const terms=flatten(node.test);
          if(terms.length===3&&terms.every(t=>t.type==="UnaryExpression"&&t.operator==="!"&&
            t.argument.type==="CallExpression"&&t.argument.callee.type==="Identifier"&&t.argument.arguments.length===3)&&
            terms[0].argument.arguments[0]?.property?.name==="document"&&
            terms.every(t=>t.argument.arguments[2]?.type==="Identifier"&&t.argument.arguments[2].name===terms[0].argument.arguments[2].name))guards.push(terms);
        }
        children(node).forEach(findGuard);
      }
      findGuard(envelope.body);assert.equal(guards.length,1,"checkpoint predicate group missing or ambiguous");
      for(const [index,term] of guards[0].entries()) {
        const node=term.argument,kind=["checkpoint-property-accounting","checkpoint-base-state","checkpoint-history"][index];
        const original=code.slice(node.start,node.end),stage=`${kind}:${node.start}`;
        edits.push({start:node.start,end:node.end,original,replacement:`${helper}Predicate(${JSON.stringify(stage)},${original})`});
        sites.push({stage,start:node.start,end:node.end,code:kind});
      }
    }
    for(const [fn,kind] of [[validator,"checkpoint-correlation"],[envelope,"checkpoint-envelope"]]) {
      let count=0;
      function traceNull(node,ancestors=[]) {
        const parent=ancestors.at(-1);
        if(node.type==="Literal"&&node.value===null&&
          (parent?.type==="ReturnStatement"&&parent.argument===node||parent?.type==="ConditionalExpression"&&
            (parent.consequent===node||parent.alternate===node)&&ancestors.some(a=>a.type==="ReturnStatement"))) {
          const names=initializedBindings([fn,...ancestors],node.start),stage=`${kind}:${node.start}`;
          const fields=names.map(name=>`${JSON.stringify(name)}:typeof ${name}==="string"?{diagnosticStringType:"string",diagnosticStringLength:${name}.length}:${name}`).join(",");
          edits.push({start:node.start,end:node.end,original:"null",replacement:`(${helper}(${JSON.stringify(stage)},${JSON.stringify(kind)},{${fields}}),null)`});
          sites.push({stage,start:node.start,end:node.end,code:kind,names,stringsRedacted:true});count++;
        }
        children(node).forEach(child=>traceNull(child,[...ancestors,node]));
      }
      traceNull(fn.body);assert.ok(count>=3&&count<=32,"checkpoint null exits changed");
    }
  }
  if(checkpointReader) {
    const readerSiteStart=sites.length;
    const has=(node,predicate)=>predicate(node)||children(node).some(child=>has(child,predicate));
    const readers=parsed.program.body.filter(node=>node.type==="FunctionDeclaration"&&node.params.length===5&&
      has(node.body,n=>n.type==="MemberExpression"&&n.property?.name==="takeValue")&&
      has(node.body,n=>n.type==="Property"&&n.key?.name==="checkpointJson"));
    assert.equal(readers.length,1,"checkpoint reader missing or ambiguous");
    const reader=readers[0],failureNames=new Set(),rawNames=[];
    function inspect(node,ancestors=[]) {
      if(node.type==="CallExpression"&&node.callee?.type==="Identifier"&&node.arguments.length===0&&
        ancestors.some(a=>a.type==="ReturnStatement"))failureNames.add(node.callee.name);
      if(node.type==="VariableDeclarator"&&node.id.type==="Identifier"&&node.init?.type==="CallExpression"&&
        node.init.callee?.object?.name==="Reflect"&&node.init.callee.property?.name==="apply")rawNames.push(node.id.name);
      children(node).forEach(child=>inspect(child,[...ancestors,node]));
    }
    inspect(reader.body);assert.equal(failureNames.size,1,"checkpoint boundary helper changed");
    assert.equal(rawNames.length,1,"checkpoint string take changed");
    const failure=[...failureNames][0],definition=parsed.program.body.filter(n=>n.type==="FunctionDeclaration"&&n.id?.name===failure);
    assert.equal(definition.length,1);assert.equal(definition[0].params.length,0);
    const returned=definition[0].body.body;
    assert.equal(returned.length,1);assert.equal(returned[0].type,"ReturnStatement");
    const frozen=returned[0].argument?.arguments?.[0];
    assert.equal(frozen?.callee?.object?.name,"Object");assert.equal(frozen?.callee?.property?.name,"freeze");
    const error=frozen.arguments?.[0]?.properties?.find(p=>p.key?.name==="error")?.value;
    assert.equal(error?.type,"Identifier");
    const labels=parsed.program.body.filter(n=>n.type==="VariableDeclaration").flatMap(n=>n.declarations)
      .filter(d=>d.id.name===error.name&&d.init?.arguments?.[0]?.properties?.some(p=>p.key?.name==="code"&&string(p.value)==="session_checkpoint.invalid_wasm_view"));
    assert.equal(labels.length,1,"checkpoint boundary error binding missing");
    function traceReader(node,ancestors=[]) {
      if(node.type==="CallExpression"&&node.callee?.name===failure&&node.arguments.length===0&&
        !shadowed(failure,ancestors)&&ancestors.some(a=>a.type==="ReturnStatement"||a.type==="CatchClause")) {
        const names=initializedBindings(ancestors,node.start),inside=ancestors.includes(reader),raw=rawNames[0];
        const fields=names.filter(name=>!inside||name!==raw).map(name=>`${JSON.stringify(name)}:${name}`);
        if(inside&&names.includes(raw))fields.push(`rawValueType:typeof ${raw},rawValueUtf16Length:typeof ${raw}==="string"?${raw}.length:null`);
        const original=code.slice(node.start,node.end),stage=`checkpoint-read:${node.start}`;
        const capture=checkpointCapture&&inside&&names.includes(raw)
          ?`${helper}Capture(${JSON.stringify(stage)},${raw},${reader.params[0].name}${checkpointContractCapture?`,${reader.params[4].name}`:""}),`:"";
        edits.push({start:node.start,end:node.end,original,replacement:`(${capture}${helper}(${JSON.stringify(stage)},"checkpoint-read-rejection",{${fields.join(",")}}),${original})`});
        sites.push({stage,start:node.start,end:node.end,code:"checkpoint-read-rejection",names,redactedRawValue:inside&&names.includes(raw)});
      }
      children(node).forEach(child=>traceReader(child,[...ancestors,node]));
    }
    traceReader(parsed.program);assert.ok(sites.length-readerSiteStart>=8&&sites.length-readerSiteStart<=32,"checkpoint rejection sites changed");
  }
  if(inputRoutes) {
    const candidates=[];
    function callsWithin(node,found=[]) {
      if(node.type==="CallExpression"&&node.callee?.type==="MemberExpression"&&node.callee.property?.name==="handleBeforeInput")found.push(node);
      children(node).forEach(child=>callsWithin(child,found));return found;
    }
    function findRoutes(node) {
      if(node.type==="MethodDefinition"&&node.key.type==="PrivateIdentifier"&&callsWithin(node.value.body).length===3)candidates.push(node);
      children(node).forEach(findRoutes);
    }
    findRoutes(parsed.program);assert.equal(candidates.length,1,"beforeinput route missing or ambiguous");
    const fn=candidates[0],calls=callsWithin(fn.value.body),bases=[];
    function findBase(node) {
      if(node.type==="VariableDeclarator"&&node.init?.type==="CallExpression"&&node.init.arguments.length===0&&
        node.init.callee?.type==="MemberExpression"&&node.init.callee.object?.type==="ThisExpression"&&
        node.init.callee.property?.type==="PrivateIdentifier")bases.push(node.init);
      children(node).forEach(findBase);
    }
    findBase(fn.value.body);assert.equal(bases.length,1,"beforeinput delivery base missing or ambiguous");
    for(const [index,node] of [...calls,...bases].entries()) {
      if(index<3)assert.equal(node.arguments.length,index===2?3:1,"beforeinput call shape changed");
      const kind=["beforeinput-composition","beforeinput-clipboard","beforeinput-ordinary","beforeinput-base"][index];
      const original=code.slice(node.start,node.end),stage=`${kind}:${node.start}`;
      edits.push({start:node.start,end:node.end,original,replacement:`${helper}Input(${JSON.stringify(stage)},${original})`});
      sites.push({stage,start:node.start,end:node.end,code:kind});
    }
  }
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
  let prefix=ownerFaults||checkpointExports||inputRoutes||checkpointReader||ownerReasons?`function ${helper}(stage,code,bindings){try{
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
  if(checkpointReader)prefix=prefix.replace('"actionState","projection"','"actionState","projection","invalid","mode"');
  if(checkpointValidation)prefix=prefix.replace('"actionState","projection"','"actionState","projection","diagnosticStringType","diagnosticStringLength","format","formatVersion","currentRevision","schema","schemaFingerprint","name","version","historyBase","envelope","cursor","historyCapacity","entries","length","propertyValues","propertyStringUtf8Bytes"');
  if(inputRoutes) {
    prefix=prefix.replace('"status","kind","operation"','"defaultPrevented","inputType","outcome","status","kind","operation"');
    prefix+=`function ${helper}Input(stage,value){${helper}(stage,"beforeinput-result",{result:value});return value;}\n`;
  }
  if(checkpointPredicates)prefix+=`function ${helper}Predicate(stage,value){if(!value)${helper}(stage,"checkpoint-predicate-rejection",{result:value});return value;}\n`;
  if(checkpointContractCapture)prefix+=`function ${helper}Contract(value){let nodes=0,strings=0;const seen=new Set();function copy(v,depth){
    if(++nodes>2048||depth>12)throw Error();
    if(v===null||typeof v==="boolean")return v;
    if(typeof v==="number"&&Number.isSafeInteger(v))return v;
    if(typeof v==="string"){strings+=v.length;if(strings>65536)throw Error();return v;}
    if(typeof v!=="object"||seen.has(v))throw Error();seen.add(v);
    const array=Array.isArray(v),proto=Object.getPrototypeOf(v);if(!array&&proto!==Object.prototype&&proto!==null)throw Error();
    const result=array?[]:Object.create(null),keys=Object.keys(v);if(keys.length>2048)throw Error();
    for(const key of keys){strings+=key.length;if(strings>65536||key==="__wbg_ptr")throw Error();const d=Object.getOwnPropertyDescriptor(v,key);if(!d||!("value" in d))throw Error();Object.defineProperty(result,key,{enumerable:true,value:copy(d.value,depth+1)});}
    return Object.freeze(result);
  }try{return copy(value,0);}catch{return undefined;}}\n`;
  if(checkpointCapture)prefix+=`function ${helper}Capture(stage,value,expected${checkpointContractCapture?",contract":""}){try{
    if(typeof value!=="string"||value.length===0||value.length>16777216||Object.getOwnPropertyDescriptor(globalThis,"__breditorRejectedCheckpointInput"))return;
    const lineage=Object.getOwnPropertyDescriptor(expected,"lineage"),revision=Object.getOwnPropertyDescriptor(expected,"revision");
    if(!lineage||!("value" in lineage)||typeof lineage.value!=="string"||!revision||!("value" in revision)||typeof revision.value!=="string")return;
    Object.defineProperty(globalThis,"__breditorRejectedCheckpointInput",{configurable:true,value:Object.freeze({format:"breditor/rejected-checkpoint-input",formatVersion:1,stage,checkpointJson:value,snapshot:Object.freeze({lineage:lineage.value,revision:revision.value})${checkpointContractCapture?`,contract:${helper}Contract(contract)`:""}})});
  }catch{}}\n`;
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
