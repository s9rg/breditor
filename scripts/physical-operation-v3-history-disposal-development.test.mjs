import test from 'node:test';
import {verifyRootHistoryRelease} from './fixtures/operation-read/history-disposal.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url).pathname;
for(const mode of['prepared','denied'])test(`detached ${mode} root history releases fresh callbacks and factories`,{timeout:180000},()=>verifyRootHistoryRelease(runtime,mode));
