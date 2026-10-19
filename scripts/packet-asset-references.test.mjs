import assert from "node:assert/strict";
import test from "node:test";
import {parseSharedPacketAssetReferences,SharedPacketAssetReferenceRegistry} from "../packages/breditor-collaboration/dist/packet_asset_references.js";
const digest=letter=>"sha256:"+letter.repeat(64),base=()=>({format:"breditor/shared-packet-asset-references",formatVersion:1,schema:{name:"example/assets",version:1,fingerprint:digest("a")},document:"room",revision:"18446744073709551615",packet:{kind:"suggestion",id:digest("b")},outcome:{kind:"ready",references:[{asset:"opaque",generation:"a"},{asset:"opaque",generation:"b"}]}}),parse=value=>parseSharedPacketAssetReferences(JSON.stringify(value));
const document=value=>JSON.stringify({schema:{name:value.schema.name,version:value.schema.version},schemaFingerprint:value.schema.fingerprint,root:{properties:{"breditor/document-id":value.document}}});
test("packet dependencies admit all exact packet identities, detached pairs and deeply frozen metadata",()=>{
 for(const packet of [{kind:"version",id:digest("b")},{kind:"suggestion",id:digest("b")},{kind:"suggestion_revision",id:digest("b"),previousSuggestionId:digest("c"),suggestionId:digest("d")}]){const value={...base(),packet},read=parse(value);for(const part of [read,read.schema,read.packet,read.outcome,read.outcome.references,...read.outcome.references])assert.ok(Object.isFrozen(part));value.outcome.references[0].asset="changed";assert.equal(read.outcome.references[0].asset,"opaque");assert.equal(read.revision,"18446744073709551615");}
});
test("packet parsing refuses unknown fields, malformed identities and scalar coercions without payload diagnostics",()=>{
 const mutations=[v=>v.extra="PRIVATE",v=>v.schema.extra=true,v=>v.packet.extra=true,v=>v.outcome.extra=true,v=>v.outcome.references[0].extra=true,v=>v.formatVersion=2,v=>v.document="bad/id",v=>v.revision="01",v=>v.revision="18446744073709551616",v=>v.revision=1,v=>v.schema.name="UPPER/schema",v=>v.schema.name="x/"+"x".repeat(128),v=>v.schema.version=0,v=>v.schema.version=4294967296,v=>v.schema.fingerprint="sha256:bad",v=>v.packet.id=digest("A"),v=>v.packet.kind="revision",v=>v.outcome.references[0].asset="日本",v=>v.outcome.references[0].generation="x".repeat(129),v=>v.outcome.references=null];
 for(const mutate of mutations){const value=base();mutate(value);assert.throws(()=>parse(value),e=>e instanceof TypeError&&e.message==="Invalid native packet asset references");}
 for(const input of ["PRIVATE-PAYLOAD",null,{}," ".repeat(8*1024*1024+1),JSON.stringify({...base(),private:"界".repeat(3*1024*1024)})])assert.throws(()=>parseSharedPacketAssetReferences(input),e=>!String(e).includes("PRIVATE-PAYLOAD"));
 for(const packet of [{kind:"suggestion_revision",id:digest("b"),previousSuggestionId:digest("c"),suggestionId:digest("c")},{kind:"suggestion_revision",id:digest("b"),previousSuggestionId:digest("c")},null])assert.throws(()=>parse({...base(),packet}));
});
test("ready packet pairs use complete sorted unique atomic generations, not prefixes",()=>{
 for(const references of [[{asset:"a",generation:"b"},{asset:"a",generation:"a"}],[{asset:"b",generation:"a"},{asset:"a",generation:"a"}],[{asset:"a",generation:"a"},{asset:"a",generation:"a"}]])assert.throws(()=>parse({...base(),outcome:{kind:"ready",references}}));
 assert.equal(parse({...base(),outcome:{kind:"ready",references:[]}}).outcome.references.length,0);
 const references=Array.from({length:100000},(_,n)=>({asset:`a${String(n).padStart(6,"0")}`,generation:"g"}));assert.equal(parse({...base(),outcome:{kind:"ready",references}}).outcome.references.length,100000);references.push({asset:"overflow",generation:"g"});assert.throws(()=>parse({...base(),outcome:{kind:"ready",references}}));
});
test("pending source dependencies stay explicit, frozen and numerically ordered; snapshots cannot be pending",()=>{
 const outcome={kind:"pending",missing:[{writer:"2",counter:"1"},{writer:"10",counter:"2147483647"},{writer:"18446744073709551614",counter:"3"}]},read=parse({...base(),outcome});assert.equal("references" in read.outcome,false);for(const part of [read.outcome,read.outcome.missing,...read.outcome.missing])assert.ok(Object.isFrozen(part));
 assert.throws(()=>parse({...base(),packet:{kind:"version",id:digest("b")},outcome}));
 for(const missing of [[],[{writer:"10",counter:"1"},{writer:"2",counter:"1"}],[{writer:"2",counter:"1"},{writer:"2",counter:"2"}],[{writer:"0",counter:"1"}],[{writer:"18446744073709551615",counter:"1"}],[{writer:"01",counter:"1"}],[{writer:"2",counter:"0"}],[{writer:"2",counter:"2147483648"}],[{writer:2,counter:"1"}],[{writer:"2",counter:"1",extra:true}],Array.from({length:1025},(_,n)=>({writer:String(n+1),counter:"1"}))])assert.throws(()=>parse({...base(),outcome:{kind:"pending",missing}}));
 assert.throws(()=>parse({...base(),outcome:{...outcome,references:[]}}));
 assert.equal(parse({...base(),outcome:{kind:"pending",missing:Array.from({length:1024},(_,n)=>({writer:String(n+1),counter:"1"}))}}).outcome.missing.length,1024);
});
test("packet registry binds exact returned objects to one owner's publication, schema, document and operation",()=>{
 const value=base(),registry=new SharedPacketAssetReferenceRegistry(),foreign=new SharedPacketAssetReferenceRegistry(),read=registry.retain(JSON.stringify(value),value.revision,"suggestion",document(value));registry.check(read,value.revision);
 for(const other of [parse(value),structuredClone(read),{...read},foreign.retain(JSON.stringify(value),value.revision,"suggestion",document(value))])assert.throws(()=>registry.check(other,value.revision));assert.throws(()=>registry.check(read,"0"));
 for(const mutate of [v=>v.document="other",v=>v.revision="0",v=>v.schema.version=2,v=>v.schema.name="other/schema",v=>v.schema.fingerprint=digest("e"),v=>v.packet.kind="version"]){const other=base();mutate(other);assert.throws(()=>registry.retain(JSON.stringify(other),value.revision,"suggestion",document(value)),/another source/);}
});
