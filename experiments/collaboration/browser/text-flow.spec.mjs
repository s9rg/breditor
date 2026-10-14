import {test,expect} from "@playwright/test";

for(const scenario of ["split_offline","join_offline","reordered_range","selective_history","causal_boundaries","observed_boundary","concurrent_cuts","join_cycle"]){
 test(`text-flow lowerer ${scenario} matches native Rust without copying characters`,async({page})=>{
  await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready for contract tests");
  const wire=await page.evaluate(async scenario=>{
   const wasm=await import("/probe.js"),native=await(await fetch("/native-vector.json")).json();
   return {actual:wasm.exercise_shared_text_flow(scenario),expected:native.text_flow_expected[scenario]};
  },scenario);
  // Transport JSON strings, not rich objects through the browser RPC bridge.
  const actual=JSON.parse(wire.actual),expected=JSON.parse(wire.expected);
  expect(actual).toEqual(expected);expect(actual.views).toEqual(actual.restored);
  const text=block=>actual.views.find(view=>view.block===block).chunks.map(chunk=>chunk.text).join("");
  if(scenario==="split_offline"){
   expect(text("a")).toBe("ab");expect(text("right")).toBe("🙂Xcd");expect(actual.details.anchor).toEqual(["right",3]);expect(actual.details.converged).toBe(true);
   expect(actual.sources.a).toBe("ab🙂Xcd");expect(actual.views.find(view=>view.block==="right").chunks.some(chunk=>chunk.text.includes("X")&&chunk.formats.length===1)).toBe(true);
  }else if(scenario==="join_offline"){
   expect(text("a")).toBe("ab🙂cdE🙂F");expect(actual.sources.b).toBe("E🙂F");expect(actual.details.anchor).toEqual(["a",9]);expect(actual.details.converged).toBe(true);
  }else if(scenario==="reordered_range"){
   expect(actual.details).toEqual({joined:"cdab🙂",final:"c🙂"});expect(actual.sources.a).toBe("🙂c");
  }else if(scenario==="selective_history"){
   expect(actual.details.steps).toHaveLength(7);for(let index=0;index<7;index++)expect(actual.details.steps[index]).toEqual(index%2?{a:"ab🙂cd",right:"X"}:{a:"ab",right:"🙂Xcd"});
  }else if(scenario==="causal_boundaries"){
   expect(actual.details).toEqual({before:["a",6],after:["right",0],clicked:["a",6],restored:["right",0],afterTyping:{after:["right",1],clicked:["a",6]}});expect(text("a")).toBe("ab🙂cd");expect(text("right")).toBe("R");
  }else if(scenario==="observed_boundary"){
   expect(actual.details.steps).toEqual([{left:["a",2],right:["right",4]},{left:["a",2],right:["right",5]},{left:["a",3],right:["right",5]}]);expect(text("a")).toBe("abL");expect(text("right")).toBe("R🙂cd");
  }else if(scenario==="concurrent_cuts"){
   expect(text("a")).toBe("ab");expect(text("right")).toBe("🙂");expect(text("other")).toBe("cd");expect(actual.details.anchor).toEqual(["other",0]);expect(actual.details.converged).toBe(true);
  }else{
   expect(actual.details.converged).toBe(true);expect(["ab🙂cdEF","EFab🙂cd"]).toContain(actual.details.text);expect(actual.views.every(view=>view.owner===actual.details.owner)).toBe(true);
  }
 });
}
