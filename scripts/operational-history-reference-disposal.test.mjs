import test from 'node:test';
import {verifyOperationalHistoryRelease} from './fixtures/original-operational-read/history_disposal.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url).pathname;
for(const family of['original','retained'])test(`disposed ${family} complete-history reports release callbacks`,{timeout:120000},()=>verifyOperationalHistoryRelease(runtime,family));
