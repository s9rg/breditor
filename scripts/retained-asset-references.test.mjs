import assert from "node:assert/strict";
import test from "node:test";
import {parseRichRetainedAssetReferences,MAX_RETAINED_ASSET_REFERENCES,MAX_RETAINED_ASSET_REFERENCES_JSON_BYTES} from "../packages/breditor-experimental-rich-content/dist/browser/retained_asset_references_metadata.js";
import {RichRetainedAssetReferenceRegistry} from "../packages/breditor-experimental-rich-content/dist/browser/retained_asset_references_registry.js";
const base=()=>({format:"breditor/rich-retained-asset-references",formatVersion:1,schema:{name:"example/assets",version:1,fingerprint:"sha256:"+"a".repeat(64)},document:"room",revision:"18446744073709551615",retention:"local-history",references:[{asset:"opaque-asset",generation:"a"},{asset:"opaque-asset",generation:"b"}]});
const parse=value=>parseRichRetainedAssetReferences(JSON.stringify(value));
const document=value=>JSON.stringify({schema:{name:value.schema.name,version:value.schema.version},schemaFingerprint:value.schema.fingerprint,root:{properties:{"breditor/document-id":value.document}}});
test("retained references are detached and deeply frozen with exact paired generations and u64 revision",()=>{
 const source=base(),read=parse(source);for(const part of [read,read.schema,read.references,...read.references])assert.ok(Object.isFrozen(part));assert.equal(read.revision,"18446744073709551615");source.references[0].asset="changed";assert.equal(read.references[0].asset,"opaque-asset");assert.deepEqual(read.references.map(r=>r.generation),["a","b"]);
});
test("retained reference parsing refuses unknown fields, invalid source identities and scalar coercion",()=>{
 for(const mutate of [v=>v.extra=true,v=>v.schema.extra=true,v=>v.references[0].extra=true,v=>v.formatVersion=2,v=>v.retention="complete-room",v=>v.retention={toString:null},v=>v.document="bad/id",v=>v.revision="01",v=>v.revision="18446744073709551616",v=>v.revision=1,v=>v.schema.name="UPPER/case",v=>v.schema.name="x/"+"x".repeat(128),v=>v.schema.version=0,v=>v.schema.version=4294967296,v=>v.schema.fingerprint="sha256:bad",v=>v.references[0].asset="",v=>v.references[0].asset="x".repeat(129),v=>v.references[0].generation="日本",v=>v.references=null]){const value=base();mutate(value);assert.throws(()=>parse(value),/Invalid native retained asset references/);}
});
test("canonical pair order rejects duplicate, reversed and cross-generation ordering without truncation",()=>{
 for(const references of [[{asset:"a",generation:"b"},{asset:"a",generation:"a"}],[{asset:"b",generation:"a"},{asset:"a",generation:"b"}],[{asset:"a",generation:"a"},{asset:"a",generation:"a"}]])assert.throws(()=>parse({...base(),references}));
 assert.equal(parse({...base(),references:[]}).references.length,0);
 assert.equal(parse({...base(),references:[{asset:"a",generation:"z"},{asset:"b",generation:"a"}]}).references.length,2);
});
test("complete reference count and encoded byte budgets reject rather than return a prefix or payload",()=>{
 const value=base();value.references=Array.from({length:MAX_RETAINED_ASSET_REFERENCES},(_,n)=>({asset:`a${String(n).padStart(6,"0")}`,generation:"g"}));assert.equal(parse(value).references.length,MAX_RETAINED_ASSET_REFERENCES);value.references.push({asset:"overflow",generation:"g"});assert.throws(()=>parse(value));
 for(const input of ["PRIVATE-PAYLOAD"," ".repeat(MAX_RETAINED_ASSET_REFERENCES_JSON_BYTES+1),JSON.stringify({...base(),private:"PRIVATE-PAYLOAD"})])assert.throws(()=>parseRichRetainedAssetReferences(input),e=>!String(e).includes("PRIVATE-PAYLOAD"));
});
test("owner registry rejects copied, foreign and stale inventories even when detached metadata matches",()=>{
 const value=base(),registry=new RichRetainedAssetReferenceRegistry(),foreign=new RichRetainedAssetReferenceRegistry(),read=registry.retain(JSON.stringify(value),value.revision,"local-history",document(value));registry.check(read,value.revision);
 for(const other of [parse(value),structuredClone(read),{...read},foreign.retain(JSON.stringify(value),value.revision,"local-history",document(value))])assert.throws(()=>registry.check(other,value.revision));
 assert.throws(()=>registry.check(read,"0"));
 for(const mutate of [v=>v.document="other",v=>v.schema.fingerprint="sha256:"+"b".repeat(64),v=>v.schema.name="other/schema",v=>v.schema.version=2,v=>v.revision="0",v=>v.retention="shared-causal"]){const other=base();mutate(other);assert.throws(()=>registry.retain(JSON.stringify(other),value.revision,"local-history",document(value)),/another source/);}
});
