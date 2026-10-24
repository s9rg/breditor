import test from 'node:test';
import {verifyOriginalRecordReadRelease} from './fixtures/original-record-read/disposal.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url).pathname,fixture=new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url).pathname;
for(const family of ['native','version','revision'])test(`disposed original ${family} reports release source/read callbacks after actual teardown`,{timeout:120000},()=>verifyOriginalRecordReadRelease(runtime,fixture,family));
