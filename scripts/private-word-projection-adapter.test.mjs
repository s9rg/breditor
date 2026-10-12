import assert from "node:assert/strict";
import test from "node:test";
import {installPrivateWordProjectionAdapter} from "./private-word-projection-adapter.mjs";
const fields=['childCount','childAt','formatCount','formatPropertyCount','headingLevel','orderedListStart'];
function fixture(){class View{};const calls=[];for(const name of fields){Object.defineProperty(View.prototype,name,{value:function(){return 'legacy';},configurable:true,writable:true});Object.defineProperty(View.prototype,name+'Words',{value:function(...args){calls.push({name,receiver:this,args});return new Uint32Array([1,0]);},configurable:true});}return {api:{BreditorProjection:View},view:new View(),calls};}
test("private adapter forwards once, retains scalar signatures/descriptors and restores",()=>{
  const f=fixture(),before=Object.getOwnPropertyDescriptors(f.api.BreditorProjection.prototype);
  const restore=installPrivateWordProjectionAdapter(f.api);
  for(const name of fields){const arity=['childAt','formatPropertyCount'].includes(name)?2:1;assert.equal(f.view[name].length,arity);assert.equal(f.view[name].name,name);assert.equal(f.view[name](81,2),0);assert.deepEqual(f.calls.at(-1),{name,receiver:f.view,args:arity===1?[81]:[81,2]});}
  assert.equal(f.calls.length,6);restore();assert.deepEqual(Object.getOwnPropertyDescriptors(f.api.BreditorProjection.prototype),before);assert.throws(restore);
});
test("private adapter preflight rejects accessors without mutation or invocation",()=>{
  const f=fixture();let touched=false;Object.defineProperty(f.api.BreditorProjection.prototype,'orderedListStartWords',{get(){touched=true;throw Error('unexpected');},configurable:true});
  const before=Object.getOwnPropertyDescriptors(f.api.BreditorProjection.prototype);assert.throws(()=>installPrivateWordProjectionAdapter(f.api),TypeError);assert.equal(touched,false);assert.deepEqual(Object.getOwnPropertyDescriptors(f.api.BreditorProjection.prototype),before);
});
test("malformed word records fail without calling the old getter or retrying",()=>{
  const f=fixture();let count=0;Object.defineProperty(f.api.BreditorProjection.prototype,'childCountWords',{value(){count++;return new Uint32Array([0,1]);},configurable:true});const restore=installPrivateWordProjectionAdapter(f.api);assert.throws(()=>f.view.childCount(1),TypeError);assert.equal(count,1);restore();
});
