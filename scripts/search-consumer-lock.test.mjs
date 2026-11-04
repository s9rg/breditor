import test from "node:test";
import assert from "node:assert/strict";
import {searchConsumerLock,verifySearchConsumerRegistry} from "./search-consumer-lock.mjs";
const fixture=()=>({lockfileVersion:3,packages:Object.fromEntries(Object.entries({react:"19.2.8","react-dom":"19.2.8","@types/react":"19.2.18",jsdom:"29.1.1","fake-indexeddb":"6.2.6",undici:"7.29.1"}).map(([name,version])=>[`node_modules/${name}`,{version,resolved:`https://registry.npmjs.org/${name}/fixture.tgz`,integrity:"sha512-fixture"}]))});
test("independent search consumers retain exact registry entries and replace workspace links with explicit archives",()=>{
 const producer=fixture();producer.packages["node_modules/@breditor/editor"]={link:true,resolved:"packages/breditor-editor"};producer.packages["packages/breditor-editor"]={version:"0.3.0-alpha.22"};producer.packages["node_modules/local-file"]={version:"1",resolved:"file:/private/source",integrity:"sha512-fixture"};
 const before=structuredClone(producer),{manifest,lock}=searchConsumerLock(producer,[{name:"@breditor/editor",path:"/private/test/editor.tgz"}]);assert.equal(manifest.dependencies["@breditor/editor"],"file:/private/test/editor.tgz");assert.equal(lock.packages["node_modules/undici"].version,"7.29.1");assert.equal(lock.packages["node_modules/@breditor/editor"],undefined);assert.equal(lock.packages["node_modules/local-file"],undefined);assert.equal(lock.packages["packages/breditor-editor"],undefined);assert.deepEqual(producer,before);lock.packages["node_modules/react"].version="changed";assert.deepEqual(producer,before);
});
test("unknown lock formats, dependency drift and duplicate archive identities fail instead of floating versions",()=>{
 assert.throws(()=>searchConsumerLock({lockfileVersion:2,packages:{}},[]));const p=fixture();p.packages["node_modules/jsdom"].version="newer";assert.throws(()=>searchConsumerLock(p,[]),/differs/);assert.throws(()=>searchConsumerLock(fixture(),[{name:"@breditor/editor",path:"editor.tgz"},{name:"@breditor/editor",path:"second.tgz"}]));
});
test("installed registry artifacts must retain exact versions, tarball identities and integrities even if npm relocates them",()=>{
 const producer=fixture(),consumer=structuredClone(producer);consumer.packages["node_modules/jsdom/node_modules/undici"]=consumer.packages["node_modules/undici"];delete consumer.packages["node_modules/undici"];assert.equal(verifySearchConsumerRegistry(producer,consumer),6);consumer.packages["node_modules/jsdom/node_modules/undici"].version="7.30.0";assert.throws(()=>verifySearchConsumerRegistry(producer,consumer),/drifted/);consumer.packages["node_modules/linked"]={link:true};assert.throws(()=>verifySearchConsumerRegistry(producer,consumer));
});
