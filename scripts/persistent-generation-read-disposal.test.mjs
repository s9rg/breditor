import test from 'node:test';
import {verifyGenerationRecordRelease} from './fixtures/persistent-suggestion-read/generation_disposal.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url).pathname;
for(const family of ['generation','generation-paired','relay','retained'])test(`closed ${family} generation reports release callbacks after actual teardown`,{timeout:120000},()=>verifyGenerationRecordRelease(runtime,family));
