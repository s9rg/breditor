// Private disposable-bundle diagnostics. Never inject into shipping artifacts.
import assert from "node:assert/strict";
import {parseSync} from "rolldown/utils";

/** Observe existing admission reads/guards and exact rejection sites.
 * No extra generated-property reads, getter retries or altered return values.
 * Identity is an opaque WeakMap ordinal, never a raw pointer or view dump.
 */
export function instrumentWordCapabilityAdmission(source) {
  assert.ok(!source.includes("__wordCapabilityTrace"), "duplicate capability diagnostic");
  const file=parseSync("word-facade.js",source);
  assert.equal(file.errors.length,0);
  const functions=file.program.body.map(node=>node.declaration??node)
    .filter(node=>node.type==="FunctionDeclaration"&&node.id?.name==="snapshotNestedProjectionWordFacade");
  assert.equal(functions.length,1,"word capability admission function changed");
  const fn=functions[0];
  assert.deepEqual(fn.params.map(p=>p.name),["raw","isThenable"]);
  let body=source.slice(fn.body.start+1,fn.body.end-1);
  const replace=(site,changed)=>{
    assert.equal(body.split(site).length,2,`word diagnostic site changed: ${site}`);
    body=body.replace(site,changed);
  };
  for(const [local,key,site] of [
    ["scalarVersion","scalar",'const scalarVersion = Reflect.get(raw, "projectionScalarWordsVersion", raw);'],
    ["integerVersion","integer",'const integerVersion = Reflect.get(raw, "projectionIntegerWordsVersion", raw);'],
    ["value","legacyMethod",'const value = Reflect.get(raw, name, raw);'],
    ["method","scalarMethod",'const method = Reflect.get(raw, name, raw);'],
    ["integerMethod","integerMethod",'const integerMethod = Reflect.get(raw, "formatPropertyIntegerWords", raw);'],
  ]) replace(site,`__wordCapabilityTrace.stage=${JSON.stringify(key+"-read")};
    ${site}
    __wordCapabilityTrace.${key}Kind=typeof ${local};
    if(typeof ${local}==="number") __wordCapabilityTrace.${key}Number=${local};
    ${key==="scalarMethod"||key==="legacyMethod"?`__wordCapabilityTrace.${key}Name=name;`:""}`);
  for(const local of ["scalarAsync","integerAsync"]) {
    const operand=local==="scalarAsync"?"scalarVersion":"integerVersion";
    const site=`const ${local} = isThenable(${operand});`;
    replace(site,`${site}\n    __wordCapabilityTrace.${local}Kind=typeof ${local};
      if(typeof ${local}==="boolean") __wordCapabilityTrace.${local}=${local};`);
  }
  for(const [local,tail] of [["value",' || value !== undefined'],
    ["method",' || typeof method !== "function"'],["integerMethod",""]]) {
    const site=`if (isThenable(${local})${tail})`;
    replace(site,`const __${local}Async=isThenable(${local});
      __wordCapabilityTrace.${local}AsyncKind=typeof __${local}Async;
      if(typeof __${local}Async==="boolean") __wordCapabilityTrace.${local}Async=__${local}Async;
      if (__${local}Async${tail})`);
  }
  let rejects=0,accepts=0;
  body=body.replaceAll("return null;",()=>`{__wordCapabilityReport("rejected",${++rejects});return null;}`);
  body=body.replaceAll("return Object.freeze(fields);",()=>{
    accepts++;return '__wordCapabilityReport("accepted",0);return Object.freeze(fields);';
  });
  assert.equal(rejects,8,"word rejection sites changed");
  assert.equal(accepts,2,"word acceptance sites changed");
  const setup=`
    const __wordCapabilityTrace={stage:"entry"};
    try {
      globalThis.__breditorWordCapabilitySequence=(globalThis.__breditorWordCapabilitySequence??0)+1;
      __wordCapabilityTrace.sequence=globalThis.__breditorWordCapabilitySequence;
      globalThis.__breditorWordCapabilityIdentities??=new WeakMap();
      let identity=globalThis.__breditorWordCapabilityIdentities.get(raw);
      if(identity===undefined){
        globalThis.__breditorWordCapabilityNextIdentity=(globalThis.__breditorWordCapabilityNextIdentity??0)+1;
        identity=globalThis.__breditorWordCapabilityNextIdentity;
        globalThis.__breditorWordCapabilityIdentities.set(raw,identity);
      }
      __wordCapabilityTrace.identity=identity;
      globalThis.__breditorLastWordCapability=__wordCapabilityTrace;
    } catch {}
    const __wordCapabilityReport=(outcome,reason)=>{
      __wordCapabilityTrace.outcome=outcome;__wordCapabilityTrace.reason=reason;
      try {globalThis.__breditorLastWordCapability=__wordCapabilityTrace;
        if(outcome!=="accepted")console.error("breditor word capability rejection",JSON.stringify(__wordCapabilityTrace).slice(0,2048));
      } catch {}
    };
    try {${body}} catch(error){__wordCapabilityReport("threw",__wordCapabilityTrace.stage);throw error;}
  `;
  const result=source.slice(0,fn.body.start+1)+setup+source.slice(fn.body.end-1);
  assert.equal(parseSync("diagnosed-word-facade.js",result).errors.length,0);
  return result;
}

/** Log the existing bootstrap invalid-view/projection exits, not input reads. */
export function instrumentBootstrapFailureSites(source) {
  assert.ok(!source.includes("breditor bootstrap rejection"),"duplicate bootstrap diagnostic");
  const file=parseSync("bootstrap.js",source);assert.equal(file.errors.length,0);
  const edits=[];
  const visit=node=>{
    if(!node||typeof node!=="object")return;
    if(node.type==="ReturnStatement") {
      const call=node.argument,callee=call?.callee,object=call?.arguments?.[0];
      if(call?.type==="CallExpression"&&callee?.type==="MemberExpression"&&
        callee.object?.name==="Object"&&callee.property?.name==="freeze"&&
        object?.type==="ObjectExpression"&&object.properties.length===2) {
        const properties=new Map(object.properties.map(p=>[p.key?.name??p.key?.value,p.value]));
        const ok=properties.get("ok"),error=properties.get("error");
        if(ok?.value===false&&error?.type==="Identifier"&&["INVALID_REQUEST","INVALID_MODULE","INVALID_VIEW","INVALID_GENERATION","INVALID_DESCRIPTOR","INVALID_PROJECTION"].includes(error.name)) {
          const line=source.slice(0,node.start).split("\n").length;
          const observed=`{try {console.error("breditor bootstrap rejection",JSON.stringify({line:${line},kind:${JSON.stringify(error.name)},wordCapability:globalThis.__breditorLastWordCapability??null}).slice(0,2048));} catch {}\n${source.slice(node.start,node.end)}}`;
          edits.push({start:node.start,end:node.end,observed});
        }
      }
    }
    for(const value of Object.values(node)) if(Array.isArray(value))value.forEach(visit);
      else if(value&&typeof value==="object")visit(value);
  };
  visit(file.program);assert.ok(edits.length>=2,"bootstrap rejection sites changed");
  let result=source;
  for(const edit of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,edit.start)+edit.observed+result.slice(edit.end);
  assert.equal(parseSync("diagnosed-bootstrap.js",result).errors.length,0);
  return result;
}
