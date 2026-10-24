import test from 'node:test';
import {verifyPersistentPairedRelease} from './fixtures/persistent-suggestion-read/paired_disposal.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url).pathname,fixture=new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url).pathname;
test('closed paired record reports release source and read callbacks after actual teardown',{timeout:120000},()=>verifyPersistentPairedRelease(runtime,fixture));
