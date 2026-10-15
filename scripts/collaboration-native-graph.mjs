/** Downstream metadata, not a dependency manifest's ignored patch declaration, proves engine selection. */
import assert from "node:assert/strict";
import {realpathSync} from "node:fs";
import {sep} from "node:path";
export function assertNativeConsumerGraph(metadata,source,consumer,canonicalize=realpathSync){
 const sourcePrefix=canonicalize(source)+sep,consumerPrefix=canonicalize(consumer)+sep;
 for(const name of ["loro","loro-internal"]){const packages=metadata.packages.filter(p=>p.name===name);assert.equal(packages.length,1);const p=packages[0];assert.equal(p.version,"1.16.2");assert.equal(p.source,null,`Downstream ${name} must use the retained deterministic engine, not an ignored dependency patch`);assert.ok(canonicalize(p.manifest_path).startsWith(sourcePrefix));}
 for(const p of metadata.packages.filter(p=>p.source===null))assert.ok(canonicalize(p.manifest_path).startsWith(sourcePrefix)||canonicalize(p.manifest_path).startsWith(consumerPrefix),`Native source candidate escaped its copied tree: ${p.name}`);
 const library=metadata.packages.find(p=>p.name==="breditor-collaboration");assert.ok(library);assert.equal(library.source,null);const node=metadata.resolve.nodes.find(n=>n.id===library.id);assert.ok(node);assert.ok(!node.features.includes("research"));
}
