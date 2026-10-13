/* headless smoke test: stub the browser, then exercise the biology */
const store = {};
const mkEl = id => ({ id, value:"", innerHTML:"", textContent:"", style:{}, classList:{add(){},remove(){},toggle(){},contains(){return false}},
  querySelectorAll: () => [], setAttribute(){}, getBoundingClientRect: () => ({left:0,top:0,width:460,height:460}),
  focus(){}, setSelectionRange(){}, appendChild(){}, remove(){}, click(){}, checked:false, files:[] });
const els = {};
global.document = {
  getElementById: id => (els[id] = els[id] || mkEl(id)),
  createElement: t => mkEl(t),
  querySelector: () => mkEl("q"),
  querySelectorAll: () => [],
  body: { appendChild(){}, removeChild(){} }
};
global.localStorage = { getItem: k => store[k] || null, setItem: (k,v) => store[k] = v };
global.window = { innerWidth:1400, innerHeight:900, scrollTo(){}, open(){}, prompt(){},
  addEventListener(){}, removeEventListener(){} };
global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
global.performance = { now: () => Date.now() };
global.alert = m => console.log("[alert]", m);
global.confirm = () => true;
global.prompt = () => "x";
global.setTimeout = (f) => 0;
global.Blob = function(){}; global.URL = { createObjectURL: () => "", revokeObjectURL(){} };
global.$3Dmol = undefined;
global.fetch = () => Promise.reject(new Error("no network in test"));

