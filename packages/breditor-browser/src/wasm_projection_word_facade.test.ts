import {describe,expect,it,vi} from "vitest";
import {snapshotNestedProjectionWordFacade} from "./wasm_projection_word_facade.js";
import {decodeProjectionIntegerWords} from "./projection_scalar_words.js";

describe("nested projection word capability facade", () => {
  it("forwards exact signed records, receiver and indices without owning cleanup", () => {
    const free=vi.fn(), scalarMarker=vi.fn(()=>1), integerMarker=vi.fn(()=>1);
    const raw: Record<string, unknown> = {free};
    Object.defineProperties(raw,{projectionScalarWordsVersion:{get:scalarMarker},projectionIntegerWordsVersion:{get:integerMarker}});
    for(const name of ["childCountWords","childAtWords","formatCountWords","formatPropertyCountWords","headingLevelWords","orderedListStartWords"]){
      raw[name]=()=>new Uint32Array([0,0]);
    }
    let record=new Uint32Array([0,0,0]);
    const integer=vi.fn(function(this: object,...args:number[]){expect(this).toBe(raw);expect(args).toEqual([4,2,0]);return record;});
    raw["formatPropertyIntegerWords"]=integer;
    const facade=snapshotNestedProjectionWordFacade(raw,()=>false)!;
    const read=facade["formatPropertyIntegerWords"] as (...args:number[])=>unknown;
    expect(Object.isFrozen(facade)).toBe(true);
    expect(scalarMarker).toHaveBeenCalledTimes(1);expect(integerMarker).toHaveBeenCalledTimes(1);
    // Later replacement cannot change the captured generated method.
    raw["formatPropertyIntegerWords"]=()=>{throw Error("replacement called");};
    for(const value of [-9007199254740991n,-5n,0n,1193046n,4294967296n,9007199254740991n]){
      const bits=BigInt.asUintN(64,value);
      record=new Uint32Array([1,Number(bits&0xffffffffn),Number(bits>>32n)]);
      const returned=read(4,2,0);expect(returned).toBe(record);
      expect(decodeProjectionIntegerWords(returned)).toBe(Number(value));
    }
    record=new Uint32Array([0,0,0]);expect(decodeProjectionIntegerWords(read(4,2,0))).toBeUndefined();
    expect(integer).toHaveBeenCalledTimes(7);expect(free).not.toHaveBeenCalled();
  });
});
