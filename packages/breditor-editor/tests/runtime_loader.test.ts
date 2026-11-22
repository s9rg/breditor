import {describe,expect,it,vi} from "vitest";
import {runtimeLoader} from "../src/runtime_loader.js";
describe("runtime initialization ownership",()=>{
 it("shares concurrent initialization but rejects another explicit input",async()=>{
  let finish!:()=>void;const start=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;})),importer=vi.fn(async()=>({default:start})),load=runtimeLoader(importer),input=new Uint8Array([1]);
  const a=load(input),b=load();expect(b).toBe(a);await expect(load(new Uint8Array([2]))).rejects.toThrow("another input");await vi.waitFor(()=>expect(start).toHaveBeenCalledTimes(1));finish();expect(await a).toBe(await b);expect(start).toHaveBeenCalledTimes(1);expect(importer).toHaveBeenCalledTimes(1);
 });
 it("returns a retryable rejection when the module importer throws synchronously",async()=>{
  const start=vi.fn().mockResolvedValue(undefined),module={default:start};
  const importer=vi.fn<()=>Promise<typeof module>>().mockImplementationOnce(()=>{throw Error("import failure");}).mockResolvedValue(module);
  const load=runtimeLoader(importer);
  const first=load(new Uint8Array([1]));
  expect(load()).toBe(first);
  await expect(first).rejects.toThrow("import failure");
  await expect(load(new Uint8Array([2]))).resolves.toBe(module);
  expect(importer).toHaveBeenCalledTimes(2);expect(start).toHaveBeenCalledTimes(1);
 });
 it("retries initialization failures instead of caching a permanently rejected promise",async()=>{
  const start=vi.fn().mockRejectedValueOnce(Error("temporary failure")).mockResolvedValue(undefined),load=runtimeLoader(async()=>({default:start}));await expect(load()).rejects.toThrow("temporary failure");await load();expect(start).toHaveBeenCalledTimes(2);
 });
});
