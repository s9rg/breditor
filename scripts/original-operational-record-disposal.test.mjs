import test from 'node:test';
import {verifyOriginalParentReadRelease} from './fixtures/original-operational-read/disposal.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url).pathname;
for(const family of['paired','retained'])test(`disposed original ${family} parent reports release callbacks`,{timeout:120000},()=>verifyOriginalParentReadRelease(runtime,family));
