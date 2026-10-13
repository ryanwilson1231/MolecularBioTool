
let pass = 0, fail = 0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log("  ok   " + name + (extra ? "  " + extra : "")); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  " + extra : "")); }
}
console.log("\n== primitives ==");
ok("revComp", revComp("ATGC") === "GCAT");
ok("translate", translate("ATGGCCTAA") === "MA*");
ok("gc", Math.round(gcPct("GGCCATAT")) === 50);
ok("tmNN sane", tmNN("ACGTACGTACGTACGTACGT") > 40 && tmNN("ACGTACGTACGTACGTACGT") < 70, "= " + tmNN("ACGTACGTACGTACGTACGT"));
ok("MW EGFP-ish", proteinMW("MVSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTL") > 6, "= " + proteinMW("MVSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTL"));
ok("pI acidic < 7", pI("DDDEEEE") < 5, "= " + pI("DDDEEEE"));
ok("pI basic > 9", pI("KKKRRRR") > 9, "= " + pI("KKKRRRR"));

console.log("\n== enzymes ==");
ok("EcoRI overhang", overhangOf("EcoRI").type === "5'" && overhangOf("EcoRI").seq === "AATT", JSON.stringify(overhangOf("EcoRI")));
ok("PstI overhang", overhangOf("PstI").type === "3'" && overhangOf("PstI").seq === "TGCA", JSON.stringify(overhangOf("PstI")));
ok("SmaI blunt", overhangOf("SmaI").type === "blunt");
ok("NotI overhang", overhangOf("NotI").seq === "GGCC");
ok("BamHI~BglII compatible", endsCompatible("BamHI","BglII"));
ok("XhoI~SalI compatible", endsCompatible("XhoI","SalI"));
ok("EcoRI!~BamHI", !endsCompatible("EcoRI","BamHI"));
const tseq = "AAAAGAATTCTTTTGGATCCAAAA";
ok("sitesOf EcoRI", sitesOf("EcoRI", tseq, false).length === 1 && sitesOf("EcoRI", tseq, false)[0].cut === 5,
   JSON.stringify(sitesOf("EcoRI", tseq, false)));
const fr = fragments(tseq, false, ["EcoRI","BamHI"]);
ok("fragments linear = 3", fr.length === 3, fr.map(f=>f.size).join(","));
ok("fragment sizes sum", fr.reduce((s,f)=>s+f.size,0) === tseq.length);

console.log("\n== annotation ==");
const p = state.plasmids[0];
const seq = seqOf(p);
const feats = autoAnnotate(seq, true, p.id);
const names = feats.map(f => f.name);
ok("finds T7 promoter", names.includes("T7 promoter"), names.filter(n=>/T7/.test(n)).join(", "));
ok("finds FLAG tag", names.some(n => /FLAG/.test(n)));
ok("finds EGFP by protein signature", names.some(n => /EGFP/.test(n)));
ok("finds His tag", names.some(n => /His/.test(n)));
ok("finds an ORF", names.some(n => /^ORF/.test(n)));
ok("all coords in range", feats.every(f => f.start >= 0 && f.end < seq.length && f.end >= f.start),
   feats.filter(f => f.end < f.start || f.end >= seq.length).map(f=>f.name+":"+f.start+"-"+f.end).join(","));
const rs = detectRestrictionSites(seq, true);
ok("restriction sites found", rs.length > 3, rs.length + " sites");

console.log("\n== alignment ==");
const region = seq.slice(200, 800);
let r1 = alignToPlasmid(p, region);
ok("perfect read: no diffs", !r1.error && r1.diffs.length === 0, r1.error || (r1.identity.toFixed(2) + "% at " + (r1.refStart+1)));
ok("perfect read: right position", !r1.error && r1.refStart === 200, "start=" + (r1.refStart));
// introduce a substitution, a deletion and an insertion
let mut = region.split("");
mut[100] = mut[100] === "A" ? "C" : "A";
let mutS = mut.join("");
mutS = mutS.slice(0,300) + mutS.slice(301);            // 1 bp deletion
mutS = mutS.slice(0,450) + "GGG" + mutS.slice(450);     // 3 bp insertion
const r2 = alignToPlasmid(p, mutS);
ok("mutant read aligns", !r2.error, r2.error || "");
if(!r2.error){
  const types = r2.diffs.map(d => d.type);
  ok("finds substitution", types.includes("substitution"));
  ok("finds deletion", types.includes("deletion"));
  ok("finds insertion", types.includes("insertion"));
  ok("substitution at expected position", r2.diffs.some(d => d.type === "substitution" && Math.abs(d.pos - 300) <= 1),
     r2.diffs.map(d => d.type+"@"+(d.pos+1)).join(", "));
  ok("identity high", r2.identity > 98, r2.identity.toFixed(2) + "%");
}
const r3 = alignToPlasmid(p, revComp(region));
ok("reverse strand detected", !r3.error && r3.strand === "-", r3.error || r3.strand);
const r4 = alignToPlasmid(p, "ACGTACGTACGTACGTACGTTTTTTTTTTTTTTTTTTTT");
ok("nonsense read rejected or low", !!r4.error || r4.identity < 90, r4.error || r4.identity + "%");
// circular junction read
const junction = seq.slice(-150) + seq.slice(0,150);
const r5 = alignToPlasmid(p, junction);
ok("origin-spanning read aligns", !r5.error && r5.identity > 99, r5.error || (r5.identity.toFixed(1)+"% start "+(r5.refStart+1)));

console.log("\n== cloning ==");
const vecSeq = seqOf(p);
const insert = "ATGAAACGTGAAGATTTACTGGCACAAGCACGTGAAGTTTTCGGTAAACCGTAA".repeat(4);
const pairs = suggestEnzymePairs(vecSeq, true, insert, vecSeq.length);
ok("enzyme pairs found", pairs.length > 0, pairs.length + " pairs, best " + (pairs[0] ? pairs[0].e5+"/"+pairs[0].e3 : "-"));
if(pairs.length){
  const pr = pairs[0];
  ok("pair is unique in vector", sitesOf(pr.e5, vecSeq, true).length === 1 && sitesOf(pr.e3, vecSeq, true).length === 1);
  ok("pair absent from insert", countSites(insert, pr.e5) === 0 && countSites(insert, pr.e3) === 0);
  ok("ends not compatible", !endsCompatible(pr.e5, pr.e3));
  const built = buildRestrictionProduct(p, insert, [], pr, true);
  ok("product length sane", built.product.length > insert.length, built.product.length + " bp");
  ok("product contains insert", built.product.indexOf(insert) !== -1);
  ok("product = backbone + piece", built.product.length === built.backboneLen + built.pieceLen);
  ok("annotations in range", built.ann.every(a => a.start >= 0 && a.end < built.product.length));
}
const g = planGibson(p, insert, Object.keys(uniqueCutters(vecSeq, true))[0]);
ok("gibson plan", !!g && g.product.length === vecSeq.length + insert.length, g ? g.product.length : "null");
ok("gibson fwd primer has arm", !!g && g.fwd.full.startsWith(g.leftArm));
ok("gibson primers have Tm", !!g && g.fwd.tm > 50 && g.rev.tm > 50, g ? g.fwd.tm + "/" + g.rev.tm : "");
const sr = synthesisReport(insert);
ok("synthesis report flags repeat", sr.flags.some(f => /repeat/.test(f.t)), sr.flags.map(f=>f.t).join(" | "));

console.log("\n== CRISPR ==");
const guides = findGuides(seq, "SpCas9");
ok("guides found", guides.length > 10, guides.length + " guides");
const g0 = guides[0];
ok("spacer length 20", g0.spacer.length === 20);
ok("PAM is NGG", /GG$/.test(g0.pam), g0.pam);
// verify the guide really occurs where it says it does
const fwdCheck = seq.substr(g0.start, 20);
const revCheck = revComp(seq.substr(g0.start, 20));
ok("spacer maps back to sequence", (g0.strand === 1 ? fwdCheck : revCheck) === g0.spacer,
   "strand " + g0.strand + " got " + (g0.strand === 1 ? fwdCheck : revCheck) + " want " + g0.spacer);
const ol = guideOligos(g0.spacer);
ok("BbsI top starts CACC", ol.bbsI.top.startsWith("CACC"), ol.bbsI.top);
ok("BbsI bottom starts AAAC", ol.bbsI.bot.startsWith("AAAC"), ol.bbsI.bot);
ok("oligos are complementary", revComp(ol.bbsI.top.slice(4)) === ol.bbsI.bot.slice(4),
   ol.bbsI.top + " / " + ol.bbsI.bot);
const off = localOffTargets(g0.spacer, "SpCas9");
ok("on-target found in off-target scan", off.some(o => o.mm === 0), off.length + " hits");
const c12 = findGuides(seq, "Cas12a");
ok("Cas12a guides", c12.length === 0 || c12[0].spacer.length === 23, c12.length + " guides");
const hd = designHDR(seq, 500, "GGATCC", 50);
ok("HDR donor length", hd.donor.length === 106, hd.donor.length + "");
ok("HDR donor centred on cut", hd.donor.indexOf("GGATCC") === 50);

console.log("\n== sketches ==");
const sk1 = minhash(seq, 21, 128), sk2 = minhash(seq, 21, 128);
ok("sketch deterministic", JSON.stringify(sk1) === JSON.stringify(sk2));
ok("self similarity = 1", jaccardFromSketch(sk1, sk2) === 1);
const other = minhash("ACGT".repeat(500), 21, 128);
ok("unrelated similarity low", jaccardFromSketch(sk1, other) < 0.05, jaccardFromSketch(sk1, other).toFixed(4));

console.log("\n== views render ==");
["start","plasmids","parts","design","inventory","crispr","protein","protocols","tools","connect"].forEach(v => {
  try { state.view = v; render(); ok("render " + v, true); }
  catch(e){ ok("render " + v, false, e.message); }
});
try { state.curPlasmid = p.id; state.view = "plasmids"; state.pView = "detail";
  ["map","align","features","stock"].forEach(t => { detailTab = t; render(); });
  ok("render detail tabs", true);
} catch(e){ ok("render detail tabs", false, e.message); }
try { state.connect.enabled = true; state.connect.optIn[p.id] = true; state.view = "connect"; render(); ok("render connect enabled", true); }
catch(e){ ok("render connect enabled", false, e.message); }
try { state.view="crispr"; crisprState.plasmidId = p.id; crisprState.guides = guides.slice(0,5);
  crisprState.guides.forEach(x => x.off = []); crisprState.selected = crisprState.guides[0]; render();
  ok("render crispr results", true); } catch(e){ ok("render crispr results", false, e.message); }
try { state.view="design"; asm = { backboneId:p.id, cut:null, routes:null, pick:0, name:"",
    items:[{ partId:null, name:"t", kind:"custom", seq:insert, sourceId:null }] };
  asmRun(); render();
  asm.routes.forEach((r,i) => { asm.pick = i; render(); });
  ok("render design routes", true); } catch(e){ ok("render design routes", false, e.message); }
try { state.view="protocols"; PROTOCOLS.forEach(pr => { protoState.open = pr.id; render(); }); protoState.open=null;
  ok("render all protocols", true); } catch(e){ ok("render all protocols", false, e.message); }

console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
