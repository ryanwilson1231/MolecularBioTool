console.log("\n== shelf awareness ==");
{
  state.reagents.enzymes = {};
  ok("untracked shelf treats everything as owned", !tracksEnzymes() && ownsEnzyme("SbfI"));
  presetEnzymes();
  ok("preset ticks the common set", tracksEnzymes() && ownedEnzymes().length >= 20, ownedEnzymes().length + " enzymes");
  ok("owns a common enzyme", ownsEnzyme("EcoRI"));
  ok("does not own an uncommon one", !ownsEnzyme("SbfI"));
  const vs = seqOf(p);
  const prs = suggestEnzymePairs(vs, true, "ATGAAACGTGAAGATTTACTGGCACAAGCACGT".repeat(3), vs.length);
  ok("pairs carry an owned flag", prs.every(x => typeof x.owned === "boolean"));
  const ownedFirst = prs.findIndex(x => x.owned), unownedFirst = prs.findIndex(x => !x.owned);
  ok("owned pairs rank above unowned", unownedFirst === -1 || ownedFirst === -1 || ownedFirst < unownedFirst,
     "first owned at " + ownedFirst + ", first unowned at " + unownedFirst);
  ok("missing lists the enzymes to buy", prs.filter(x => !x.owned).every(x => x.missing.length > 0));
}

console.log("\n== oligo reuse ==");
{
  state.reagents.oligos = [];
  const primer = "TTTGAATTCATGGACTACAAGGACGACGATGACAAG";
  ok("no match on an empty shelf", findMatchingOligo(primer) === null);
  state.reagents.oligos.push({ id:uid(), name:"FLAG-F", seq:primer, conc:100, vol:200, loc:"box A", date:today() });
  ok("exact match found", (findMatchingOligo(primer)||{}).name === "FLAG-F");
  ok("match on the 3' end even with a different tail",
     (findMatchingOligo("TTTGGATCC" + primer.slice(9))||{}).name === "FLAG-F");
  ok("no false match on an unrelated primer", findMatchingOligo("ACGTACGTACGTACGTACGTACGT") === null);
}

console.log("\n== part sourcing ==");
{
  // give the fixture the annotations a user would have accepted from the pre-check
  if(!p.ann.length){
    autoAnnotate(seqOf(p), true, p.id).forEach(f => p.ann.push({ id:uid(), start:f.start, end:f.end,
      label:f.name, color:CAT_COLOR[f.cat]||PALETTE[0], kind:f.cat, strand:f.strand, how:f.how }));
  }
  ok("fixture has annotations to harvest", p.ann.length > 0, p.ann.length + " annotations");
  state.parts = [];
  harvestParts();
  ok("harvest pulls parts from labelled constructs", state.parts.length > 0, state.parts.length + " parts");
  ok("kinds are guessed", state.parts.some(x => x.kind !== "custom"),
     [...new Set(state.parts.map(x=>x.kind))].join(","));
  const fromStocked = state.parts.find(x => x.sourceId === p.id);
  ok("part from a construct with tubes is PCR-able", sourceOf(fromStocked).how === "pcr", sourceOf(fromStocked).label);
  const ghost = { name:"ghost", seq:"ATCGATCGATCGATCGATCGATCGATCGATCGTTAGGCAT", sourceId:null };
  ok("unknown sequence must be ordered", sourceOf(ghost).how === "order", sourceOf(ghost).label);
  // a part whose source construct exists only in silico is blocked
  const ip = { id:uid(), name:"pGhost", type:"dna", topology:"circular", seq:"ATGC".repeat(60), ann:[], stock:[],
               tags:[], created:today(), source:"", parents:[], inSilico:true, uniprot:"" };
  state.plasmids.push(ip);
  ok("in-silico source blocks PCR", sourceOf({ name:"x", seq:"ATGCATGCATGC", sourceId:ip.id }).how === "blocked");
  state.plasmids = state.plasmids.filter(x => x.id !== ip.id);
}

console.log("\n== multi-fragment assembly ==");
{
  const F = [
    { name:"pA", kind:"promoter", seq:"TAATACGACTCACTATAGGGAGACCACAACGGTTTCCCTCTAG" },
    { name:"pB", kind:"cds",      seq:"ATGGACTACAAGGACGACGATGACAAGGGTAGCGGTAGCGGTAGCGGT" },
    { name:"pC", kind:"tag",      seq:"CACCACCACCACCACCACTGAGATCCGGCTGCTAACAAAGCC" }
  ];
  const bbSeq = seqOf(p).slice(0, 600);
  const pieces = [{ name:"backbone", kind:"backbone", seq:bbSeq }].concat(F);
  const expected = pieces.map(x => x.seq).join("");

  const gib = assemblePieces(pieces, "gibson", { arm:25 });
  ok("gibson product is the pieces in order", gib.product === expected, gib.product.length + " bp");
  ok("short parts are not each given their own PCR", gib.primers.length < pieces.length,
     gib.primers.length + " primer pairs for " + pieces.length + " pieces");
  ok("adjacent short parts become one ordered fragment", gib.orders.length === 1,
     gib.orders.map(o => o.label).join(" | "));
  ok("that fragment covers all three short parts",
     gib.orders[0].label.split(" + ").length === 3, gib.orders[0].label);
  ok("the ordered fragment carries homology arms on both ends",
     gib.orders[0].orderSeq.length === gib.orders[0].len + 50,
     gib.orders[0].orderSeq.length + " ordered vs " + gib.orders[0].len + " payload");
  ok("the ordered fragment's payload is the three parts, in order",
     gib.orders[0].orderSeq.indexOf(F.map(f=>f.seq).join("")) === 25);
  ok("units account for the whole product",
     gib.units.reduce((s,u) => s + u.len, 0) === gib.product.length,
     gib.units.map(u => u.label + ":" + u.len).join(", "));
  ok("the backbone is obtained by digest, not PCR",
     gib.units[0].isBackbone && gib.units[0].mode === "digest", gib.units[0].mode);
  ok("annotations land inside the product", gib.ann.every(a => a.end < gib.product.length && a.end >= a.start));
  ok("each insert is annotated", F.every(f => gib.ann.some(a => a.label === f.name)));
  // the annotation for a part must point at that part's sequence
  let annBad = 0;
  F.forEach(f => { const a = gib.ann.find(x => x.label === f.name);
    if(!a || gib.product.slice(a.start, a.end + 1) !== f.seq) annBad++; });
  ok("part annotations point at the part's own bases", annBad === 0, annBad + " wrong");

  const gg = assemblePieces(pieces, "goldengate", { iis:"BsaI" });
  ok("golden gate picks one overhang per junction", gg.overhangs.length === pieces.length);
  const ohs = gg.overhangs.map(o => o.seq);
  ok("overhangs are 4 nt", ohs.every(o => o.length === 4), ohs.join(" "));
  ok("overhangs are unique", new Set(ohs).size === ohs.length, ohs.join(" "));
  ok("no overhang is palindromic", ohs.every(o => o !== revComp(o)), ohs.join(" "));
  ok("no overhang is another's reverse complement",
     ohs.every((o,i) => ohs.every((q,j) => i === j || o !== revComp(q))), ohs.join(" "));
  ok("golden gate product is unchanged by sliding the junctions", gg.product === expected);
  // rebuilding from the spans must reproduce the product, rotated to the first junction
  const L = gg.product.length;
  const sliceCyc = (a,b) => b > a ? gg.product.slice(a,b) : gg.product.slice(a) + gg.product.slice(0,b);
  const rebuilt = gg.spans.map(s => sliceCyc(s.start, s.end)).join("");
  const rot = gg.product.slice(gg.spans[0].start) + gg.product.slice(0, gg.spans[0].start);
  ok("pieces cut at the chosen overhangs reassemble into the product", rebuilt === rot,
     rebuilt.length + " vs " + rot.length);
  ok("each overhang really sits at its junction",
     gg.overhangs.every(o => (gg.product + gg.product).substr(o.at, 4) === o.seq));
  // every reverse primer must carry the downstream overhang on its 5' tail
  let ggBad = 0;
  gg.primers.forEach((pr, i) => {
    const next = gg.spans[(i+1) % gg.spans.length];
    const oh = (gg.product + gg.product).substr(next.start, 4);
    if(!pr.r.tail.endsWith(revComp(oh))) ggBad++;
    if(!pr.f.tail.startsWith("TTT" + ENZ.BsaI.s)) ggBad++;
  });
  ok("golden gate primers carry the BsaI site and the right overhang", ggBad === 0, ggBad + " wrong");
}

console.log("\n== route planning ==");
{
  state.parts = []; harvestParts();
  const items = state.parts.slice(0, 3).map(x => ({ partId:x.id, name:x.name, kind:x.kind, seq:x.seq, sourceId:x.sourceId }));
  const routes = planRoutes(p, items, null);
  ok("three routes offered", routes.length === 3, routes.map(r => r.key).join(", "));
  ok("routes are ranked", routes.every((r,i) => i === 0 || routes[i-1].score >= r.score),
     routes.map(r => r.key + ":" + r.score).join(" "));
  ok("every route costs money and days", routes.every(r => r.cost.money > 0 && r.cost.days > 0),
     routes.map(r => r.key + " " + Math.round(r.cost.money) + "/" + r.cost.days + "d").join("  "));
  ok("every route builds a product", routes.every(r => r.plan.product.length > seqOf(p).length * 0.5));
  const synth = routes.find(r => r.key === "synthesis");
  ok("the synthesis route orders the whole insert", synth.orders.length === 1, synth.orders.map(o=>o.name).join(","));
  // with short parts every route ends up ordering, so compare on parts long enough to amplify
  {
    const longItems = [
      { name:"L1", kind:"cds", seq:seqOf(p).slice(100, 500), sourceId:p.id },
      { name:"L2", kind:"cds", seq:seqOf(p).slice(500, 900), sourceId:p.id }
    ];
    const rs = planRoutes(p, longItems, null);
    const gib = rs.find(r => r.key === "gibson"), syn = rs.find(r => r.key === "synthesis");
    ok("amplifiable parts really are amplified", gib.plan.primers.length === 2,
       gib.plan.primers.length + " primer pairs, " + gib.plan.orders.length + " orders");
    ok("PCR beats synthesis on cost when the parts exist", gib.cost.money < syn.cost.money,
       Math.round(gib.cost.money) + " vs " + Math.round(syn.cost.money));
    ok("PCR beats synthesis on time", gib.cost.days < syn.cost.days,
       gib.cost.days + "d vs " + syn.cost.days + "d");
    ok("the cheaper route ranks first", rs[0].key !== "synthesis", rs.map(r=>r.key+":"+r.score).join(" "));
  }
  // a part with no source anywhere forces an order on every route
  const orphan = { name:"orphan", kind:"custom", seq:"ATCGATCGTTAGGCATCCGATTACGCATTGACCTAGGTTACGATCGATCGTAGCTAGCTAGCAT" };
  const r2 = planRoutes(p, [orphan], null);
  ok("an unsourceable part is flagged as an order on the assembly route",
     r2[0].pieces.some(x => (x.source||{}).how === "order") || r2.some(x => x.orders.length > 0));
}

console.log("\n== provenance ==");
{
  const before = state.plasmids.length;
  const vec = p;
  const kid = { id:uid(), name:"pChild", type:"dna", topology:"circular", uniprot:"", seq:seqOf(p), ann:[], stock:[],
    inSilico:true, tags:[], created:today(), source:"test",
    parents:[{ id:vec.id, name:vec.name, role:"backbone" }] };
  state.plasmids.push(kid);
  ok("child records its parent", kid.parents[0].id === vec.id);
  const bar = lineageBar(vec);
  ok("parent's lineage bar shows the child", bar.indexOf("pChild") !== -1);
  ok("child's lineage bar shows the parent", lineageBar(kid).indexOf(esc(vec.name)) !== -1);
  ok("a construct with no relatives shows no bar",
     lineageBar({ id:"zz", name:"lonely", parents:[] }) === "");
  state.plasmids = state.plasmids.filter(x => x.id !== kid.id);
  ok("cleanup", state.plasmids.length === before);
}

console.log("\n== consumption ==");
{
  state.reagents.enzymes.EcoRI = { units:500, loc:"box", exp:"", note:"" };
  const tube = p.stock[0];
  const volBefore = tube.vol;
  const used = [{ kind:"enzyme", name:"EcoRI", amount:1 },
                { kind:"template", name:p.name, id:p.id, amount:0.05 }];
  applyConsumption(used);
  ok("enzyme units decrease", state.reagents.enzymes.EcoRI.units === 490, state.reagents.enzymes.EcoRI.units + " U");
  ok("template volume decreases", p.stock[0].vol === volBefore - 1, p.stock[0].vol + " µL");
  state.reagents.enzymes.EcoRI.units = 0;
  applyConsumption([{ kind:"enzyme", name:"EcoRI", amount:1 }]);
  ok("units never go negative", state.reagents.enzymes.EcoRI.units === 0);
}

console.log("\n== new views render ==");
["parts","assemble","inventory","connect"].forEach(v => {
  try { state.view = v; render(); ok("render " + v, true); }
  catch(e){ ok("render " + v, false, e.message + " @ " + (e.stack||"").split("\n")[1]); }
});
["constructs","enzymes","oligos","cells","locations"].forEach(t => {
  try { state.view = "inventory"; invTab = t; render(); ok("inventory tab: " + t, true); }
  catch(e){ ok("inventory tab: " + t, false, e.message); }
});
try {
  state.connect.enabled = true; state.connect.optIn[p.id] = true;
  state.signals.push({ id:uid(), text:"Building a tagged version.", stage:"building", tags:["EGFP","FLAG tag"], date:today(), share:true });
  ["matches","signals","sharing","crowd"].forEach(t => { connectTab = t; state.view = "connect"; render(); });
  ok("all connect tabs render", true);
} catch(e){ ok("all connect tabs render", false, e.message + " @ " + (e.stack||"").split("\n")[1]); }
try {
  state.parts = []; harvestParts();
  asm = { backboneId:p.id, items:state.parts.slice(0,3).map(x => ({ partId:x.id, name:x.name, kind:x.kind, seq:x.seq, sourceId:x.sourceId })),
          cut:null, routes:null, pick:0, name:"" };
  state.view = "assemble"; render();
  asmRun(); render();
  [0,1,2].forEach(i => { asm.pick = i; render(); });
  ok("assemble results render for every route", true);
} catch(e){ ok("assemble results render for every route", false, e.message + " @ " + (e.stack||"").split("\n")[1]); }
console.log("\n== a single insert still gets classic restriction cloning ==");
try {
  state.view = "design";
  asm = { backboneId:p.id, cut:null, routes:null, pick:0, name:"",
          items:[{ partId:null, name:"t", kind:"custom",
                   seq:"ATGAAACGTGAAGATTTACTGGCACAAGCACGT".repeat(4), sourceId:null }] };
  asmRun();
  const keys = asm.routes.map(r => r.key);
  ok("restriction cloning is offered for one insert", keys.includes("restriction"), keys.join(", "));
  const rr = asm.routes.find(r => r.key === "restriction");
  ok("it names the enzyme pair in its title", /\(\w+ \+ \w+\)/.test(rr.title), rr.title);
  ok("it only uses enzymes that cut the vector once",
     sitesOf(rr.plan.pair.e5, seqOf(p), true).length === 1 && sitesOf(rr.plan.pair.e3, seqOf(p), true).length === 1);
  ok("neither enzyme cuts the insert",
     countSites(asm.items[0].seq, rr.plan.pair.e5) === 0 && countSites(asm.items[0].seq, rr.plan.pair.e3) === 0);
  ok("it produces a circular product bigger than the insert",
     rr.plan.product.length > asm.items[0].seq.length, bp(rr.plan.product.length));
  ok("its protocol mentions ligation", asmProtocol(rr).some(x => /Ligate/i.test(x)));
  // two inserts: restriction cloning is no longer on the menu
  asm.items.push({ partId:null, name:"u", kind:"custom", seq:"GGCACAAGCACGTGAAGTTTTCGGTAAACCG".repeat(3), sourceId:null });
  asm.routes = null; asmRun();
  ok("two inserts drop the restriction route", !asm.routes.some(r => r.key === "restriction"),
     asm.routes.map(r=>r.key).join(", "));
  asm.items.pop(); asm.routes = null; asmRun();
  asm.routes.forEach((r,i) => { asm.pick = i; render(); });
  ok("every single-insert route renders", true);
} catch(e){ ok("single-insert routes", false, e.message + " @ " + (e.stack||"").split("\n")[1]); }

console.log("\n" + pass + " passed, " + fail + " failed\n");
if(fail) process.exitCode = 1;

console.log("\n== part classification ==");
{
  const cases = [
    ["T7 promoter","promoter"], ["T7 terminator","terminator"], ["CMV enhancer","promoter"],
    ["U6 promoter 3' end","promoter"], ["RBS (strong, T7g10)","element"], ["Kozak","element"],
    ["FLAG tag","tag"], ["6xHis tag","tag"], ["TEV cleavage site","tag"],
    ["AmpR (bla, TEM-1)","marker"], ["KanR / NeoR (nptII)","marker"],
    ["EGFP / GFP","cds"], ["SpCas9","cds"], ["ORF 256 aa (+)","cds"],
    ["pUC/pMB1 ori","origin"], ["GS linker","linker"], ["loxP","element"], ["P2A","element"]
  ];
  let bad = [];
  cases.forEach(([label, want]) => { const got = guessKind(label); if(got !== want) bad.push(label + " -> " + got + " (want " + want + ")"); });
  ok("part kinds are guessed correctly", bad.length === 0, bad.join("; "));
}
console.log("\n" + pass + " passed, " + fail + " failed\n");

console.log("\n== a tag next to an ORF rides in the primer, it does not get synthesised ==");
{
  const seq = seqOf(p);
  const orfSeq = seq.slice(80, 860);              // long, and it lives in a construct with tubes
  const pieces = [
    { name:"backbone", kind:"backbone", seq: seq.slice(0,600), source:{how:"digest"} },
    { name:"FLAG", kind:"tag", seq:"GACTACAAGGACGACGATGACAAG", source:{how:"pcr", label:"x"} },
    { name:"ORF",  kind:"cds", seq:orfSeq,                     source:{how:"pcr", label:"PCR from demo"} },
    { name:"His",  kind:"tag", seq:"CACCACCACCACCACCAC",       source:{how:"pcr", label:"x"} }
  ];
  const g = assemblePieces(pieces, "gibson", { arm:25 });
  ok("one PCR, nothing ordered", g.primers.length === 1 && g.orders.length === 0,
     g.primers.length + " PCR, " + g.orders.length + " orders");
  const u = g.units.find(x => !x.isBackbone);
  ok("the tags join the ORF's unit", u.idxs.length === 3, u.label);
  ok("the unit is PCR, not order", u.mode === "pcr", u.mode);
  ok("the ORF is the amplified core", g.primers[0].amplicon === orfSeq.length,
     g.primers[0].amplicon + " vs " + orfSeq.length);
  const pr = g.primers[0];
  ok("the forward primer carries FLAG in its tail", pr.f.tail.indexOf("GACTACAAGGACGACGATGACAAG") !== -1, pr.f.tail);
  ok("the reverse primer carries His in its tail",
     pr.r.tail.indexOf(revComp("CACCACCACCACCACCAC")) !== -1, pr.r.tail);
  ok("the forward anneal really is the ORF's 5' end", orfSeq.startsWith(pr.f.anneal), pr.f.anneal);
  ok("the reverse anneal really is the ORF's 3' end", orfSeq.endsWith(revComp(pr.r.anneal)), pr.r.anneal);
  ok("over-long primers are flagged", pr.f.full.length <= 60 || pr.f.warn.some(w => /ultramer/.test(w)),
     pr.f.full.length + " nt: " + pr.f.warn.join("; "));
  ok("the product still contains every part in order",
     g.product === pieces.map(x => x.seq).join(""));
  // and a tag with nowhere to ride still gets ordered
  const lonely = [pieces[0], { name:"FLAG", kind:"tag", seq:"GACTACAAGGACGACGATGACAAG", source:{how:"pcr",label:"x"} }];
  const g2 = assemblePieces(lonely, "gibson", { arm:25 });
  ok("a short part with no core to ride on is ordered", g2.orders.length === 1, JSON.stringify(g2.units.map(x=>x.label+":"+x.mode)));
}

/* ---------------------------------------------------------------------------
   Every primer a route hands you has to be a thing you can actually order.
   sliceCyc(a, a) means "all the way round the plasmid", which is right for a
   unit's own span and wrong for an empty lead/trail: a core with no riders
   either side used to get the entire product welded into its tail, producing
   ~1.8 kb "primers" on the Gibson and Golden Gate routes. The older assertion
   above missed it because an over-long primer also raises an ultramer warning,
   and it accepted either. This one accepts no excuses.
   --------------------------------------------------------------------------- */
console.log("\n== primers are orderable on every route ==");
{
  const MAX_OLIGO = 100;        // beyond this no vendor sells it as a plain oligo
  const vecSeq = seqOf(state.plasmids[0]);
  const orf = "ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACTAA";

  // a donor that physically contains the ORF, so PCR is a genuine option
  const donor = { id:"t_donor", name:"donor", type:"dna", topology:"circular",
    seq: vecSeq.slice(0,200) + orf + vecSeq.slice(200), ann:[], tags:[], note:"",
    stock:[{ id:"ts", ug:3, conc:100, loc:"x", date:"2026-01-01" }], created:Date.now() };
  state.plasmids.push(donor);

  // THE case the old test never covered: one core piece, no riders either side
  const single = [{ partId:null, name:"ORF", kind:"orf", seq:orf, sourceId:"t_donor" }];
  const routes = planRoutes(state.plasmids[0], single, null);
  ok("a single-insert job produces routes", routes.length > 0, routes.length + " routes");

  let worst = 0, worstWhere = "";
  routes.forEach(r => {
    (r.plan.primers || []).forEach(x => ["f","r"].forEach(k => {
      if(x[k].full.length > worst){ worst = x[k].full.length; worstWhere = r.key + " " + x[k].name; }
    }));
  });
  ok("no route emits a primer longer than " + MAX_OLIGO + " nt", worst <= MAX_OLIGO,
     "longest " + worst + " nt (" + worstWhere + ")");

  routes.forEach(r => {
    (r.plan.primers || []).forEach(x => ["f","r"].forEach(k => {
      const pr = x[k];
      ok(r.key + ": " + k + " primer is tail+anneal and nothing else",
         pr.full === pr.tail + pr.anneal,
         pr.full.length + " vs " + pr.tail.length + "+" + pr.anneal.length);
      ok(r.key + ": " + k + " tail stays under 40 nt", pr.tail.length <= 40, pr.tail.length + " nt");
      ok(r.key + ": " + k + " primer is clean DNA", /^[ACGT]+$/.test(pr.full));
      ok(r.key + ": " + k + " anneal is 15-40 nt", pr.anneal.length >= 15 && pr.anneal.length <= 40,
         pr.anneal.length + " nt");
      ok(r.key + ": " + k + " Tm is in the usable band", pr.tm >= 50 && pr.tm <= 72, pr.tm + " C");
    }));
  });

  // the Gibson arms must be real homology to the neighbour, not filler
  const gib = routes.find(r => r.key === "gibson");
  if(gib && gib.plan.primers.length){
    const pr = gib.plan.primers[0];
    ok("gibson: the forward arm is homology to the product",
       gib.plan.product.indexOf(pr.f.tail) !== -1, pr.f.tail);
    ok("gibson: the reverse arm is homology to the product",
       gib.plan.product.indexOf(revComp(pr.r.tail)) !== -1, pr.r.tail);
    ok("gibson: the forward anneal is the insert's 5' end", orf.startsWith(pr.f.anneal), pr.f.anneal);
    ok("gibson: the reverse anneal is the insert's 3' end", orf.endsWith(revComp(pr.r.anneal)), pr.r.anneal);
  }

  // and an empty lead/trail really is empty, checked at the source
  const pieces = [
    { name:"backbone", kind:"backbone", seq: vecSeq, source:{ how:"digest" } },
    { name:"ORF", kind:"orf", seq: orf, source:{ how:"pcr", label:"PCR from donor" } }
  ];
  const g = assemblePieces(pieces, "gibson", { arm:25 });
  const core = g.units.find(u => !u.isBackbone);
  ok("a core with no riders has no lead or trail", core.lead.length === 0 && core.trail.length === 0,
     "lead " + core.lead.length + ", trail " + core.trail.length);
  ok("so its tails are exactly one 25 bp arm", g.primers[0].f.tail.length === 25 && g.primers[0].r.tail.length === 25,
     g.primers[0].f.tail.length + " / " + g.primers[0].r.tail.length);

  state.plasmids.pop();
}

console.log("\n" + pass + " passed, " + fail + " failed\n");
