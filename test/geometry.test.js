console.log("\n== reverse-strand guide geometry ==");
const gAll = findGuides(seq, "SpCas9");
console.log("  reverse guides: " + gAll.filter(x => x.strand === -1).length);
let bad = 0, badCut = 0, badPam = 0;
gAll.forEach(x => {
  const onFwd = seq.substr(x.start, 20);
  if((x.strand === 1 ? onFwd : revComp(onFwd)) !== x.spacer) bad++;
  const pamCheck = x.strand === 1 ? seq.substr(x.pamStart,3) : revComp(seq.substr(x.pamStart,3));
  if(pamCheck !== x.pam) badPam++;
  const expected = x.strand === 1 ? x.end - 2 : x.start + 3;
  if(Math.abs(x.cut - expected) > 1) badCut++;
});
ok("all spacers map back to the forward strand", bad === 0, bad + " mismatched");
ok("all PAMs map back", badPam === 0, badPam + " mismatched");
ok("cut sites 3 bp from PAM", badCut === 0, badCut + " off");

console.log("\n== digest-ready cloning path ==");
{
  const core = "ATGAAACGTGAAGATTTACTGGCACAAGCACGT".repeat(3);
  const prsR = suggestEnzymePairs(seqOf(p), true, core, seqOf(p).length);
  const pr2 = prsR[0];
  // build the insert in the orientation this pair requires: e5 site at the head, e3 at the tail
  const insReady = ENZ[pr2.e5].s + core + ENZ[pr2.e3].s;
  const b2 = buildRestrictionProduct(p, insReady, [], pr2, false);
  ok("digest-ready piece trims the outer site bases", b2.pieceLen < insReady.length, b2.pieceLen + " of " + insReady.length);
  ok("digest-ready product = backbone + piece", b2.product.length === b2.backboneLen + b2.pieceLen);
  ok("note explains the route", /own/.test(b2.note), b2.note);
  ok("piece still contains the whole core insert", b2.product.indexOf(core) !== -1);
}
console.log("\n== annotation transfer across the join ==");
{
  const vecCopy = JSON.parse(JSON.stringify(p));
  vecCopy.ann = [
    { id:"a1", start:10,  end:60,  label:"near start", color:"#eee", kind:"custom", strand:1 },
    { id:"a2", start:400, end:500, label:"middle",     color:"#eee", kind:"custom", strand:1 },
    { id:"a3", start:960, end:1000,label:"near end",   color:"#eee", kind:"custom", strand:1 }
  ];
  const core = "ATGGCACAAGCACGTGAAGTTTTCGGT".repeat(2);
  const prs = suggestEnzymePairs(seqOf(vecCopy), true, core, seqOf(vecCopy).length);
  const bb = buildRestrictionProduct(vecCopy, core, [{id:"i1",start:0,end:20,label:"insert feature",color:"#eee"}], prs[0], true);
  const labels = bb.ann.map(a => a.label);
  ok("annotations survive the join", labels.length >= 2, labels.join(" | "));
  ok("insert annotation carried and offset", bb.ann.some(a => a.label === "insert feature" && a.start >= bb.backboneLen),
     JSON.stringify(bb.ann.filter(a=>a.label==="insert feature")));
  ok("no annotation runs past the product", bb.ann.every(a => a.end < bb.product.length && a.end >= a.start));
  // spot-check one carried annotation actually points at the same bases
  const carried = bb.ann.find(a => a.label === "middle");
  if(carried) ok("carried annotation points at the same sequence",
    bb.product.slice(carried.start, carried.end+1) === seqOf(vecCopy).slice(400, 501),
    "len " + (carried.end-carried.start+1));
  else console.log("  (middle annotation fell in the removed arc - fine)");
}
console.log("\n== protocol scaling ==");
const dg = PROTOCOLS.find(x => x.id === "pcr");
const per = dg.rx.rows.filter(r => typeof r.v === "number").reduce((s,r) => s + r.v, 0);
ok("PCR table numeric rows sum sanely", per > 10 && per < 50, per + " µL of 50");
ok("every protocol has steps", PROTOCOLS.every(x => x.steps.length >= 3), PROTOCOLS.length + " protocols");
ok("protocol ids unique", new Set(PROTOCOLS.map(x=>x.id)).size === PROTOCOLS.length);

console.log("\n== enzyme table integrity ==");
let enzBad = [];
Object.keys(ENZ).forEach(n => {
  const e = ENZ[n];
  if(e.iis) return;
  if(revComp(e.s) !== e.s) enzBad.push(n + " not palindromic");
  if(e.c === null || e.c > e.s.length) enzBad.push(n + " bad cut");
});
ok("all type II sites palindromic with valid cut", enzBad.length === 0, enzBad.join("; "));
