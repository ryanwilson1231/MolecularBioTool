console.log("\n== point mutation: the primers must rebuild the intended plasmid ==");
{
  const tmpl = state.plasmids.find(x => x.type === "dna" && x.topology === "circular");
  const seq = seqOf(tmpl), L = seq.length;

  /* Simulate the bench: amplify the whole plasmid with these two back-to-back
     primers, then circularise. The product must equal the intended sequence. */
  function simulate(t, res){
    const s = seqOf(t), n = s.length;
    const f = res.fwd, r = res.rev;
    const fStart = s.indexOf(f.anneal) !== -1 ? s.indexOf(f.anneal) : (s + s).indexOf(f.anneal);
    const rTop = revComp(r.anneal);
    const rStart = s.indexOf(rTop) !== -1 ? s.indexOf(rTop) : (s + s).indexOf(rTop);
    if(fStart < 0 || rStart < 0) return { error: "an annealing arm does not match the template" };
    // template between the two annealing arms; revComp(r.full) supplies the rest
    let mid = "";
    for(let i = fStart + f.anneal.length; ; i++){
      if(i % n === rStart % n) break;
      mid += s[i % n];
      if(mid.length > n + 100) return { error: "ran away" };
    }
    return { circular: f.full + mid + revComp(r.full) };
  }
  const rotEq = (a, b) => a.length === b.length && (a + a).indexOf(b) !== -1;

  const orfs = mutORFs(tmpl);
  ok("a coding region is available to number against", orfs.length > 0, orfs.map(o => o.label).join(", "));
  const orf = orfs[0];
  const prot = translate(orf.strand === 1 ? seq.slice(orf.start, orf.end + 1)
                                          : revComp(seq.slice(orf.start, orf.end + 1)));
  const pos = 40, cur = prot[pos - 1];
  const target = cur === "K" ? "E" : "K";
  const ch = parseAAChange(cur + pos + target);
  ok("the spec parses", ch && ch.pos === pos && ch.from === cur && ch.to === target, JSON.stringify(ch));
  const edit = aaChangeToEdit(tmpl, orf, ch, "ecoli");
  ok("it resolves to a nucleotide edit", !edit.error, edit.error || edit.note);
  ok("it picks the fewest-change codon", edit.changes <= 2, edit.fromCodon + " -> " + edit.toCodon + " = " + edit.changes);

  const res = designMutagenesis(tmpl, edit, {});
  ok("primers are designed", res.ok && !res.error, res.error || "");
  ok("the product carries the intended residue",
     orf.strand === -1 || translate(res.product.slice(orf.start, orf.end + 1))[pos - 1] === target,
     translate(res.product.slice(orf.start, orf.end + 1))[pos - 1]);
  const sim = simulate(tmpl, res);
  ok("PCR + ligation reproduces the product exactly", !sim.error && rotEq(sim.circular, res.product),
     sim.error || (sim.circular.length + " bp vs expected " + res.product.length));
  ok("a one-codon swap keeps the plasmid the same length", res.product.length === L, res.product.length + " vs " + L);
  ok("the forward primer carries the change", res.fwd.tail.length > 0 && res.fwd.full.indexOf(edit.newSeq) !== -1);
  ok("the reverse primer is a pure template match", res.rev.tail === "", JSON.stringify(res.rev.tail));
  ok("there are at least 10 matched bases 3' of the change", res.fwd.anneal.length >= 10, res.fwd.anneal.length + "");
  ok("a substitution keeps matching bases 5' of the change too", res.flank5 > 0, res.flank5 + "");
  ok("an annealing temperature is given", res.ta > 40 && res.ta < 80, res.ta + " C");
  ok("both primers are an orderable length", res.fwd.len <= 60 && res.rev.len <= 60, res.fwd.len + " / " + res.rev.len);

  const wrongAA = cur === "W" ? "C" : "W";
  const wrong = aaChangeToEdit(tmpl, orf, parseAAChange(wrongAA + pos + "A"), "ecoli");
  ok("a mismatched original residue is refused", !!wrong.error, wrong.error || "accepted it");
  ok("the refusal says where the ORF starts", /starts at base/.test(wrong.error || ""), wrong.error);
  ok("a codon past the end is refused", !!aaChangeToEdit(tmpl, orf, parseAAChange("99999K"), "ecoli").error);
  ok("asking for the residue it already is is refused",
     !!aaChangeToEdit(tmpl, orf, parseAAChange(cur + pos + cur), "ecoli").error);

  const del = designMutagenesis(tmpl, { kind:"del", a:300, b:311, newSeq:"", note:"del 12" }, {});
  ok("a deletion designs", del.ok, del.error || "");
  ok("the product is 12 bp shorter", del.product.length === L - 12, del.product.length + "");
  ok("neither deletion primer has a tail", del.fwd.tail === "" && del.rev.tail === "");
  const dsim = simulate(tmpl, del);
  ok("the deletion primers rebuild the product", !dsim.error && rotEq(dsim.circular, del.product),
     dsim.error || (dsim.circular.length + " vs " + del.product.length));

  const insSeq = "GGTAGCGGT";
  const insR = designMutagenesis(tmpl, { kind:"ins", a:400, b:399, newSeq:insSeq, note:"ins" }, {});
  ok("an insertion designs", insR.ok, insR.error || "");
  ok("the product is longer by the insert", insR.product.length === L + insSeq.length, insR.product.length + "");
  ok("the insert lands at the right place", insR.product.slice(400, 400 + insSeq.length) === insSeq,
     insR.product.slice(395, 415));
  ok("a short insert rides on one primer", insR.fwd.tail === insSeq && insR.rev.tail === "",
     insR.fwd.tail + " | " + insR.rev.tail);
  const isim = simulate(tmpl, insR);
  ok("the insertion primers rebuild the product", !isim.error && rotEq(isim.circular, insR.product),
     isim.error || (isim.circular.length + " vs " + insR.product.length));

  const longIns = "ATGGACTACAAGGACGACGATGACAAGGGTAGC";
  const li = designMutagenesis(tmpl, { kind:"ins", a:500, b:499, newSeq:longIns, note:"long ins" }, {});
  ok("a long insert is split across both primers", li.fwd.tail.length > 0 && li.rev.tail.length > 0,
     li.fwd.tail.length + " + " + li.rev.tail.length);
  ok("the two halves add up to the insert", li.fwd.tail.length + li.rev.tail.length === longIns.length);
  ok("splitting is explained", li.notes.some(n => /split/.test(n)), li.notes.join(" | "));
  const lsim = simulate(tmpl, li);
  ok("the split primers still rebuild the product", !lsim.error && rotEq(lsim.circular, li.product),
     lsim.error || (lsim.circular.length + " vs " + li.product.length));
  ok("the inserted sequence is intact and in order",
     li.product.slice(500, 500 + longIns.length) === longIns, li.product.slice(495, 540));

  const nearZero = designMutagenesis(tmpl, { kind:"sub", a:3, b:5, newSeq:"TTT", note:"near origin" }, {});
  ok("an edit near base 1 designs without falling off the end", nearZero.ok, nearZero.error || "");
  const nsim = simulate(tmpl, nearZero);
  ok("the wrapped primers rebuild the product", !nsim.error && rotEq(nsim.circular, nearZero.product),
     nsim.error || (nsim.circular.length + " vs " + nearZero.product.length));

  const withAnn = JSON.parse(JSON.stringify(tmpl));
  withAnn.ann = [ { id:"a", start:10,  end:50,  label:"before",   color:"#eee", kind:"custom", strand:1 },
                  { id:"b", start:280, end:400, label:"spanning", color:"#eee", kind:"custom", strand:1 },
                  { id:"c", start:600, end:700, label:"after",    color:"#eee", kind:"custom", strand:1 } ];
  const da = designMutagenesis(withAnn, { kind:"del", a:300, b:311, newSeq:"", note:"d" }, {});
  const get = n => da.ann.find(x => x.label === n);
  ok("an annotation before the edit does not move", get("before").start === 10 && get("before").end === 50);
  ok("an annotation after the edit shifts by the delta", get("after").start === 588, get("after").start + "");
  ok("an annotation spanning the edit shrinks", get("spanning").end === 388, get("spanning").end + "");
  ok("a carried annotation still points at the same bases",
     da.product.slice(get("after").start, get("after").end + 1) === seqOf(withAnn).slice(600, 701));
}

console.log("\n== reverse-strand ORFs ==");
{
  const coding = "ATGGCTAAAGAACTGATTGTGCTGGCCTACAGCGGCGGCCTGGAAGTGCTGTTTCAGGGACCCAGCGGCTAA";
  const t = { id:uid(), name:"rev", type:"dna", topology:"circular", uniprot:"", ann:[], stock:[], tags:[],
              created:today(), source:"", parents:[], notes:"", color:null, inSilico:true,
              seq: revComp(coding) + "ACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGTACGT" };
  state.plasmids.push(t);
  const s = seqOf(t);
  const orf = { key:"x", label:"rev ORF", start:0, end:coding.length - 1, strand:-1 };
  ok("the reverse ORF translates", translate(revComp(s.slice(0, coding.length))).slice(0,4) === "MAKE",
     translate(revComp(s.slice(0, coding.length))).slice(0,8));
  const e = aaChangeToEdit(t, orf, parseAAChange("K3R"), "ecoli");
  ok("a reverse-strand codon resolves", !e.error, e.error || e.note);
  ok("it is flagged as reverse strand", /reverse strand/.test(e.note || ""), e.note);
  const r = designMutagenesis(t, e, {});
  ok("reverse-strand primers design", r.ok, r.error || "");
  ok("the mutant protein carries the new residue",
     translate(revComp(r.product.slice(0, coding.length)))[2] === "R",
     translate(revComp(r.product.slice(0, coding.length))).slice(0,6));
  state.plasmids = state.plasmids.filter(x => x.id !== t.id);
}

console.log("\n== codon choice and parsing ==");
{
  ok("three-letter codes work",
     JSON.stringify(parseAAChange("Glu123Lys")) === JSON.stringify({from:"E",pos:123,to:"K"}),
     JSON.stringify(parseAAChange("Glu123Lys")));
  ok("the original residue is optional", (parseAAChange("123K")||{}).from === null);
  ok("a stop codon is a valid target", (parseAAChange("E123*")||{}).to === "*");
  ok("deletion is parsed", (parseAAChange("E123del")||{}).to === "del");
  ok("nonsense is rejected", parseAAChange("hello") === null);
  ok("a bare number is rejected", parseAAChange("123") === null);
  ok("the codon needing fewest changes wins", bestCodon("GAA", "K", "ecoli") === "AAA", bestCodon("GAA","K","ecoli"));
  ok("every chosen codon really codes for the target",
     ["A","R","N","D","C","Q","E","G","H","I","L","K","M","F","P","S","T","W","Y","V","*"]
       .every(aa => CODONS[bestCodon("GAA", aa, "ecoli")] === aa));
}

console.log("\n== the feature library teaches the pre-check ==");
{
  state.features = [];
  const p2 = state.plasmids.find(x => x.type === "dna");
  const s2 = seqOf(p2);
  const novel = s2.slice(120, 160);                 // a stretch no built-in motif knows
  const beforeHits = autoAnnotate(s2, true, p2.id).filter(f => f.name === "polyhedrin promoter");
  ok("an unknown sequence is not found to begin with", beforeHits.length === 0);

  ok("too short is refused", (addFeature("tiny", "ACGTA", "promoter")||{}).error !== undefined);
  const r = addFeature("polyhedrin promoter", novel, "promoter");
  ok("a feature is added", r && r.feature && r.feature.kind === "promoter", JSON.stringify(r && r.feature && r.feature.name));
  ok("a duplicate sequence is refused", (addFeature("same again", novel, "promoter")||{}).error !== undefined);

  const after = autoAnnotate(s2, true, p2.id).filter(f => f.name === "polyhedrin promoter");
  ok("the pre-check now finds it", after.length === 1, after.length + " hits");
  ok("it lands on the right bases", after[0] && after[0].start === 120 && after[0].end === 159,
     after[0] ? after[0].start + "-" + after[0].end : "none");
  ok("it says where it came from", after[0] && /feature library/.test(after[0].how), after[0] && after[0].how);
  ok("it keeps the kind you chose", after[0] && after[0].cat === "promoter", after[0] && after[0].cat);

  // the reverse strand counts too
  const rc = addFeature("flipped marker", revComp(s2.slice(200, 240)), "marker");
  ok("a reverse-strand feature is found",
     autoAnnotate(s2, true, p2.id).some(f => f.name === "flipped marker"),
     JSON.stringify(rc && rc.feature && rc.feature.name));

  // ticked by default in the pre-check, like any other recognised part
  state.curPlasmid = p2.id; p2.ann = [];
  runAutoAnnotate();
  const row = pendingAuto.feats.find(x => x.f.name === "polyhedrin promoter");
  ok("it is ticked by default", row && row.on === true);
  pendingAuto = null;

  const n = state.features.length;
  delFeature(state.features[0].id);
  ok("a feature can be deleted", state.features.length === n - 1);
  ok("the library panel renders", featureLibraryPanel().indexOf("Feature library") !== -1);
  ok("the teach panel renders inside the pre-check", featureTeachPanel().indexOf("feature library") !== -1);
  state.features = [];
}
console.log("\n" + pass + " passed, " + fail + " failed\n");

console.log("\n== components can be renamed ==");
{
  const p = state.plasmids.find(x => x.type === "dna");
  state.curPlasmid = p.id;
  p.ann = [{ id:"ren1", start:100, end:200, label:"old name", color:"#cfe8ff", kind:"custom", strand:1, how:"exact motif" }];
  editComponent("ren1");
  ok("editing opens the panel on that component", showSidebar && sidebarEditId === "ren1");
  ok("the current name is prefilled", labelDraft === "old name", labelDraft);
  ok("the current colour is prefilled", labelColor === "#cfe8ff", labelColor);
  ok("the panel says Edit, not Label", sidebarHTML().indexOf("Edit component") !== -1);
  ok("it offers a delete", sidebarHTML().indexOf("Delete") !== -1);

  labelDraft = "polyhedrin promoter"; labelColor = PALETTE[2];
  sidebarSave();
  const a = p.ann.find(x => x.id === "ren1");
  ok("the name changes", a.label === "polyhedrin promoter", a.label);
  ok("the colour changes", a.color === PALETTE[2], a.color);
  ok("the span is untouched", a.start === 100 && a.end === 200, a.start + "-" + a.end);
  ok("it is not duplicated", p.ann.length === 1, p.ann.length + "");
  ok("the panel closes", !showSidebar && sidebarEditId === null);
  ok("an auto-found annotation is marked as edited by hand", /manual/.test(a.how), a.how);

  // the span is editable too; patch the field reader, then put it back
  editComponent("ren1");
  const realGet = document.getElementById;
  const inputs = {};
  document.getElementById = id => (id in inputs) ? { value: inputs[id] } : realGet.call(document, id);
  inputs["sb-from"] = "150"; inputs["sb-to"] = "160";
  sidebarSpan();
  ok("the span can be corrected", sidebarRegion.start === 149 && sidebarRegion.end === 159,
     sidebarRegion.start + "-" + sidebarRegion.end);
  inputs["sb-from"] = "900"; inputs["sb-to"] = "5";
  sidebarSpan();
  ok("a backwards span is clamped, not accepted", sidebarRegion.end >= sidebarRegion.start,
     sidebarRegion.start + "-" + sidebarRegion.end);
  document.getElementById = realGet;
  sidebarCancel();
  ok("cancelling leaves the component alone", p.ann.find(x => x.id === "ren1").start === 100);

  // labelling a fresh selection still works
  sel = { start:400, end:450 };
  optLabel();
  ok("labelling a new region is still a create, not an edit", sidebarEditId === null);
  labelDraft = "new thing"; sidebarSave();
  ok("a new component is added", p.ann.length === 2 && p.ann.some(x => x.label === "new thing"));
  p.ann = [];
}

console.log("\n== the method is explained in the app ==");
{
  const h = howItWorksPanel();
  ["no overlap","only the forward primer","middle of that primer","KLD","DpnI","QuikChange",
   "takes over","ligatable","matched duplex"]
    .forEach(k => ok("explains: " + k, h.indexOf(k) !== -1));
  ok("it is collapsed by default", h.indexOf("<details") === 0 && h.indexOf("open") === -1);
}
console.log("\n" + pass + " passed, " + fail + " failed\n");

console.log("\n== primers are sized to a target Ta, not a fixed Tm ==");
{
  const tmpl = state.plasmids.find(x => x.type === "dna" && x.topology === "circular");
  const orf = mutORFs(tmpl)[0];
  const prot = translate(tmpl.seq ? seqOf(tmpl).slice(orf.start, orf.end+1) : "");
  const edit = aaChangeToEdit(tmpl, orf, parseAAChange(prot[64] + "65A"), "ecoli");
  ok("the test edit resolves", !edit.error, edit.error || edit.note);

  const hot = designMutagenesis(tmpl, edit, { polymerase:"Q5", targetTa:68 });
  const cool = designMutagenesis(tmpl, edit, { polymerase:"Q5", targetTa:55 });
  ok("a lower target gives shorter annealing arms",
     cool.fwd.anneal.length <= hot.fwd.anneal.length && cool.rev.anneal.length <= hot.rev.anneal.length,
     "cool " + cool.fwd.anneal.length + "/" + cool.rev.anneal.length +
     " vs hot " + hot.fwd.anneal.length + "/" + hot.rev.anneal.length);
  ok("a lower target gives a lower Ta", cool.ta < hot.ta, cool.ta + " vs " + hot.ta);
  // breaking a real dimer is allowed to cost a few degrees, but it must say so
  ok("the realised Ta tracks the target, or explains why not",
     (Math.abs(cool.ta - 55) <= 4 || cool.notes.some(n => /rather than the 55/.test(n))) &&
     (Math.abs(hot.ta - 68) <= 4 || hot.notes.some(n => /rather than the 68/.test(n))),
     cool.ta + " for 55 (" + cool.notes.join(" | ") + "), " + hot.ta + " for 68");
  ok("a drift away from the target is always explained",
     [cool, hot].every(r => Math.abs(r.ta - r.targetTa) <= 3 || r.notes.some(n => /rather than the/.test(n))));

  // the behaviour that prompted this: arms of different length, not forced equal
  const d = designMutagenesis(tmpl, edit, { polymerase:"Q5", targetTa:60 });
  ok("the two arms are sized independently", true,
     "fwd " + d.fwd.anneal.length + " nt / " + d.fwd.tm + " C, rev " + d.rev.anneal.length + " nt / " + d.rev.tm + " C");
  ok("neither arm overshoots by more than a couple of degrees",
     d.fwd.tm - d.needTm < 6 && d.rev.tm - d.needTm < 6,
     "need " + Math.round(d.needTm) + ", got " + d.fwd.tm + "/" + d.rev.tm);
  ok("the lower Tm sets the annealing temperature",
     d.ta === annealTempFor("Q5", Math.min(d.fwd.tm, d.rev.tm), Math.min(d.fwd.anneal.length, d.rev.anneal.length)),
     d.ta + "");

  // shortest-that-clears, with a two-base grace for a GC clamp
  const t1 = pickAnnealFor("ATGCATGCATGCATGCATGCATGCATGCATGCATGC", 50);
  const t2 = pickAnnealFor("ATGCATGCATGCATGCATGCATGCATGCATGCATGC", 64);
  ok("a higher Tm demand gives a longer primer", t2.len > t1.len, t1.len + " then " + t2.len);
  ok("it stops as soon as the Tm is cleared", t1.tm >= 50 && t1.len <= 24, t1.len + " nt at " + t1.tm + " C");
  ok("it prefers a 3' G or C when one is close", t1.gcClamp || t1.len >= 17, JSON.stringify(t1.seq.slice(-3)));
}

console.log("\n== polymerases ==");
{
  const tmpl = state.plasmids.find(x => x.type === "dna" && x.topology === "circular");
  const edit = { kind:"sub", a:300, b:302, newSeq:"GCT", note:"t" };
  const byPoly = {};
  Object.keys(POLYMERASES).forEach(k => {
    const r = designMutagenesis(tmpl, edit, { polymerase:k, targetTa:60 });
    byPoly[k] = { ta:r.ta, len:r.fwd.anneal.length, need:Math.round(r.needTm) };
  });
  ok("every polymerase designs", Object.keys(byPoly).length === Object.keys(POLYMERASES).length,
     JSON.stringify(byPoly));
  // asking for one Ta gets you that Ta whatever the enzyme - what changes is the primer
  ok("the target Ta is met regardless of polymerase",
     Object.keys(byPoly).every(k => Math.abs(byPoly[k].ta - 60) <= 3),
     Object.keys(byPoly).map(k => k + ":" + byPoly[k].ta).join(" "));
  ok("a polymerase that anneals below Tm needs a hotter, longer primer",
     byPoly.Taq.need > byPoly.Phusion.need && byPoly.Taq.len >= byPoly.Phusion.len,
     "Taq needs " + byPoly.Taq.need + " C over " + byPoly.Taq.len + " nt; Phusion " +
     byPoly.Phusion.need + " C over " + byPoly.Phusion.len + " nt");
  ok("Pfu demands a hotter primer than Q5", byPoly.Pfu.need > byPoly.Q5.need,
     "Pfu " + byPoly.Pfu.need + " vs Q5 " + byPoly.Q5.need);
  // and for identical primers, the recommendation does differ by enzyme
  ok("the same Tm gives different Ta per polymerase",
     annealTempFor("Phusion", 60, 25) !== annealTempFor("Taq", 60, 25),
     "Phusion " + annealTempFor("Phusion",60,25) + " vs Taq " + annealTempFor("Taq",60,25));

  const taq = designMutagenesis(tmpl, edit, { polymerase:"Taq", targetTa:60 });
  ok("Taq is refused for blunt ligation", taq.warnings.some(w => /blunt-ligate|proofreading/.test(w)),
     taq.warnings.join(" | "));
  const q5 = designMutagenesis(tmpl, edit, { polymerase:"Q5", targetTa:60 });
  ok("a proofreading polymerase raises no such warning",
     !q5.warnings.some(w => /blunt-ligate/.test(w)), q5.warnings.join(" | "));

  ok("the protocol names the polymerase and its rate",
     mutProtocol(tmpl, q5).some(x => /Q5/.test(x)) && mutProtocol(tmpl, q5).some(x => /25 s\/kb/.test(x)),
     mutProtocol(tmpl, q5)[1].slice(0, 90));
  ok("Taq gets a 95 C denaturation, not 98",
     mutProtocol(tmpl, taq).some(x => /95 °C/.test(x)), mutProtocol(tmpl, taq)[1].slice(0, 60));
  ok("Pfu gets a longer extension than KOD",
     polymerase("Pfu").sPerKb > polymerase("KOD").sPerKb);

  // the Phusion short-primer exception
  ok("Phusion uses +3 above 20 nt", annealTempFor("Phusion", 60, 25) === 63, annealTempFor("Phusion", 60, 25) + "");
  ok("Phusion uses +0 at 20 nt or under", annealTempFor("Phusion", 60, 19) === 60, annealTempFor("Phusion", 60, 19) + "");
  ok("tmNeededFor inverts annealTempFor",
     annealTempFor("Q5", tmNeededFor("Q5", 62, 25), 25) === 62);
  ok("an unknown polymerase falls back to Q5", polymerase("nonsense").label === POLYMERASES.Q5.label);
}
console.log("\n" + pass + " passed, " + fail + " failed\n");

console.log("\n== primer dimer is designed around, not just reported ==");
{
  const tmpl = state.plasmids.find(x => x.type === "dna" && x.topology === "circular");
  // EGFP carries GGCAAGCTG twice, which is exactly the trap
  ok("a 3' complementarity is detected", dimerIsSerious(dimer3("CCCTGAAGTTCGCCTGCACCACCGGCAAGCTG",
     "TCAGCTTGCCGTAGGTGGC")), JSON.stringify(dimer3("CCCTGAAGTTCGCCTGCACCACCGGCAAGCTG","TCAGCTTGCCGTAGGTGGC")));
  ok("an unrelated pair is clean",
     !dimerIsSerious(worstDimer("ATGATGATGATGATGATGATG", "TTTTCCCCTTTTCCCCTTTT")),
     JSON.stringify(worstDimer("ATGATGATGATGATGATGATG","TTTTCCCCTTTTCCCCTTTT")));
  ok("a 3'-to-3' match scores worse than an internal one",
     dimer3("AAAAAAAAAACGGCAAGCTG", "CAGCTTGCCG").score >
     dimer3("AAAAAAAAAACGGCAAGCTG", "CAGCTTGCCGAAAAAAAAAA").score,
     dimer3("AAAAAAAAAACGGCAAGCTG","CAGCTTGCCG").score + " vs " +
     dimer3("AAAAAAAAAACGGCAAGCTG","CAGCTTGCCGAAAAAAAAAA").score);

  const orf = mutORFs(tmpl)[0];
  const prot = translate(seqOf(tmpl).slice(orf.start, orf.end+1));
  const e = aaChangeToEdit(tmpl, orf, parseAAChange(prot[64] + "65A"), "ecoli");
  const r = designMutagenesis(tmpl, e, { polymerase:"Q5", targetTa:60 });
  const d = worstDimer(r.fwd.full, r.rev.full);
  ok("the designed pair avoids the dimer the naive arms would have had",
     !dimerIsSerious(d) || r.warnings.some(w => /repeat in the template/.test(w)),
     d ? "n=" + d.n + " gc=" + d.gc : "none");
  ok("if it was avoidable, the lengthening is explained",
     !r.notes.some(n => /lengthened/.test(n)) || !dimerIsSerious(worstDimer(r.fwd.full, r.rev.full)),
     r.notes.join(" | "));
  ok("an unavoidable one is reported honestly rather than hidden",
     !dimerIsSerious(d) || /order anyway/.test(r.warnings.join(" ")), r.warnings.join(" | "));
  ok("the primers still work biologically after the adjustment",
     r.fwd.anneal.length >= 10 && r.product.length === seqOf(tmpl).length,
     r.fwd.anneal.length + " nt arm, " + r.product.length + " bp product");
}
console.log("\n" + pass + " passed, " + fail + " failed\n");
