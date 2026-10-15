import test from "node:test";
import assert from "node:assert/strict";
import {assertNativeConsumerGraph} from "./collaboration-native-graph.mjs";
const canonicalize=path=>path.replace(/^\/var\//,"/private/var/");
function fixture(){return{packages:[...(["loro","loro-internal","breditor-collaboration"].map(name=>({name,id:name,version:name==="breditor-collaboration"?"0.3.0-alpha.22":"1.16.2",source:null,manifest_path:`/private/var/proof/source/${name}/Cargo.toml` }))),{name:"consumer",id:"consumer",version:"0.0.0",source:null,manifest_path:"/private/var/proof/consumer/Cargo.toml"}],resolve:{nodes:[{id:"breditor-collaboration",features:[]}]}};}
const check=metadata=>assertNativeConsumerGraph(metadata,"/var/proof/source","/var/proof/consumer",canonicalize);
test("downstream native source paths normalize aliases without permitting repository escapes",()=>{
 check(fixture());const escaped=fixture();escaped.packages[0].manifest_path="/repository/vendor/loro/Cargo.toml";assert.throws(()=>check(escaped));
});
test("registry fallback reproduces the ignored dependency patch failure",()=>{
 const metadata=fixture();metadata.packages[1].source="registry+https://github.com/rust-lang/crates.io-index";assert.throws(()=>check(metadata),/retained deterministic engine/);
});
test("unexpected engine versions or research feature activation reject",()=>{
 const changed=fixture();changed.packages[0].version="1.16.3";assert.throws(()=>check(changed));const research=fixture();research.resolve.nodes[0].features=["research"];assert.throws(()=>check(research));
});
