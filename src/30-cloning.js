/* =========================================================================
   POLYMERASES
   Each vendor publishes its own rule of thumb for turning a primer Tm into an
   annealing temperature, and its own extension rate. The Tm underneath is a
   SantaLucia nearest-neighbour value, NOT the vendor's own model - NEB's Q5 and
   Phusion calculators in particular run warmer, so expect a degree or two of
   disagreement and run a gradient if a reaction is marginal.

   proofreading matters for more than fidelity: Taq leaves a 3' A overhang, so
   its product cannot be blunt-ligated and is useless for KLD mutagenesis.
   ========================================================================= */
const POLYMERASES = {
  Q5:        { label:"Q5 / Q5 Hot Start", vendor:"NEB", proofreading:true, sPerKb:25,
               taOffset:1,  note:"Q5's buffer raises the effective Tm; NEB's own calculator usually suggests a slightly higher Ta than a plain nearest-neighbour value." },
  Phusion:   { label:"Phusion", vendor:"NEB/Thermo", proofreading:true, sPerKb:30,
               taOffset:3, shortOffset:0,
               note:"NEB's published rule: Ta = Tm of the lower primer + 3 °C for primers over 20 nt, or the Tm itself for primers 20 nt and under." },
  KOD:       { label:"KOD / KOD Hot Start", vendor:"Merck", proofreading:true, sPerKb:15,
               taOffset:0,  note:"Fast and tolerant of GC-rich templates. Anneal at the lower primer's Tm." },
  PrimeSTAR: { label:"PrimeSTAR GXL", vendor:"Takara", proofreading:true, sPerKb:60,
               taOffset:0,  note:"Robust on long and difficult templates; a 2-step protocol at 68 °C often works." },
  Pfu:       { label:"Pfu / PfuUltra", vendor:"Agilent", proofreading:true, sPerKb:120,
               taOffset:-2, note:"Slow. Allow two minutes per kb and expect a longer run." },
  Taq:       { label:"Taq", vendor:"various", proofreading:false, sPerKb:60,
               taOffset:-5, note:"No proofreading, and it leaves a 3' A overhang - the product will not blunt-ligate, so it cannot be used for KLD mutagenesis." },
  OneTaq:    { label:"OneTaq", vendor:"NEB", proofreading:false, sPerKb:60,
               taOffset:-5, note:"A Taq blend. Same A-overhang problem for blunt ligation." }
};
function polymerase(id){ return POLYMERASES[id] || POLYMERASES.Q5; }
function defaultPolymerase(){ return (state.lab && state.lab.polymerase) || "Q5"; }
/* vendor rule applied to a nearest-neighbour Tm */
function annealTempFor(polyId, tmLow, primerLen){
  const P = polymerase(polyId);
  let off = P.taOffset;
  if(P.shortOffset !== undefined && primerLen && primerLen <= 20) off = P.shortOffset;
  return Math.round(tmLow + off);
}
/* the Tm each primer must reach for a wanted annealing temperature */
function tmNeededFor(polyId, targetTa, primerLen){
  const P = polymerase(polyId);
  let off = P.taOffset;
  if(P.shortOffset !== undefined && primerLen && primerLen <= 20) off = P.shortOffset;
  return targetTa - off;
}

/* The shortest primer that clears a Tm, rather than the first round number.
   Up to two extra bases are allowed to land a 3' G or C, which is worth it;
   beyond that a longer primer just costs more and synthesises worse. */
function pickAnnealFor(template, needTm, opts){
  opts = opts || {};
  const min = opts.min || 17, max = opts.max || 34;
  template = cleanDNA(template || "");
  if(!template.length) return { seq:"", tm:null, len:0, gc:0, gcClamp:false, tooShort:true };
  if(template.length < min)
    return { seq:template, tm:tmNN(template), len:template.length, gc:gcPct(template), gcClamp:false, tooShort:true };
  let firstHit = null, longest = null;
  for(let len = min; len <= Math.min(max, template.length); len++){
    const sub = template.slice(0, len);
    const t = tmNN(sub);
    if(t === null) continue;
    const gcClamp = /[GC]$/.test(sub) && !/[GC]{4}$/.test(sub);
    const cand = { seq:sub, tm:t, len, gc:gcPct(sub), gcClamp };
    longest = cand;
    if(t >= needTm){
      if(!firstHit) firstHit = cand;
      if(gcClamp) return cand;                    // shortest with a clean 3' end
      if(len - firstHit.len >= 2) return firstHit; // stop paying for a clamp that is not coming
    }
  }
  return firstHit || longest;
}

/* ===================== 6a. PRIMER DESIGN ===================== */
function pickAnneal(template, targetTm, maxLen){
  targetTm = targetTm || 61; maxLen = maxLen || 32;
  template = cleanDNA(template || "");
  if(!template.length) return { seq:"", tm:null, len:0, gc:0, gcClamp:false, tooShort:true };
  // nothing to bind below ~18 nt: hand back what there is and let the caller warn
  if(template.length < 18)
    return { seq:template, tm:tmNN(template), len:template.length, gc:gcPct(template), gcClamp:false, tooShort:true };
  let best = null;
  for(let len = 18; len <= Math.min(maxLen, template.length); len++){
    const sub = template.slice(0, len);
    const t = tmNN(sub);
    if(t === null) continue;
    const gcClamp = /[GC]$/.test(sub) && !/[GC]{4}$/.test(sub);
    const cand = { seq:sub, tm:t, len, gc:gcPct(sub), gcClamp };
    if(!best) best = cand;
    if(t >= targetTm){ if(gcClamp) return cand; if(!best.hit){ best = cand; best.hit = true; } }
    if(t >= targetTm && !best.hit) best = cand;
  }
  return best;
}
function primerWarnings(p){
  const w = [];
  const s = p.seq || p;
  if(s.length > 60) w.push("longer than 60 nt - order as an ultramer, or split the part out");
  if(gcPct(s) > 70) w.push("GC > 70%");
  if(gcPct(s) < 35) w.push("GC < 35%");
  if(/(.)\1{4,}/.test(s)) w.push("homopolymer run of 5+");
  const tail = s.slice(-6);
  if(s.indexOf(revComp(tail)) !== -1) w.push("3' end can fold back on itself");
  return w;
}
function primerRow(name, tail, anneal){
  const full = tail + anneal.seq;
  return { name, full, tail, anneal:anneal.seq, tm:anneal.tm, tmFull:tmNN(full), len:full.length,
           gc:Math.round(gcPct(full)), warn:primerWarnings(full) };
}

/* ===================== 6b. CLONING PLANNER ===================== */
function uniqueCutters(seq, circular){
  const out = {};
  Object.keys(ENZ).forEach(n => {
    if(ENZ[n].iis) return;
    const s = sitesOf(n, seq, circular);
    if(s.length === 1) out[n] = s[0];
  });
  return out;
}
function countSites(seq, name){ return sitesOf(name, seq, false).length; }

/* Suggest directional double-digest pairs for putting `insert` into `vector`. */
function suggestEnzymePairs(vecSeq, vecCirc, insertSeq, maxDrop){
  const uniq = uniqueCutters(vecSeq, vecCirc);
  const names = Object.keys(uniq).filter(n => countSites(insertSeq, n) === 0);
  const pairs = [];
  const L = vecSeq.length;
  for(let a=0; a<names.length; a++){
    for(let b=a+1; b<names.length; b++){
      const n1 = names[a], n2 = names[b];
      if(endsCompatible(n1, n2)) continue;                 // would self-ligate / lose direction
      const o1 = overhangOf(n1), o2 = overhangOf(n2);
      if(o1.type === "blunt" && o2.type === "blunt") continue;
      // Two cuts split a circle into two arcs. Keep the larger one as the backbone
      // and replace the smaller one, choosing which enzyme lands at the insert's 5' end.
      let cA = uniq[n1].cut, cB = uniq[n2].cut, nA = n1, nB = n2;
      if(cB < cA){ let t = cA; cA = cB; cB = t; t = nA; nA = nB; nB = t; }
      const span = cB - cA, other = L - span;
      let e5, e3, cutE5, cutE3, dropped;
      if(span <= other){ e5 = nA; cutE5 = cA; e3 = nB; cutE3 = cB; dropped = span; }
      else            { e5 = nB; cutE5 = cB; e3 = nA; cutE3 = cA; dropped = other; }
      if(maxDrop && dropped > maxDrop) continue;
      let score = 100;
      score -= Math.min(40, dropped / 40);                  // prefer removing little backbone
      if(overhangOf(e5).type === "blunt" || overhangOf(e3).type === "blunt") score -= 20;
      if(ENZ[e5].dam) score -= 12;
      if(ENZ[e3].dam) score -= 12;
      const common = ["EcoRI","BamHI","HindIII","XhoI","NotI","NdeI","XbaI","SalI","NcoI","KpnI","SacI","BglII","AgeI","NheI","SpeI","EcoRV","PstI"];
      if(common.includes(e5)) score += 6;
      if(common.includes(e3)) score += 6;
      // what is actually on the shelf outranks what is theoretically neat
      const have5 = ownsEnzyme(e5), have3 = ownsEnzyme(e3);
      const owned = have5 && have3;
      if(tracksEnzymes()){
        if(!have5) score -= 30;
        if(!have3) score -= 30;
      }
      pairs.push({ e5, e3, cut5:cutE5, cut3:cutE3, dropped, owned,
                   missing:[have5?null:e5, have3?null:e3].filter(Boolean), score:Math.round(score) });
    }
  }
  pairs.sort((a,b) => b.score - a.score);
  return pairs;
}
/* Build the finished construct for a restriction strategy. */
function buildRestrictionProduct(vec, insertSeq, insertAnn, pair, addSites){
  const vs = seqOf(vec), L = vs.length;
  // the backbone runs from the e3 cut forward (wrapping if needed) to the e5 cut,
  // so the insert's e5 end always ligates to the backbone's e5 end
  const backbone = pair.cut5 > pair.cut3 ? vs.slice(pair.cut3, pair.cut5)
                                         : vs.slice(pair.cut3) + vs.slice(0, pair.cut5);
  let piece = insertSeq, note = "", insOffset = 0;   // insOffset: insert coord of the first base of the piece
  if(addSites){
    const amp = "TTT" + ENZ[pair.e5].s + insertSeq + ENZ[pair.e3].s + "TTT";
    const cutA = 3 + ENZ[pair.e5].c;
    const cutB = 3 + ENZ[pair.e5].s.length + insertSeq.length + ENZ[pair.e3].c;
    piece = amp.slice(cutA, cutB);
    insOffset = -(ENZ[pair.e5].s.length - ENZ[pair.e5].c);   // the piece starts inside the added site
    note = "insert amplified with tailed primers, then cut";
  } else {
    // the insert already carries both sites near its ends - cut there
    const i5 = insertSeq.indexOf(ENZ[pair.e5].s);
    const i3 = insertSeq.lastIndexOf(ENZ[pair.e3].s);
    if(i5 !== -1 && i3 !== -1 && i3 > i5){
      insOffset = i5 + ENZ[pair.e5].c;
      piece = insertSeq.slice(insOffset, i3 + ENZ[pair.e3].c);
      note = "insert cut at its own " + pair.e5 + " and " + pair.e3 + " sites";
    }
  }
  const product = backbone + piece;
  // move annotations across: vector position x sits at (x - cut3) mod L in the backbone
  const ann = [];
  (vec.ann || []).forEach(a => {
    const s = ((a.start - pair.cut3) % L + L) % L;
    const e = ((a.end - pair.cut3) % L + L) % L;
    if(s < backbone.length && e < backbone.length && e >= s)
      ann.push(Object.assign({}, a, { id:uid(), start:s, end:e }));
  });
  const off = backbone.length - insOffset;
  (insertAnn || []).forEach(a => {
    const s = a.start + off, e = a.end + off;
    if(s >= backbone.length && e < product.length) ann.push(Object.assign({}, a, { id:uid(), start:s, end:e }));
  });
  ann.push({ id:uid(), start: backbone.length, end: product.length - 1, label:"insert", color:"#ffe0b3", kind:"custom", strand:1 });
  return { product, ann, backboneLen: backbone.length, pieceLen: piece.length, note };
}
/* Gibson / HiFi assembly design: linearise vector at one site, add 25 nt homology arms. */
function planGibson(vec, insertSeq, cutName, armLen){
  armLen = armLen || 25;
  const vs = seqOf(vec);
  const site = sitesOf(cutName, vs, vec.topology === "circular")[0];
  if(!site) return null;
  const c = site.cut;
  const linear = vs.slice(c) + vs.slice(0, c);           // linearised, junction at both ends
  const leftArm  = linear.slice(-armLen);                // vector sequence immediately 5' of the insert
  const rightArm = linear.slice(0, armLen);              // vector sequence immediately 3' of the insert
  const fA = pickAnneal(insertSeq, 62);
  const rA = pickAnneal(revComp(insertSeq), 62);
  const fwd = primerRow("Insert-F", leftArm, fA);
  const rev = primerRow("Insert-R", revComp(rightArm), rA);
  return { cutName, cutPos:c, linearLen:linear.length, leftArm, rightArm, fwd, rev,
           product: linear + insertSeq, armLen };
}
/* Synthesis order sheet: flags the things vendors actually reject. */
function synthesisReport(seq){
  const flags = [];
  const gc = gcPct(seq);
  if(gc > 65) flags.push({ lvl:"warn", t:"Overall GC " + gc.toFixed(1) + "% - above the usual easy range" });
  if(gc < 30) flags.push({ lvl:"warn", t:"Overall GC " + gc.toFixed(1) + "% - low GC fragments often fail" });
  // 100 bp sliding window GC extremes
  let worstHi = 0, worstLo = 100;
  for(let i=0; i+100 <= seq.length; i += 10){ const g = gcPct(seq.substr(i,100)); if(g > worstHi) worstHi = g; if(g < worstLo) worstLo = g; }
  if(seq.length >= 100 && (worstHi > 80 || worstLo < 20))
    flags.push({ lvl:"warn", t:"100 bp window GC ranges " + worstLo.toFixed(0) + "-" + worstHi.toFixed(0) + "% - local extremes are the usual cause of a failed synthesis" });
  const hp = seq.match(/(A{9,}|T{9,}|G{7,}|C{7,})/g);
  if(hp) flags.push({ lvl:"warn", t:"Homopolymer runs: " + hp.slice(0,4).map(h => h[0] + "x" + h.length).join(", ") });
  // direct repeats >= 40 bp
  const seen = new Map(); let rep = null;
  for(let i=0; i+40 <= seq.length; i++){ const kk = seq.substr(i,40); if(seen.has(kk)){ rep = { at:seen.get(kk), and:i }; break; } seen.set(kk, i); }
  if(rep) flags.push({ lvl:"warn", t:"40 bp direct repeat at " + (rep.at+1) + " and " + (rep.and+1) + " - split into two fragments or recode" });
  if(!flags.length) flags.push({ lvl:"ok", t:"No complexity flags - this should synthesise as a standard fragment" });
  return { gc, len:seq.length, flags };
}

/* ===================== 6c. CRISPR ===================== */
const IUPAC = { A:"A", C:"C", G:"G", T:"T", R:"AG", Y:"CT", S:"GC", W:"AT", K:"GT", M:"AC",
                B:"CGT", D:"AGT", H:"ACT", V:"ACG", N:"ACGT" };
function iupacMatch(pattern, s){
  if(s.length < pattern.length) return false;
  for(let i=0;i<pattern.length;i++){ if(IUPAC[pattern[i]].indexOf(s[i]) === -1) return false; }
  return true;
}
const CAS_SYSTEMS = {
  SpCas9:      { pam:"NGG",    pam3:true,  spacer:20, cutOffset:-3, label:"SpCas9 (NGG)", blunt:true },
  "SpCas9-NG": { pam:"NG",     pam3:true,  spacer:20, cutOffset:-3, label:"SpCas9-NG (NG)", blunt:true },
  SaCas9:      { pam:"NNGRRT", pam3:true,  spacer:21, cutOffset:-3, label:"SaCas9 (NNGRRT)", blunt:true },
  Cas12a:      { pam:"TTTV",   pam3:false, spacer:23, cutOffset:18, label:"Cas12a/Cpf1 (TTTV)", blunt:false }
};
function findGuides(seq, sysName, from, to){
  const sys = CAS_SYSTEMS[sysName] || CAS_SYSTEMS.SpCas9;
  const out = [];
  const scan = (s, strand) => {
    const N = s.length;
    for(let i=0; i+sys.pam.length <= N; i++){
      if(!iupacMatch(sys.pam, s.substr(i, sys.pam.length))) continue;
      let spStart, pamStart = i;
      if(sys.pam3){ spStart = i - sys.spacer; if(spStart < 0) continue; }
      else { spStart = i + sys.pam.length; if(spStart + sys.spacer > N) continue; }
      const spacer = s.substr(spStart, sys.spacer);
      if(spacer.length !== sys.spacer || /N/.test(spacer)) continue;
      // cut site, in the coordinates of the strand being scanned
      const cutLocal = sys.pam3 ? (i + sys.cutOffset) : (spStart + sys.cutOffset);
      // convert to forward-strand coordinates
      const fStart = strand === 1 ? spStart : N - (spStart + sys.spacer);
      const fEnd   = fStart + sys.spacer - 1;
      const fCut   = strand === 1 ? cutLocal : N - cutLocal;
      const fPam   = strand === 1 ? pamStart : N - (pamStart + sys.pam.length);
      if(from !== undefined && (fEnd < from || fStart > to)) continue;
      out.push({ spacer, pam: s.substr(i, sys.pam.length), strand, start:fStart, end:fEnd, cut:fCut,
                 pamStart:fPam, sys:sysName });
    }
  };
  scan(seq, 1); scan(revComp(seq), -1);
  out.forEach(g => Object.assign(g, scoreGuide(g)));
  out.sort((a,b) => b.score - a.score);
  return out;
}
function scoreGuide(g){
  const s = g.spacer, warn = [];
  let score = 100;
  const gc = gcPct(s);
  if(gc < 30 || gc > 80){ score -= 25; warn.push("GC " + gc.toFixed(0) + "% is outside 30-80%"); }
  else if(gc < 40 || gc > 70){ score -= 8; }
  if(s.indexOf("TTTT") !== -1){ score -= 35; warn.push("TTTT terminates Pol III transcription from a U6/H1 promoter"); }
  const hp = s.match(/(.)\1{4,}/);
  if(hp){ score -= 12; warn.push("homopolymer run " + hp[0]); }
  if(s[0] === "G") score += 5; else warn.push("does not start with G - add a 5' G for U6 (makes it 21 nt)");
  if(/GG$/.test(s)) score += 4;
  // self-complementarity with the sgRNA scaffold is the other classic failure; flag long palindromes
  for(let i=0;i+6<=s.length;i++){ if(s.indexOf(revComp(s.substr(i,6))) !== -1 && s.indexOf(revComp(s.substr(i,6))) !== i){ score -= 5; warn.push("internal self-complementarity"); break; } }
  return { score: Math.min(100, Math.max(0, Math.round(score))), gc: Math.round(gc*10)/10, warn };
}
/* Off-target scan across everything in this workspace. Local only - not a genome. */
function localOffTargets(spacer, sysName){
  const sys = CAS_SYSTEMS[sysName] || CAS_SYSTEMS.SpCas9;
  const hits = [];
  state.plasmids.forEach(p => {
    if(p.type === "protein") return;
    const s = seqOf(p);
    [[1, s], [-1, revComp(s)]].forEach(([strand, ss]) => {
      for(let i=0; i+sys.pam.length <= ss.length; i++){
        if(!iupacMatch(sys.pam, ss.substr(i, sys.pam.length))) continue;
        const spStart = sys.pam3 ? i - sys.spacer : i + sys.pam.length;
        if(spStart < 0 || spStart + sys.spacer > ss.length) continue;
        const cand = ss.substr(spStart, sys.spacer);
        let mm = 0, seedMM = 0;
        for(let j=0;j<cand.length;j++){
          if(cand[j] !== spacer[j]){ mm++; if(j >= cand.length - 12) seedMM++; if(mm > 3) break; }
        }
        if(mm <= 3) hits.push({ plasmid:p.name, plasmidId:p.id, mm, seedMM, strand, at:spStart, seq:cand });
      }
    });
  });
  hits.sort((a,b) => a.mm - b.mm || a.seedMM - b.seedMM);
  return hits;
}
function guideOligos(spacer){
  const top = spacer[0] === "G" ? spacer : "G" + spacer;
  return {
    bbsI:  { top: "CACC" + top,  bot: "AAAC" + revComp(top) },     // pX330 / pSpCas9(BB)
    bsmBI: { top: "CACCG".slice(0, spacer[0]==="G" ? 4 : 5) + spacer, bot: "AAAC" + revComp(top) },
    note: spacer[0] === "G" ? "guide already starts with G" : "a 5' G was added for U6 transcription"
  };
}
/* Silent PAM-blocking suggestion when the PAM falls inside a coding annotation. */
function silentPamBlock(seq, pamStart, orf){
  if(!orf) return null;
  const opts = [];
  for(let k=0;k<3;k++){
    const pos = pamStart + k;
    if(pos < orf.start || pos > orf.end) continue;
    const codonIdx = Math.floor((pos - orf.start) / 3);
    const cs = orf.start + codonIdx*3;
    if(cs + 3 > seq.length) continue;
    const codon = seq.substr(cs, 3), aa = CODONS[codon];
    if(!aa) continue;
    for(const alt in CODONS){
      if(CODONS[alt] !== aa || alt === codon) continue;
      const rebuilt = seq.slice(0, cs) + alt + seq.slice(cs + 3);
      const newPam = rebuilt.substr(pamStart, 3);
      if(!/GG$/.test(newPam)){
        opts.push({ codonStart:cs, from:codon, to:alt, aa, newPam });
        break;
      }
    }
  }
  return opts.length ? opts[0] : null;
}
function designHDR(seq, cutPos, edit, armLen){
  armLen = armLen || 50;
  const left = seq.slice(Math.max(0, cutPos - armLen), cutPos);
  const right = seq.slice(cutPos, Math.min(seq.length, cutPos + armLen));
  const donor = left + (edit || "") + right;
  return { donor, left, right, armLen, len: donor.length,
           tmSense: tmNN(donor.slice(0,40)), gc: gcPct(donor) };
}
function baseEditWindow(g){
  // protospacer numbered 1-20 from the PAM-distal end; CBE ~4-8, ABE ~4-7
  const s = g.spacer;
  const win = (a, b) => { const out = []; for(let i=a-1;i<=b-1 && i<s.length;i++) out.push({ pos:i+1, base:s[i] }); return out; };
  const cbe = win(4,8).filter(x => x.base === "C");
  const abe = win(4,7).filter(x => x.base === "A");
  return { cbe, abe, cbeWin: win(4,8).map(x=>x.base).join(""), abeWin: win(4,7).map(x=>x.base).join("") };
}

/* ---- primer dimer, scored rather than just flagged ----
   What matters is a primer's 3' end finding a template in the other primer: that
   end gets extended and the pair consumes itself. Longer and more GC-rich is
   worse, and a match sitting at the other primer's 3' end is worst of all. */
function dimer3(f, r){
  for(let n = 12; n >= 4; n--){
    if(n > f.length) continue;
    const tail = f.slice(-n);
    const at = r.indexOf(revComp(tail));
    if(at === -1) continue;
    const gc = (tail.match(/[GC]/g) || []).length;
    const bothEnds = (at + n) >= r.length - 1;
    return { n, gc, at, bothEnds, score: n + gc + (bothEnds ? 4 : 0) };
  }
  return null;
}
function worstDimer(f, r){
  const cands = [dimer3(f, r), dimer3(r, f), dimer3(f, f), dimer3(r, r)].filter(Boolean);
  if(!cands.length) return null;
  return cands.reduce((a, b) => (b.score > a.score ? b : a));
}
/* a 3' overlap long or GC-rich enough to actually matter */
function dimerIsSerious(d){ return !!d && (d.n >= 7 || (d.n >= 5 && d.gc >= 4)); }

/* Among the arm lengths that all clear the Tm, choose the pair that does not
   eat itself. Length is the tie-breaker, so a clean short pair still wins. */
function chooseArmPair(fwdTemplate, revTemplate, needTm, fwdTail, revTail, opts){
  opts = opts || {};
  const span = opts.span || 6;
  const arms = (tmpl) => {
    const first = pickAnnealFor(tmpl, needTm, opts);
    const out = [];
    if(!first) return out;
    for(let len = first.len; len <= Math.min(first.len + span, tmpl.length); len++){
      const sub = tmpl.slice(0, len), t = tmpl.length >= len ? tmNN(sub) : null;
      if(t === null) continue;
      out.push({ seq:sub, tm:t, len, gc:gcPct(sub),
                 gcClamp: /[GC]$/.test(sub) && !/[GC]{4}$/.test(sub), tooShort:first.tooShort });
    }
    return out.length ? out : [first];
  };
  const F = arms(fwdTemplate), R = arms(revTemplate);
  let best = null;
  F.forEach(fa => R.forEach(ra => {
    const d = worstDimer(fwdTail + fa.seq, revTail + ra.seq);
    const penalty = (dimerIsSerious(d) ? d.score * 10 : 0)
                  + (fa.len - F[0].len) + (ra.len - R[0].len)
                  + (fa.gcClamp ? 0 : 1) + (ra.gcClamp ? 0 : 1);
    if(!best || penalty < best.penalty) best = { fa, ra, d, penalty };
  }));
  return best || { fa:F[0], ra:R[0], d:null, penalty:0 };
}
