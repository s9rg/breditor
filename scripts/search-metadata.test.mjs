import test from "node:test";
import assert from "node:assert/strict";
import {parseRichSearchMetadata} from "../packages/breditor-experimental-rich-content/rendering.js";
import {SharedSearchResults,nativeSearchResults} from "../packages/breditor-collaboration/dist/search_results.js";
const metadata=()=>({format:"breditor/rich-search-results",formatVersion:1,schema:{name:"example/search",version:1,fingerprint:`sha256:${"a".repeat(64)}`},document:"room",count:"1",captureCount:"1",matches:[{block:"body",start:"5",end:"8"}]});
test("native search metadata retains its canonical prefixed fingerprint and freezes every read layer",()=>{
 const value=metadata(),read=parseRichSearchMetadata(JSON.stringify(value));assert.deepEqual(read,value);
 for(const part of [read,read.schema,read.matches,read.matches[0]])assert.equal(Object.isFrozen(part),true);
 assert.throws(()=>{read.matches[0].start="0";},TypeError);
});
test("search metadata rejects missing/unknown fields, bad bindings, partial reads and noncanonical coordinates",()=>{
 for(const patch of [{formatVersion:2},{query:"private"},{schema:{...metadata().schema,fingerprint:"a".repeat(64)}},{schema:{...metadata().schema,version:"1"}},{count:"01"},{count:"4097"},{count:"2"},{captureCount:"0"},{captureCount:"66"},{matches:[{block:"body",start:5,end:"8"}]},{matches:[{block:"body",start:"05",end:"8"}]},{matches:[{block:"body",start:"9",end:"8"}]},{matches:[{block:"body",start:"0",end:"9007199254740992"}]}])assert.throws(()=>parseRichSearchMetadata(JSON.stringify({...metadata(),...patch})),/Invalid native search metadata/);
 const missing=metadata();delete missing.count;assert.throws(()=>parseRichSearchMetadata(JSON.stringify(missing)));
 for(const input of ["{private-query",null," ".repeat(4*1024*1024+1)])assert.throws(()=>parseRichSearchMetadata(input),/Invalid native search metadata/);
});
test("complete metadata admits the maximum count and exact safe-coordinate boundary without coercion",()=>{
 const value=metadata();value.count="4096";value.matches=Array.from({length:4096},()=>({block:"body",start:"9007199254740991",end:"9007199254740991"}));const read=parseRichSearchMetadata(JSON.stringify(value));assert.equal(read.matches.length,4096);assert.equal(read.matches[4095].end,"9007199254740991");
});
test("opaque search SDK reads release exactly once, preserve frozen metadata and reject clones/foreign owners",()=>{
 const owner={},other={};let frees=0,closed=0;const raw={metadata_json:()=>JSON.stringify(metadata()),navigate:input=>{assert.deepEqual(JSON.parse(input),{active:null,direction:"next",wrap:true});return "0";},free:()=>frees++};
 const result=new SharedSearchResults(owner,raw,()=>closed++);assert.equal(result.navigate(null,"next",true),"0");assert.equal(nativeSearchResults(owner,result),raw);assert.throws(()=>nativeSearchResults(other,result));assert.throws(()=>nativeSearchResults(owner,{...result}));const saved=result.metadata();result.dispose();result.dispose();assert.equal(result.metadata(),saved);assert.equal(frees,1);assert.equal(closed,1);assert.throws(()=>result.navigate(null,"next",true));assert.throws(()=>nativeSearchResults(owner,result));
});
test("malformed native search reads free their acquired resource before publication",()=>{
 let frees=0;assert.throws(()=>new SharedSearchResults({}, {metadata_json:()=>"{private",navigate:()=>undefined,free:()=>frees++},()=>assert.fail("not registered")),/Invalid native search metadata/);assert.equal(frees,1);
});
