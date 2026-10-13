/* =========================================================================
   POINT MUTAGENESIS  (Q5 / KLD-style, back-to-back primers)

   The whole plasmid is amplified with two primers whose 5' ends sit next to
   each other, then KLD (kinase, ligase, DpnI) circularises the product and
   destroys the template. One edit replaces template[a..b] with newSeq:

       b = a-1  -> pure insertion before a
       newSeq="" -> deletion of a..b
       otherwise -> substitution

   Geometry, following NEB's guidance for the Q5 kit:
     substitution: the change sits INSIDE the forward primer with matching
                   sequence on both sides, so the ligated 5' end is a clean
                   match and the 3' end has >= 10 perfectly matched bases.
     insertion:    carried on the 5' tail of the forward primer; long inserts
                   are split across both primers so neither gets too long.
     deletion:     both primers match the template exactly, flanking the gap.
   ========================================================================= */

const MUT_MIN_3PRIME = 10, MUT_MAX_LEN = 45, MUT_DEFAULT_TA = 60;

/* a substring that may run off either end of a circular sequence */
function cycSub(seq, start, len){
  const L = seq.length; let out = "";
  for(let i = 0; i < len; i++) out += seq[((start + i) % L + L) % L];
  return out;
}
/* every codon that codes for an amino acid */
function codonsFor(aa){
  const out = [];
  for(const c in CODONS) if(CODONS[c] === aa) out.push(c);
  return out;
}
function ntDiff(a, b){ let n = 0; for(let i = 0; i < 3; i++) if(a[i] !== b[i]) n++; return n; }
/* Pick the codon for `aa` that is the smallest change from `from`.
   Fewer mismatches means a shorter, better-behaved primer; the host's
   preferred codon breaks ties. */
function bestCodon(from, aa, host){
  const pref = (host === "human" ? BACK_HUMAN : BACK_ECOLI)[aa];
  const opts = codonsFor(aa);
  if(!opts.length) return null;
  opts.sort((x, y) => ntDiff(from, x) - ntDiff(from, y)
    || (x === pref ? -1 : y === pref ? 1 : 0) || x.localeCompare(y));
  return opts[0];
}
const AA3 = { Ala:"A",Arg:"R",Asn:"N",Asp:"D",Cys:"C",Gln:"Q",Glu:"E",Gly:"G",His:"H",Ile:"I",
  Leu:"L",Lys:"K",Met:"M",Phe:"F",Pro:"P",Ser:"S",Thr:"T",Trp:"W",Tyr:"Y",Val:"V",Ter:"*",Stop:"*" };
function aaLetter(t){
  if(!t) return null;
  if(t.length === 1) return t.toUpperCase();
  const k = t[0].toUpperCase() + t.slice(1,3).toLowerCase();
  return AA3[k] || null;
}
/* "E123K", "Glu123Lys", "123K", "E123*", "E123del" */
function parseAAChange(str){
  const s = String(str || "").trim().replace(/\s+/g, "");
  const m = s.match(/^([A-Za-z]{1,3})?(\d+)([A-Za-z]{1,3}|\*|del)$/);
  if(!m) return null;
  const pos = parseInt(m[2], 10);
  if(!pos || pos < 1) return null;
  const toRaw = m[3];
  if(/^del$/i.test(toRaw)) return { from: aaLetter(m[1]), pos, to:"del" };
  const to = toRaw === "*" ? "*" : aaLetter(toRaw);
  if(!to) return null;
  return { from: m[1] ? aaLetter(m[1]) : null, pos, to };
}

/* Turn "E123K" on a given ORF into a nucleotide edit on the top strand. */
function aaChangeToEdit(p, orf, change, host){
  const seq = seqOf(p);
  const strand = orf.strand === -1 ? -1 : 1;
  const orfLen = orf.end - orf.start + 1;
  const codonIdx = change.pos - 1;
  if(codonIdx < 0 || (codonIdx + 1) * 3 > orfLen)
    return { error: "Codon " + change.pos + " is outside this ORF, which is " + Math.floor(orfLen/3) + " codons long." };

  // where this codon sits on the top strand, and which way it reads
  let a, b, codon;
  if(strand === 1){
    a = orf.start + codonIdx * 3; b = a + 2;
    codon = seq.slice(a, b + 1);
  } else {
    b = orf.end - codonIdx * 3; a = b - 2;
    codon = revComp(seq.slice(a, b + 1));
  }
  const cur = CODONS[codon];
  if(!cur) return { error: "Codon " + change.pos + " reads " + codon + ", which is not a valid codon." };
  if(change.from && change.from !== cur)
    return { error: "Codon " + change.pos + " is " + cur + " (" + codon + "), not " + change.from +
                    ". Check the numbering - this ORF starts at base " + (orf.start + 1) + "." };

  if(change.to === "del"){
    return { kind:"del", a, b, newSeq:"", strand,
             note: "deletes codon " + change.pos + " (" + cur + "), shortening the protein by one residue",
             fromAA: cur, toAA: null, fromCodon: codon, toCodon: null, aaPos: change.pos };
  }
  if(change.to === cur)
    return { error: "Codon " + change.pos + " is already " + cur + "." };
  const target = bestCodon(codon, change.to, host);
  if(!target) return { error: "No codon exists for " + change.to + "." };
  const newTop = strand === 1 ? target : revComp(target);
  return {
    kind:"sub", a, b, newSeq:newTop, strand,
    fromAA: cur, toAA: change.to, fromCodon: codon, toCodon: target, aaPos: change.pos,
    changes: ntDiff(codon, target),
    note: cur + change.pos + change.to + " — " + codon + " → " + target +
          " (" + ntDiff(codon, target) + " base" + (ntDiff(codon, target) === 1 ? "" : "s") + " changed)" +
          (strand === -1 ? ", on the reverse strand" : "")
  };
}

/* ---- the primer design itself ---- */
function designMutagenesis(p, edit, opts){
  opts = opts || {};
  const seq = seqOf(p), L = seq.length;
  const host = opts.host || "ecoli";
  const warnings = [], notes = [];
  if(!L) return { error:"That construct has no sequence." };
  if(p.topology !== "circular")
    warnings.push("This construct is linear. Whole-plasmid mutagenesis assumes a circular template; the product will be re-circularised by KLD.");
  const a = edit.a, b = edit.b;
  if(a < 0 || a > L || b >= L || b < a - 1)
    return { error:"That edit is outside the sequence." };
  const removed = b - a + 1;
  const ins = cleanDNA(edit.newSeq || "");

  // --- how much of the change rides on each primer ---
  let flank5 = 0, fwdTail = ins, revTail = "";
  if(edit.kind === "sub" && ins.length){
    // NEB puts a substitution inside the forward primer, not at its very 5' end
    flank5 = Math.min(11, Math.max(0, a));
    if(a < 11 && L > 40) flank5 = 11;             // circular: fine to wrap
    fwdTail = cycSub(seq, a - flank5, flank5) + ins;
  } else if(edit.kind === "ins" && ins.length > 15){
    // split a long insert so neither primer becomes an ultramer
    const half = Math.ceil(ins.length / 2);
    revTail = revComp(ins.slice(0, half));
    fwdTail = ins.slice(half);
    notes.push("The insert is " + ins.length + " bp, so it is split across both primers; the ligation junction falls inside it.");
  }

  // --- annealing arms ---
  const fwdFrom = b + 1;                          // first template base 3' of the change
  const revTo = a - flank5 - 1;                   // last template base 5' of the forward primer
  // Size each arm to the shortest that reaches the Tm this polymerase needs for
  // the wanted annealing temperature. The two arms end up different lengths,
  // which is the point - a GC-rich side needs fewer bases than an AT-rich one.
  const polyId = opts.polymerase || defaultPolymerase();
  const P = polymerase(polyId);
  const targetTa = opts.targetTa || MUT_DEFAULT_TA;
  const needTm = tmNeededFor(polyId, targetTa, 25);
  const fwdTmpl = cycSub(seq, fwdFrom, 46);
  const revTmpl = revComp(cycSub(seq, revTo - 45, 46));
  const pair = chooseArmPair(fwdTmpl, revTmpl, needTm, fwdTail, revTail);
  const fwdA = pair.fa, revA = pair.ra;
  if(!fwdA || !revA) return { error:"Could not find an annealing region around that position." };
  const naive = { f: pickAnnealFor(fwdTmpl, needTm), r: pickAnnealFor(revTmpl, needTm) };
  let lengthenedForDimer = false;
  if(naive.f && naive.r && (fwdA.len !== naive.f.len || revA.len !== naive.r.len)){
    const was = worstDimer(fwdTail + naive.f.seq, revTail + naive.r.seq);
    if(dimerIsSerious(was)){
      lengthenedForDimer = true;
      const grew = (fwdA.len - naive.f.len) + (revA.len - naive.r.len);
      notes.push("The shortest arms would have left the two primers complementary over " + was.n +
        " bases at a 3' end, so they were lengthened by " + grew + (grew === 1 ? " base" : " bases") +
        " to break it.");
    }
  }

  const fwd = primerRow("mut-F", fwdTail, fwdA);
  const rev = primerRow("mut-R", revTail, revA);
  fwd.reuse = findMatchingOligo(fwd.full);
  rev.reuse = findMatchingOligo(rev.full);

  // --- checks that decide whether this will actually work ---
  if(fwdA.seq.length < MUT_MIN_3PRIME)
    warnings.push("Only " + fwdA.seq.length + " matched bases 3' of the change; at least " + MUT_MIN_3PRIME + " are needed to prime.");
  [["forward", fwd], ["reverse", rev]].forEach(([which, pr]) => {
    if(pr.len > MUT_MAX_LEN)
      warnings.push("The " + which + " primer is " + pr.len + " nt. Over " + MUT_MAX_LEN +
        " it is an ultramer - costlier, and worth splitting the change if you can.");
  });
  const dimer = worstDimer(fwd.full, rev.full);
  if(dimerIsSerious(dimer))
    warnings.push("A primer 3' end is complementary to the other primer over " + dimer.n + " bases (" +
      dimer.gc + " of them G or C)" + (dimer.bothEnds ? ", 3' end to 3' end" : "") +
      ". This is a repeat in the template, so no arm length avoids it — order anyway but expect a weaker " +
      "reaction, or move the edit a few bases if the protein allows.");
  const spread = Math.abs(Math.round((fwd.tm||0) - (rev.tm||0)));
  if(spread > 6)
    warnings.push("The two annealing Tm values differ by " + spread + " °C. The lower one sets the annealing " +
      "temperature, so the other will be well above its optimum - usually fine on a plasmid, but worth a gradient.");

  // the lower-Tm primer sets the annealing temperature, as every vendor protocol says
  const lowTm = Math.min(fwd.tm != null ? fwd.tm : 99, rev.tm != null ? rev.tm : 99);
  const lowLen = (fwd.tm != null && fwd.tm === lowTm) ? fwdA.seq.length : revA.seq.length;
  const ta = annealTempFor(polyId, lowTm, lowLen);
  if(!P.proofreading)
    warnings.push(P.label + " has no proofreading and leaves a 3' A overhang, so the product will not blunt-ligate. " +
      "KLD will fail - use a proofreading polymerase for whole-plasmid mutagenesis.");
  if(Math.abs(ta - targetTa) > 3)
    notes.push("Annealing lands at " + ta + " °C rather than the " + targetTa + " °C asked for" +
      (lengthenedForDimer ? ", because breaking the primer dimer needed longer arms. Breaking it is worth the few degrees."
                          : " - the local sequence offers no arm length that lands there.") + "");

  // --- the finished plasmid ---
  const product = seq.slice(0, a) + ins + seq.slice(b + 1);
  const delta = ins.length - removed;
  const ann = [];
  (p.ann || []).forEach(x => {
    if(x.end < a) ann.push(Object.assign({}, x, { id:uid() }));
    else if(x.start > b) ann.push(Object.assign({}, x, { id:uid(), start:x.start + delta, end:x.end + delta }));
    else if(x.start <= a && x.end >= b) ann.push(Object.assign({}, x, { id:uid(), end:x.end + delta }));
    // an annotation that only partly overlaps the edit is dropped rather than guessed at
  });
  if(ins.length)
    ann.push({ id:uid(), start:a, end:a + ins.length - 1,
               label: edit.note ? edit.note.split(" — ")[0] : "mutation",
               color:"#ffd9c2", kind:"custom", strand:1, how:"site-directed mutagenesis" });

  return {
    ok:true, edit, fwd, rev, ta, targetTa, polymerase:polyId, needTm, product, ann, warnings, notes,
    removed, inserted: ins.length, flank5,
    amplicon: fwd.full.length + (L - removed) - fwd.anneal.length - rev.anneal.length + rev.full.length,
    screening: screeningSite(p, edit, product, host)
  };
}
/* complementarity between the two 3' ends, the usual cause of primer dimer */
function primerPairDimer(f, r){
  for(let n = 8; n >= 5; n--){
    const tail = f.slice(-n);
    if(r.indexOf(revComp(tail)) !== -1) return n;
  }
  return 0;
}

/* ---- bonus: a silent change that lets you screen clones on a gel ----
   Looks for a synonymous codon near the mutation that creates a restriction
   site unique in the whole product, so a correct clone can be told apart by
   a digest instead of a sequencing read.                                   */
function screeningSite(p, edit, product, host){
  if(edit.kind !== "sub" || !edit.fromCodon) return null;
  const seq = seqOf(p);
  const orfStrand = edit.strand === -1 ? -1 : 1;
  const names = Object.keys(ENZ).filter(n => !ENZ[n].iis && ownsEnzyme(n));
  if(!names.length) return null;
  const baseCounts = {};
  names.forEach(n => baseCounts[n] = sitesOf(n, product, true).length);

  for(let off = -4; off <= 4; off++){
    if(off === 0) continue;
    const ca = edit.a + off * 3;
    if(ca < 0 || ca + 3 > seq.length) continue;
    const topCodon = seq.slice(ca, ca + 3);
    const codon = orfStrand === 1 ? topCodon : revComp(topCodon);
    const aa = CODONS[codon];
    if(!aa || aa === "*") continue;
    for(const alt of codonsFor(aa)){
      if(alt === codon) continue;
      const altTop = orfStrand === 1 ? alt : revComp(alt);
      // apply both the real mutation and this silent change, then look for a new unique site
      let test = seq.slice(0, edit.a) + edit.newSeq + seq.slice(edit.b + 1);
      const shift = edit.newSeq.length - (edit.b - edit.a + 1);
      const caP = ca > edit.b ? ca + shift : ca;
      if(caP < 0 || caP + 3 > test.length) continue;
      test = test.slice(0, caP) + altTop + test.slice(caP + 3);
      for(const n of names){
        const before = baseCounts[n], after = sitesOf(n, test, true).length;
        if(after === 1 && before === 0)
          return { enzyme:n, codonPos: edit.aaPos + off, from:codon, to:alt, aa,
                   silent:true, seqWithSite:test, offset:off };
      }
    }
  }
  return null;
}

/* ---- the protocol ---- */
function mutProtocol(p, res){
  const steps = [];
  const kb = (res.product.length / 1000).toFixed(1);
  const P = polymerase(res.polymerase);
  const ext = Math.max(30, Math.ceil(res.product.length / 1000 * P.sPerKb));
  const denat = /Taq/i.test(P.label) ? 95 : 98;
  steps.push("Set up 25 µL with " + P.label + ": 12.5 µL 2× master mix (or the equivalent from a separate buffer), " +
    "1.25 µL each primer (10 µM), 1 µL template at 1 ng/µL (1–25 ng total — more template means more background), " +
    "water to 25 µL.");
  steps.push("Cycle: " + denat + " °C 30 s; then 25 × (" + denat + " °C 10 s, " + res.ta + " °C 20 s, 72 °C " +
    fmtTime(ext) + "); then 72 °C 2 min. The product is the whole " + kb + " kb plasmid, linear. " +
    "Extension is " + P.sPerKb + " s/kb for " + P.label + ".");
  steps.push("KLD: 1 µL PCR product + 5 µL 2× KLD buffer + 1 µL 10× KLD enzyme mix + 3 µL water. " +
    "Room temperature, 5 min. The kinase phosphorylates the ends, the ligase closes the circle, and DpnI destroys the methylated template.");
  steps.push("Transform 5 µL of the KLD reaction into chemically competent cells. Plate on the plasmid's own selection.");
  if(res.screening && res.screening.enzyme)
    steps.push("Screen by " + res.screening.enzyme + " digest — only the mutant carries the site, so a correct clone cuts and the parent does not.");
  else
    steps.push("Pick 2–4 colonies and sequence across the edit. A silent-site screen was not available, so sequencing is the only check.");
  steps.push("Sequence the whole ORF before using the clone, not just the mutated codon — whole-plasmid PCR can introduce changes elsewhere.");
  return steps;
}
