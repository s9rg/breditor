/** Real normal-runtime release laws run under explicit collection in fresh
 * child processes, including for installed packages and actual bundled code. */
import test from 'node:test';
import {verifyReferenceCallbackRelease} from './fixtures/operation-references/disposal-law.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url).pathname,fixture=new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url).pathname;
for(const family of ['independent-delivery','restored-graph','independent-local','snapshot-local','flat-local'])test(`disposed ${family} reference proof releases callbacks while its report stays retained`,{timeout:120000},()=>verifyReferenceCallbackRelease(family,runtime,fixture));
