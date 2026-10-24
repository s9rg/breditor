import test from 'node:test';
import {verifyProtectedGroupRelease} from './fixtures/original-operational-read/protected_group_disposal.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url).pathname;
for(const mode of['prepared','unprepared'])test(`closed ${mode} protected group reports release callbacks and factories`,{timeout:120000},()=>verifyProtectedGroupRelease(runtime,mode));
