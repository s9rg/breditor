import {expect,it,vi} from "vitest";
import {initializeSharedReadOnly} from "../../breditor-collaboration/src/initialize_read_only.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";

it("initial policy requires the complete independently versioned native capability",()=>{
 for(const partial of [{},{initial_read_only_version:()=>"2"},{initial_read_only_version:()=>"1"},{initialize_read_only:vi.fn()}]){
  const raw={...partial,set_read_only:vi.fn(),free:vi.fn()} as unknown as SharedRustOwner;
  expect(()=>initializeSharedReadOnly(raw,true)).toThrow(expect.objectContaining({code:"initial_read_only_unavailable"}));
  expect(raw.set_read_only).not.toHaveBeenCalled();expect(raw.free).not.toHaveBeenCalled();
 }
});
it("initial policy validates Boolean values and retains caller ownership on every failure",()=>{
 const raw={initial_read_only_version:()=>"1",initialize_read_only:vi.fn(),free:vi.fn()} as unknown as SharedRustOwner;
 for(const value of [undefined,null,0,1,"false",{},[]])expect(()=>initializeSharedReadOnly(raw,value as boolean)).toThrow(TypeError);
 expect(raw.initialize_read_only).not.toHaveBeenCalled();expect(raw.free).not.toHaveBeenCalled();
 const reason=Error("native owner already observed");vi.mocked(raw.initialize_read_only!).mockImplementation(()=>{throw reason;});
 expect(()=>initializeSharedReadOnly(raw,true)).toThrow(reason);expect(raw.free).not.toHaveBeenCalled();
});
it("initial policy delegates without observing, publishing, freeing or replacing the owner",()=>{
 for(const mode of [false,true]){
  const raw={initial_read_only_version:()=>"1",initialize_read_only:vi.fn(),observe:vi.fn(),set_read_only:vi.fn(),free:vi.fn(),extra:"retained type"} as unknown as SharedRustOwner&{extra:string};
  const result=initializeSharedReadOnly(raw,mode);expect(result).toBe(raw);expect(result.extra).toBe("retained type");
  expect(raw.initialize_read_only).toHaveBeenCalledExactlyOnceWith(mode);expect(raw.observe).not.toHaveBeenCalled();expect(raw.set_read_only).not.toHaveBeenCalled();expect(raw.free).not.toHaveBeenCalled();
 }
});
