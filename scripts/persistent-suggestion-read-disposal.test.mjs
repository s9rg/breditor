import test from 'node:test';
import {verifyPersistentSuggestionRelease} from './fixtures/persistent-suggestion-read/disposal.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url).pathname,fixture=new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url).pathname;
test('closed persistent proposal reports release read authority after source teardown',{timeout:120000},()=>verifyPersistentSuggestionRelease(runtime,fixture));
