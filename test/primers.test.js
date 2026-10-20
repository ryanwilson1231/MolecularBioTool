console.log("\n== splitting a Gibson primer into tail and annealing region ==");
{
  const p = state.plasmids.find(x => x.type === "dna" && x.topology === "circular");
  const s = seqOf(p), L = s.length;

  // a forward Gibson primer: 25 bp of homology from elsewhere, then 20 nt that anneal
  const arm = "ACGTTGCATCGATCGGATCCTTACG";
  const anneal = s.slice(300, 322);
  const gib = arm + anneal;
  let r = splitPrimer(gib, s, true);
  ok("the annealing region is found without trimming by hand", !r.error && r.anneal === anneal,
     r.error || (r.anneal + " (wanted " + anneal + ")"));
  ok("the tail is everything 5' of it", r.tail === arm, r.tail);
  ok("it is recognised as a Gibson primer", r.isGibson === true);
  ok("it is placed at the right position", r.start === 300 && r.end === 321, r.start + "-" + r.end);
  ok("on the forward strand", r.strand === 1);
  ok("the annealing Tm is reported, not the whole-primer Tm",
     Math.abs(r.annealTm - tmNN(anneal)) < 0.01 && r.fullTm > r.annealTm,
     "anneal " + r.annealTm + " vs full " + r.fullTm);

  // a reverse Gibson primer
  const rAnneal = revComp(s.slice(500, 522));
  const rGib = "TTGCCAGGATCCAATTGCCATTACG" + rAnneal;
  r = splitPrimer(rGib, s, true);
  ok("a reverse primer is placed on the reverse strand", !r.error && r.strand === -1, r.error || r.strand);
  ok("its annealing region is recovered", r.anneal === rAnneal, r.anneal);
  ok("its footprint is the region it covers", r.start === 500 && r.end === 521, r.start + "-" + r.end);
  ok("its 3' end is the left edge of that footprint", r.threePrime === 500, r.threePrime + "");

  // a plain primer with no tail
  r = splitPrimer(s.slice(700, 724), s, true);
  ok("a plain primer has no tail", !r.error && r.tail === "", JSON.stringify(r.tail));
  ok("and is not called a Gibson primer", r.isGibson === false);

  // nonsense
  r = splitPrimer("TTTTTTTTTTTTTTTTTTTTTTTTGGGGGGGGGGGG", s, true);
  ok("a primer that does not belong is refused", !!r.error, r.error);
  r = splitPrimer("ACGT", s, true);
  ok("something too short to place is refused", !!r.error, r.error);

  // a primer spanning the origin of a circular template
  const wrapAnneal = s.slice(L - 12) + s.slice(0, 10);
  r = splitPrimer("GGCCTAAGCTTGGATCCAAGCTT" + wrapAnneal, s, true);
  ok("an annealing region crossing the origin is still found", !r.error && r.anneal === wrapAnneal,
     r.error || r.anneal);
}

console.log("\n== off-target binding sites ==");
{
  // a template with the same 3' end in two places, and a decoy with mismatches
  const site = "GGCATTACGTTGCACCTAGG";              // 20 nt, the real target
  const decoyWith2mm = "GGCATTACGTTGCACCTAGG".slice(0, 6) + "TT" + "GCATTACGTTGCACCTAGG".slice(7);
  const filler = n => "ATATATAGAGAGACACACTGTGTGT".repeat(Math.ceil(n/25)).slice(0, n);
  const seq = filler(200) + site + filler(300) + site + filler(200)
            + revComp(site) + filler(200);
  const p = { id:uid(), name:"otTest", type:"dna", topology:"circular", uniprot:"", seq, ann:[], stock:[],
              tags:[], created:today(), source:"", parents:[], notes:"", color:null, inSilico:true };

  const sites = primerSites(site, seq, true, {});
  ok("every exact occurrence is found", sites.filter(x => x.mismatches === 0).length === 3,
     sites.filter(x => x.mismatches === 0).length + " exact of " + sites.length);
  ok("both strands are searched",
     sites.some(x => x.strand === 1) && sites.some(x => x.strand === -1),
     sites.map(x => x.strand).join(","));
  const fwd = sites.filter(x => x.strand === 1 && x.mismatches === 0).map(x => x.start).sort((a,b)=>a-b);
  ok("forward sites are at the right positions", fwd[0] === 200 && fwd[1] === 520, fwd.join(","));
  const rev = sites.find(x => x.strand === -1 && x.mismatches === 0);
  ok("the reverse site is where the revcomp was planted", rev && rev.start === 740, rev && rev.start + "");
  ok("an exact site is scored as exact", sites[0].risk === "exact" && sites[0].terminal3 === site.length,
     sites[0].risk + " terminal3=" + sites[0].terminal3);

  // a 3'-perfect but 5'-mismatched site is the dangerous kind
  const mism = "TTTTTTTT" + site.slice(8);          // 8 mismatches at the 5' end, 3' end perfect
  const s2 = primerSites(mism, seq, true, { maxMismatch: 10 });
  const risky = s2.find(x => x.terminal3 >= 12);
  ok("a site with a perfect 3' end is found even with a bad 5' end", !!risky,
     s2.map(x => "mm" + x.mismatches + "/t3-" + x.terminal3).join(" "));
  ok("and the matching 3' run is measured", risky && risky.terminal3 === 12, risky && risky.terminal3 + "");
  ok("its risk is not dismissed as low", risky && risky.risk !== "low", risky && risky.risk);

  // a unique primer, taken from real non-repetitive sequence rather than the filler
  const real = state.plasmids.find(x => x.type === "dna" && x.topology === "circular");
  const rs = seqOf(real);
  const s3 = primerSites(rs.slice(400, 422), rs, true, {});
  ok("a unique primer has exactly one exact site", s3.filter(x => x.mismatches === 0).length === 1,
     s3.filter(x => x.mismatches === 0).length + " exact of " + s3.length);
}

console.log("\n== predicted products, wanted and unwanted ==");
{
  const site = "GGCATTACGTTGCACCTAGG";
  const filler = n => "ATATATAGAGAGACACACTGTGTGT".repeat(Math.ceil(n/25)).slice(0, n);
  // forward site at 200, reverse sites at 700 and 1400 -> two products
  const seq = filler(200) + site + filler(480) + revComp(site) + filler(680) + revComp(site) + filler(200);
  const tmpl = { id:uid(), name:"ampTest", type:"dna", topology:"circular", uniprot:"", seq, ann:[], stock:[],
                 tags:[], created:today(), source:"", parents:[], notes:"", color:null, inSilico:true };
  state.plasmids.push(tmpl);
  const res = analysePrimers([{ name:"F", seq:site }, { name:"R", seq:site }], tmpl, {});
  ok("both primers place", res.rows.every(r => !r.error), res.rows.map(r => r.error).join(" "));
  ok("more than one product is predicted", res.amplicons.length >= 2,
     res.amplicons.map(a => a.len).join(", "));
  ok("the same product is not listed twice", res.amplicons.length === 2,
     res.amplicons.map(a => a.start + "-" + a.end).join(", "));
  const lens = res.amplicons.map(a => a.len).sort((a,b) => a-b);
  ok("the shorter product is the expected one", lens[0] === 520, lens.join(","));
  ok("a second, longer product is flagged", lens[1] > lens[0], lens.join(","));
  ok("both are marked on-target because the sites are exact",
     res.amplicons.every(a => a.onTarget), "");
  ok("an annealing temperature is suggested", res.ta > 40 && res.ta < 80, res.ta + "");
  state.plasmids = state.plasmids.filter(x => x.id !== tmpl.id);
}

console.log("\n== where a Gibson tail comes from ==");
{
  const p = state.plasmids.find(x => x.type === "dna" && x.topology === "circular");
  const s = seqOf(p);
  const tail = s.slice(100, 125);
  const hit = whereDoesTailMatch(tail, null);
  ok("a tail is traced back to the construct it is homologous to",
     hit && hit.plasmid.id === p.id && hit.at === 100, hit ? hit.plasmid.name + "@" + hit.at : "not found");
  ok("a tail that matches nothing says so",
     whereDoesTailMatch("TTTTGGGGTTTTGGGGTTTTGGGGAAAA", null) === null);
}

console.log("\n== pasting primers in whatever format ==");
{
  const list = parsePrimerPaste([
    "ACGTACGTACGTACGTACGT",
    "myPrimer,GGCATTACGTTGCACCTAGG",
    "otherOne\tTTGCCAGGATCCAATTGCCA",
    ">namedFasta",
    "CCGGAATTCCGGAATTCCGG",
    "",
    "too short: ACGT"
  ].join("\n"));
  ok("a bare sequence is accepted", list.some(x => x.seq === "ACGTACGTACGTACGTACGT"));
  ok("comma-separated name and sequence", list.some(x => x.name === "myPrimer"), JSON.stringify(list.map(x=>x.name)));
  ok("tab-separated too", list.some(x => x.name === "otherOne"));
  ok("a FASTA header names the next line", list.some(x => x.name === "namedFasta"));
  ok("junk and short lines are dropped", list.length === 4, list.length + ": " + list.map(x=>x.name).join(","));
  ok("lower case and spaces are cleaned up",
     parsePrimerPaste("acgt acgt acgt acgt acgt")[0].seq === "ACGTACGTACGTACGTACGT",
     JSON.stringify(parsePrimerPaste("acgt acgt acgt acgt acgt")[0]));
}
console.log("\n" + pass + " passed, " + fail + " failed\n");

console.log("\n== the primers view ==");
{
  const t = state.plasmids.find(x => x.type === "dna" && x.topology === "circular");
  const s = seqOf(t);
  try {
    chooseProfile("everything");
    ok("Primers is a real tool", ALL_TOOLS.includes("primers") && toolVisible("primers"));
    ok("it is reachable from a profile",
       PROFILES.some(pr => !pr.tools || pr.tools.includes("primers")),
       PROFILES.filter(pr => pr.tools && pr.tools.includes("primers")).map(pr => pr.id).join(","));
    go("primers");
    primerState.mode = "analyse"; render();
    ok("the check view renders", true);

    // paste a Gibson pair the way a person would
    primerState.templateId = t.id;
    primerState.paste = "myF,GGCCTAAGCTTGGATCCAATTCCGG" + s.slice(300, 322) + "\n" +
                        "myR,TTGCCAGGATCCAATTGCCATTACG" + revComp(s.slice(600, 622));
    runPrimerCheck();
    const res = primerState.result;
    ok("both primers place without manual trimming", res.rows.every(r => !r.error),
       res.rows.map(r => r.error || "ok").join(" | "));
    ok("the forward tail is split off", res.rows[0].placed.tail.length === 25, res.rows[0].placed.tail);
    ok("the forward anneal is the template region", res.rows[0].placed.anneal === s.slice(300, 322));
    ok("the reverse one too", res.rows[1].placed.strand === -1 && res.rows[1].placed.start === 600,
       res.rows[1].placed.strand + "@" + res.rows[1].placed.start);
    // the real invariant: the product runs from the forward footprint to the reverse one.
    // Not a hard-coded size - if the tail's last base happens to match the template too,
    // the annealing region is genuinely one longer and the product one bigger.
    const F0 = res.rows[0].placed, R0 = res.rows[1].placed;
    ok("the expected product spans the two footprints",
       res.amplicons.length >= 1 && res.amplicons[0].len === R0.end - F0.start + 1,
       res.amplicons[0].len + " vs " + (R0.end - F0.start + 1));
    ok("the annealing region is the longest stretch that really matches",
       seqOf(t).slice(F0.start, F0.end + 1) === F0.anneal,
       F0.anneal.length + " nt at " + F0.start);
    ok("so a tail base that also matches is counted as annealing, not tail",
       F0.anneal.length >= 22 && F0.tail.length + F0.anneal.length === res.rows[0].seq.length,
       F0.tail.length + " + " + F0.anneal.length + " = " + res.rows[0].seq.length);
    ok("an annealing temperature comes out", res.ta > 40 && res.ta < 80, res.ta + "");
    render();
    ok("results render", document.getElementById("main").innerHTML.length > 0);

    // a primer that does not belong is reported, not crashed on
    primerState.paste = "junk,TTTTTTTTGGGGGGGGTTTTTTTTGGGGGGGG";
    runPrimerCheck(); render();
    ok("an unplaceable primer is reported cleanly",
       primerState.result.rows[0].error && primerState.result.rows[0].error.length > 0,
       primerState.result.rows[0].error);

    // design half
    primerState.mode = "design";
    primerState.fromId = t.id; primerState.fromStart = "100"; primerState.fromEnd = "400";
    primerState.intoId = t.id; primerState.intoAt = "700"; primerState.arm = 25;
    runPrimerDesign();
    ok("four primers are designed", !primerState.error && primerState.design &&
       !!primerState.design.plan.bbF && !!primerState.design.plan.insF,
       primerState.error || "ok");
    const q = primerState.design.plan;
    ok("the insert primers carry the homology arm",
       q.insF.tail.length === 25 && q.insR.tail.length === 25,
       q.insF.tail.length + "/" + q.insR.tail.length);
    ok("the vector primers have no tail", q.bbF.tail === "" && q.bbR.tail === "");
    render();
    ok("the design view renders", true);

    // and the hand-off back into checking
    checkDesignedPrimers();
    ok("designed primers can be checked in one click",
       primerState.mode === "analyse" && primerState.result && primerState.result.rows.length === 2,
       primerState.mode);
    ok("the vector primers place on the vector",
       primerState.result.rows.every(r => !r.error),
       primerState.result.rows.map(r => r.error || "ok").join(" | "));
  } catch(e){ ok("the primers view works", false, e.message + " @ " + (e.stack||"").split("\n")[1]); }
  primerState = { mode:"analyse", templateId:null, paste:"", result:null, error:null,
                  fromId:null, fromStart:"", fromEnd:"", intoId:null, intoAt:"", arm:25, design:null };
}
console.log("\n" + pass + " passed, " + fail + " failed\n");
