// BetterBench build: concatenate src/ into a single self-contained HTML file.
//   node src/build.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = dirname(fileURLToPath(import.meta.url));
const out = join(src, "..", "betterbench.html");

const files = readdirSync(src).filter(f => /^\d+-.*\.js$/.test(f)).sort();
const head = readFileSync(join(src, "00-head.html"), "utf8");
const js = files.map(f => "\n/* ==== " + f + " ==== */\n" + readFileSync(join(src, f), "utf8")).join("\n");

if(js.includes("</script")) { console.error("refusing to build: a source file contains </script"); process.exit(1); }

writeFileSync(out, head + "<script>\n" + js + "\n</script>\n</body>\n</html>\n");
console.log("built " + out);
console.log("  " + files.length + " modules, " + (js.split("\n").length) + " lines of JS");
