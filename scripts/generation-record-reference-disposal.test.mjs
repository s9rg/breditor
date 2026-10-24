import test from 'node:test';
import {verifyGenerationReferenceRelease} from './fixtures/persistent-suggestion-read/generation_reference_disposal.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url).pathname,fixture=new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url).pathname;
for(const family of ['generation','retained'])test(`disposed ${family} generation reference reports release read/source callbacks`,{timeout:120000},()=>verifyGenerationReferenceRelease(runtime,fixture,family));
