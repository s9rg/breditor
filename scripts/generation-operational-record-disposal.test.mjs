import test from 'node:test';
import {verifyGenerationParentReadRelease} from './fixtures/original-operational-read/generation_disposal.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url).pathname;
for(const family of['generation','retained'])test(`disposed ${family} parent reports release callbacks`,{timeout:120000},()=>verifyGenerationParentReadRelease(runtime,family));
