// node test/run.mjs   - concatenates stubs + built modules + test files and runs them
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "src");
const mods = readdirSync(src).filter(f => /^\d+-.*\.js$/.test(f)).sort();
const tests = ["core.test.js","geometry.test.js","backbone.test.js","planner.test.js","profile.test.js","ux.test.js","mutate.test.js","make.test.js","primers.test.js"];
const bundle = [readFileSync(join(here,"stubs.js"),"utf8")]
  .concat(mods.map(f => readFileSync(join(src,f),"utf8")))
  .concat(tests.map(f => readFileSync(join(here,f),"utf8")))
  .join("\n");
writeFileSync(join(here,"_run.js"), bundle.replace(/^process\.exit\(fail \? 1 : 0\);$/m, ""));
try { console.log(execFileSync(process.execPath,[join(here,"_run.js")],{encoding:"utf8"})); }
catch(e){ console.log(e.stdout||""); console.error(e.stderr||""); process.exitCode = 1; }
