import test from 'node:test';
import {verifyOriginalReferenceRelease} from './fixtures/original-record-read/reference_disposal.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url).pathname,fixture=new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url).pathname;
for(const family of ['paired','stores'])test(`disposed original ${family} reference reports release callbacks`,{timeout:120000},()=>verifyOriginalReferenceRelease(runtime,fixture,family));
