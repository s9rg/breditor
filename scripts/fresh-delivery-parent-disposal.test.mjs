import test from 'node:test';
import {readFileSync} from 'node:fs';
import {verifyFreshDeliveryRelease} from './fixtures/original-operational-read/fresh_delivery_disposal.mjs';
import {freshDeliveryFamilies} from './fixtures/original-operational-read/fresh_delivery_session.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url).pathname;
const seed=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)));
for(const family of freshDeliveryFamilies)for(const mode of['prepared','unprepared'])test(`closed ${mode} ${family} reports release fresh callbacks and factories`,{timeout:120000},()=>verifyFreshDeliveryRelease(runtime,family,mode,seed));
