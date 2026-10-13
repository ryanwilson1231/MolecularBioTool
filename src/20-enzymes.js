/* ===================== 3. ENZYME LIBRARY =====================
   s   = recognition site (palindromic for all type II entries below)
   c   = top-strand cut position, counted from the 5' end of the site
   dam = blocked by Dam methylation in the standard dam+ E. coli strains
   iis = type IIS, cuts outside its site: off = [top, bottom] offsets past the site
*/
const ENZ = {
  EcoRI:{s:"GAATTC",c:1}, BamHI:{s:"GGATCC",c:1}, HindIII:{s:"AAGCTT",c:1}, XhoI:{s:"CTCGAG",c:1},
  SalI:{s:"GTCGAC",c:1},  NotI:{s:"GCGGCCGC",c:2}, NdeI:{s:"CATATG",c:2}, XbaI:{s:"TCTAGA",c:1,dam:"overlapping GATC"},
  SpeI:{s:"ACTAGT",c:1},  NheI:{s:"GCTAGC",c:1},  AvrII:{s:"CCTAGG",c:1}, BglII:{s:"AGATCT",c:1},
  BclI:{s:"TGATCA",c:1,dam:"always in dam+ strains"}, PstI:{s:"CTGCAG",c:5}, SacI:{s:"GAGCTC",c:5},
  KpnI:{s:"GGTACC",c:5},  SmaI:{s:"CCCGGG",c:3},  XmaI:{s:"CCCGGG",c:1}, NcoI:{s:"CCATGG",c:1},
  EcoRV:{s:"GATATC",c:3}, ApaI:{s:"GGGCCC",c:5},  AflII:{s:"CTTAAG",c:1}, AscI:{s:"GGCGCGCC",c:2},
  PacI:{s:"TTAATTAA",c:5},SphI:{s:"GCATGC",c:5},  MluI:{s:"ACGCGT",c:1}, SbfI:{s:"CCTGCAGG",c:6},
  AgeI:{s:"ACCGGT",c:1},  BsrGI:{s:"TGTACA",c:1}, ClaI:{s:"ATCGAT",c:2,dam:"overlapping GATC"},
  HpaI:{s:"GTTAAC",c:3},  PvuII:{s:"CAGCTG",c:3}, StuI:{s:"AGGCCT",c:3}, ScaI:{s:"AGTACT",c:3},
  DraI:{s:"TTTAAA",c:3},  SnaBI:{s:"TACGTA",c:3}, FseI:{s:"GGCCGGCC",c:6}, SwaI:{s:"ATTTAAAT",c:4},
  PmeI:{s:"GTTTAAAC",c:4},NsiI:{s:"ATGCAT",c:5},  BstBI:{s:"TTCGAA",c:2}, EagI:{s:"CGGCCG",c:1},
  BsaI:{s:"GGTCTC",c:null,iis:true,off:[1,5]}, BbsI:{s:"GAAGAC",c:null,iis:true,off:[2,6]},
  BsmBI:{s:"CGTCTC",c:null,iis:true,off:[1,5]}, SapI:{s:"GCTCTTC",c:null,iis:true,off:[1,4]}
};
/* overhang produced by a palindromic type II enzyme */
function overhangOf(name){
  const e = ENZ[name]; if(!e || e.iis) return null;
  const L = e.s.length, d = L - 2*e.c;
  if(d === 0) return { type:"blunt", seq:"" };
  if(d > 0)  return { type:"5'", seq: e.s.slice(e.c, L - e.c) };
  return { type:"3'", seq: e.s.slice(L - e.c, e.c) };
}
function endsCompatible(a, b){
  const oa = overhangOf(a), ob = overhangOf(b);
  if(!oa || !ob) return false;
  if(oa.type === "blunt" && ob.type === "blunt") return true;
  return oa.type === ob.type && oa.seq === ob.seq;
}
/* all cut sites of one enzyme in a sequence (linear scan, both strands are equivalent for palindromes) */
function sitesOf(name, seq, circular){
  const e = ENZ[name]; if(!e) return [];
  const hay = circular ? seq + seq.slice(0, e.s.length - 1) : seq;
  const out = []; let i = hay.indexOf(e.s);
  while(i !== -1){
    if(i < seq.length){
      const cut = e.iis ? (i + e.s.length + e.off[0]) : (i + e.c);
      out.push({ enzyme:name, siteStart:i, cut: circular ? cut % seq.length : cut });
    }
    i = hay.indexOf(e.s, i + 1);
  }
  return out;
}
function digestMap(seq, circular, names){
  const map = {};
  (names || Object.keys(ENZ)).forEach(n => { const s = sitesOf(n, seq, circular); if(s.length) map[n] = s; });
  return map;
}
/* fragment sizes from a (possibly multi-enzyme) digest - what you would see on a gel */
function fragments(seq, circular, names){
  const cuts = [];
  names.forEach(n => sitesOf(n, seq, circular).forEach(s => cuts.push(s.cut)));
  const u = [...new Set(cuts)].sort((a,b) => a-b);
  if(!u.length) return [{ size: seq.length, note: circular ? "uncut (circular)" : "uncut (linear)" }];
  const out = [];
  if(circular){
    for(let i=0;i<u.length;i++){
      const a = u[i], b = u[(i+1) % u.length];
      out.push({ size: (b - a + seq.length) % seq.length || seq.length, from:a, to:b });
    }
  } else {
    let prev = 0;
    u.forEach(c => { out.push({ size: c - prev, from:prev, to:c }); prev = c; });
    out.push({ size: seq.length - prev, from:prev, to:seq.length });
  }
  return out.filter(f => f.size > 0).sort((a,b) => b.size - a.size);
}

/* ===================== FEATURE LIBRARY =====================
   DNA motifs are exact, well-known short signatures. Anything longer than a
   signature is deliberately not stored here: a seed match is reported as a
   signature hit, not as a validated full-length annotation.
*/
const DNA_FEATURES = [
  {name:"T7 promoter",        cat:"promoter", seqs:["TAATACGACTCACTATAG"]},
  {name:"T3 promoter",        cat:"promoter", seqs:["AATTAACCCTCACTAAAG"]},
  {name:"SP6 promoter",       cat:"promoter", seqs:["ATTTAGGTGACACTATAG"]},
  {name:"T7 terminator",      cat:"promoter", seqs:["CTAGCATAACCCCTTGGGGCCTCTAAACGGGTCTTGAGGGGTTTTTTG"]},
  {name:"lac operator",       cat:"promoter", seqs:["AATTGTGAGCGGATAACAATT"]},
  {name:"tet operator (tetO)",cat:"promoter", seqs:["TCCCTATCAGTGATAGAGA"]},
  {name:"CMV TATA / TSS",     cat:"promoter", seqs:["TATATAAGCAGAGCTC"]},
  {name:"CMV enhancer",       cat:"promoter", seqs:["GACGTCAATAATGACGTATGTTCC"]},
  {name:"U6 promoter 3' end", cat:"promoter", seqs:["CTTGTGGAAAGGACGAAACACCG","CTTGTGGAAAGGACGAAACACC"]},
  {name:"RBS (strong, T7g10)",cat:"element",  seqs:["AAGGAGATATACAT","AAGGAGATATACC"]},
  {name:"Kozak",              cat:"element",  seqs:["GCCACCATGG","GCCGCCATGG"]},
  {name:"loxP",               cat:"element",  seqs:["ATAACTTCGTATAATGTATGCTATACGAAGTTAT"]},
  {name:"FRT",                cat:"element",  seqs:["GAAGTTCCTATTCTCTAGAAAGTATAGGAACTTC"]},
  {name:"attB1 (Gateway)",    cat:"element",  seqs:["ACAAGTTTGTACAAAAAAGCAGGCT"]},
  {name:"attB2 (Gateway)",    cat:"element",  seqs:["ACCACTTTGTACAAGAAAGCTGGGT"]},
  {name:"FLAG tag",           cat:"tag",      seqs:["GACTACAAGGACGACGATGACAAG"]},
  {name:"HA tag",             cat:"tag",      seqs:["TACCCATACGATGTTCCAGATTACGCT"]},
  {name:"Myc tag",            cat:"tag",      seqs:["GAACAAAAACTCATCTCAGAAGAGGATCTG"]},
  {name:"Strep-tag II",       cat:"tag",      seqs:["TGGAGCCACCCGCAGTTCGAAAAA"]},
  {name:"TEV cleavage site",  cat:"tag",      seqs:["GAAAACCTGTATTTTCAGGGC","GAGAATCTTTATTTTCAGGGC"]},
  {name:"HRV 3C / PreScission",cat:"tag",     seqs:["CTGGAAGTTCTGTTCCAGGGGCCC"]},
  {name:"SV40 NLS",           cat:"tag",      seqs:["CCAAAAAAGAAGAGAAAGGTA","CCTAAGAAGAAGCGGAAGGTC"]},
  {name:"P2A",                cat:"element",  seqs:["GGAAGCGGAGCTACTAACTTCAGCCTGCTGAAGCAGGCTGGAGACGTGGAGGAGAACCCTGGACCT"]},
  {name:"T2A",                cat:"element",  seqs:["GAGGGCAGAGGAAGTCTGCTAACATGCGGTGACGTCGAGGAGAATCCTGGCCCA"]},
  {name:"WPRE (5' end)",      cat:"element",  seqs:["AATCAACCTCTGGATTACAAAATTTGTGAAAGATTGACTGG"]},
  {name:"pUC/pMB1 ori",       cat:"origin",   seqs:["AAACAAAAAAACCACCGCTACCAGCGGTGG"]},
  {name:"f1 ori",             cat:"origin",   seqs:["ACGCGCCCTGTAGCGGCGCATTAAGCGCGG"]},
  {name:"SV40 polyA signal",  cat:"element",  seqs:["AACTTGTTTATTGCAGCTTATAATGGTTACAAATAAAGCA"]},
  {name:"polyA signal (AATAAA)",cat:"element",seqs:["AATAAA"], weak:true}
];

/* Protein signatures - matched against the six-frame translation.
   These are N-terminal or highly diagnostic stretches, used as seeds only. */
const PROT_SIGS = [
  {name:"AmpR (bla, TEM-1)",  cat:"marker",  pep:"MSIQHFRVALIPFFAAFCLPVFA"},
  {name:"AmpR (bla, TEM-1)",  cat:"marker",  pep:"HPETLVKVKDAEDQLGARVGYIELDLNSGKILESFRPEERFPMMSTFKVLLCGAVLSR"},
  {name:"KanR / NeoR (nptII)",cat:"marker",  pep:"MIEQDGLHAGSPAAWVERLFGYDWAQQTIGCSDAAVFRLSAQGRPVLFVKTDLSGALNELQDEAARLSWLATTG"},
  {name:"CmR (cat)",          cat:"marker",  pep:"MEKKITGYTTVDISQWHRKEHFEAFQSVAQCTYNQTVQLDITAFLKTVKKNKHKFYPAFIHILARLMNAHPEFRMAMKDGELVIWDSVHP"},
  {name:"EGFP / GFP",         cat:"reporter",pep:"MVSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTL"},
  {name:"mCherry / mRFP",     cat:"reporter",pep:"MVSKGEEDNMAIIKEFMRFKVHMEGSVNGHEFEIEGEGEGRPYEGTQTAKLKVTKGGPLPFAWDILSPQF"},
  {name:"SpCas9",             cat:"enzyme",  pep:"MDKKYSIGLDIGTNSVGWAVITDEYKVPSKKFKVLGNTDRHSIKKNLIGALLFDSGETAEATRLKRTARRRYTRRKNRICYLQEIF"},
  {name:"T7 RNA polymerase",  cat:"enzyme",  pep:"MNTINIAKNDFSDIELAAIPFNTLADHYGERLAREQLALEHESYE"},
  {name:"lacI repressor",     cat:"element", pep:"MKPVTLYDVAEYAGVSYQTVSRVVNQASHVSAKTREKVEAAMAELNYIPNRVAQQLAGKQSLLIGVATSSLALHAPSQIVAAIKSRADQLGASVVVSMVERSGVEACKAAVHNLLAQRVSGLIINYPLDDQDAIAVEAACTNVPALFLDVSDQTPINSIIFSHEDGTRLGVEHLVALGHQQIALLAGPLSSVSARLRLAGWHKYLTRNQIQPIAEREGDWSAMSGFQQTMQMLNEGIVPTAMLVANDQMALGAMRAITESGLRVGADISVVGYDDTEDSSCYIPPLTTIKQDFRLLGQTSVDRLLQLSQGQAVKGNQLLPVSLVKRKTTLAPNTQTASPRALADSLMQLARQVSRLESGQ"},
  {name:"6xHis tag",          cat:"tag",     pep:"HHHHHH"},
  {name:"FLAG tag",           cat:"tag",     pep:"DYKDDDDK"},
  {name:"HA tag",             cat:"tag",     pep:"YPYDVPDYA"},
  {name:"Myc tag",            cat:"tag",     pep:"EQKLISEEDL"},
  {name:"Strep-tag II",       cat:"tag",     pep:"WSHPQFEK"},
  {name:"TEV site",           cat:"tag",     pep:"ENLYFQ"},
  {name:"3C / PreScission site",cat:"tag",   pep:"LEVLFQGP"},
  {name:"SV40 NLS",           cat:"tag",     pep:"PKKKRKV"},
  {name:"P2A peptide",        cat:"element", pep:"GSGATNFSLLKQAGDVEENPGP"},
  {name:"T2A peptide",        cat:"element", pep:"EGRGSLLTCGDVEENPGP"}
];

/* ===================== 4. ANNOTATION ENGINE ===================== */
function findMotifs(seq, name, variants, circular){
  const out = [];
  const hay = circular ? seq + seq : seq;
  variants.forEach(v => {
    [[1, hay], [-1, revComp(hay)]].forEach(([strand, s]) => {
      let i = s.indexOf(v);
      while(i !== -1){
        let start, end;
        if(strand === 1){ start = i; end = i + v.length - 1; }
        else { end = hay.length - 1 - i; start = hay.length - i - v.length; }
        if(start < seq.length){
          const st = start % seq.length;
          const wraps = end >= seq.length;
          const en = wraps ? seq.length - 1 : end;      // clamp rather than wrap so coordinates stay ordered
          if(!out.some(o => o.start === st && o.strand === strand)) out.push({ name, start:st, end:en, strand, wraps });
        }
        i = s.indexOf(v, i + 1);
      }
    });
  });
  return out;
}
function detectDNAFeatures(seq, circular, cats){
  let out = [];
  DNA_FEATURES.filter(f => !cats || cats.includes(f.cat)).forEach(f => {
    if(f.weak) return;
    findMotifs(seq, f.name, f.seqs, circular).forEach(h => out.push(Object.assign(h, { cat:f.cat, how:"exact motif" })));
  });
  return out;
}
function detectRestrictionSites(seq, circular){
  const out = [];
  Object.keys(ENZ).forEach(n => {
    sitesOf(n, seq, circular).forEach(s =>
      out.push({ name:n, start:s.siteStart, end:s.siteStart + ENZ[n].s.length - 1, strand:1, cat:"site", how:"exact site" }));
  });
  return out;
}
/* protein-level detection over all six frames */
function detectProteinSignatures(seq, circular){
  const out = [];
  const src = circular ? seq + seq.slice(0, Math.min(seq.length, 3000)) : seq;
  [[1, src], [-1, revComp(src)]].forEach(([strand, ss]) => {
    for(let f=0; f<3; f++){
      const prot = translate(ss.slice(f));
      PROT_SIGS.forEach(sig => {
        let i = prot.indexOf(sig.pep);
        while(i !== -1){
          const ntStart = f + i*3, ntEnd = ntStart + sig.pep.length*3 - 1;
          let start, end;
          if(strand === 1){ start = ntStart; end = ntEnd; }
          else { end = src.length - 1 - ntStart; start = src.length - 1 - ntEnd; }
          if(start < seq.length && start >= 0){
            const st = start % seq.length;
            const en = Math.min(end, seq.length - 1);
            if(!out.some(o => o.start === st && o.name === sig.name))
              out.push({ name:sig.name, start:st, end:en, strand, cat:sig.cat, how:"protein signature" });
          }
          i = prot.indexOf(sig.pep, i + 1);
        }
      });
    }
  });
  return out;
}
/* sequences you have taught it: exact matches, either strand, like the built-ins */
function detectCustomFeatures(seq, circular){
  let out = [];
  (state.features || []).forEach(f => {
    const v = cleanDNA(f.seq);
    if(v.length < 8) return;
    findMotifs(seq, f.name, [v], circular).forEach(h =>
      out.push(Object.assign(h, { cat: f.kind || "custom", how: "your feature library" })));
  });
  return out;
}

/* matches to features you have already labelled on your other constructs */
function detectFromWorkspace(seq, circular, excludeId){
  let out = [];
  state.plasmids.forEach(op => {
    if(op.id === excludeId || op.type === "protein") return;
    const os = seqOf(op);
    (op.ann || []).forEach(a => {
      const sub = os.slice(a.start, a.end + 1);
      if(sub.length < 18) return;
      findMotifs(seq, a.label, [sub], circular).forEach(h =>
        out.push(Object.assign(h, { cat:"workspace", how:"matches “" + a.label + "” on " + op.name })));
    });
  });
  return out;
}
/* the full pre-check that runs on upload */
function autoAnnotate(seq, circular, excludeId){
  const feats = detectCustomFeatures(seq, circular)
    .concat(detectDNAFeatures(seq, circular))
    .concat(detectProteinSignatures(seq, circular))
    .concat(detectFromWorkspace(seq, circular, excludeId));
  // ORFs that could plausibly be a gene, rather than every stretch without a stop codon
  plausibleORFs(seq).forEach(o =>
    feats.push({ name:"ORF " + o.len + " aa (" + (o.strand===1?"+":"-") + ")", start:o.start, end:o.end,
                 strand:o.strand, cat:"orf", likely:o.likely,
                 how:"open reading frame, " + o.len + " codons" + (o.likely ? "" : " - may be chance") }));
  // collapse duplicates that cover the same span with the same name
  const seen = new Set(), uniq = [];
  feats.forEach(f => { const k = f.name + ":" + f.start + ":" + f.end; if(!seen.has(k)){ seen.add(k); uniq.push(f); } });
  uniq.sort((a,b) => a.start - b.start);
  return uniq;
}
const CAT_COLOR = { promoter:"#cfe8ff", element:"#d6f5d6", tag:"#ffe0b3", marker:"#ffc9d6", reporter:"#d9f0c2",
  origin:"#d6f0f5", enzyme:"#f3d6f5", orf:"#e8e2ff", site:"#fff2b3", workspace:"#ffd9c2", custom:"#cfe8ff" };
const PALETTE = ["#cfe8ff","#ffd9c2","#d6f5d6","#f3d6f5","#fff2b3","#d6f0f5","#ffc9d6","#d9d2ff","#c2f0e6","#ffe0b3"];


/* Six-frame ORF finding produces a lot of noise: on any sequence, some frames run
   a long way without hitting a stop by chance. Keep the ones that could actually be
   a gene - long, and not sitting inside a longer one - and mark how confident that is.
   At 100 codons a random frame is very unlikely to stay open (P(no stop) ~ 0.95^100),
   so that is the floor; only the ones well above it are ticked by default. */
function plausibleORFs(seq, minAA){
  minAA = minAA || 100;
  const all = findORFs(seq, minAA);              // already sorted longest first
  const keep = [];
  all.forEach(o => {
    const len = o.end - o.start + 1;
    const buried = keep.some(k => {
      const ov = Math.min(k.end, o.end) - Math.max(k.start, o.start) + 1;
      return ov > 0 && ov / len > 0.5;           // mostly inside something we already kept
    });
    if(!buried) keep.push(o);
  });
  const longest = keep.length ? keep[0].len : 0;
  return keep.slice(0, 4).map(o => Object.assign({}, o, {
    likely: o.len >= 150 || o.len === longest
  }));
}

/* ===================== 5. ALIGNMENT ENGINE =====================
   Seed-and-extend: exact k-mer seeds pick the diagonal, then a full
   semi-global DP inside a window around it (free gaps at both reference
   ends, the query is aligned end to end). Handles both strands and the
   circular junction.
*/
function kmerIndex(seq, k){
  const m = new Map();
  for(let i=0; i+k <= seq.length; i++){
    const s = seq.substr(i, k);
    let a = m.get(s); if(!a){ a = []; m.set(s, a); }
    if(a.length < 500) a.push(i);
  }
  return m;
}
function bestDiagonal(idx, q, k){
  const votes = new Map();
  for(let j=0; j+k <= q.length; j += Math.max(1, Math.floor(k/3))){
    const hits = idx.get(q.substr(j, k));
    if(!hits || hits.length > 60) continue;
    hits.forEach(i => { const d = i - j; votes.set(d, (votes.get(d)||0) + 1); });
  }
  let best = null, bestN = 0;
  // pool neighbouring diagonals so small indels do not split the vote
  const keys = [...votes.keys()].sort((a,b)=>a-b);
  keys.forEach(d => {
    let n = 0;
    for(let dd = d - 12; dd <= d + 12; dd++) n += votes.get(dd) || 0;
    if(n > bestN){ bestN = n; best = d; }
  });
  return { diag: best, votes: bestN };
}
const SC = { match:2, mismatch:-4, gap:-6 };
function semiGlobal(ref, qry){
  // ref may be longer than qry; leading/trailing ref gaps are free
  const n = qry.length, m = ref.length;
  if(n === 0 || m === 0) return null;
  const W = m + 1;
  const H = new Int32Array((n+1) * W);
  const T = new Uint8Array((n+1) * W);   // 0 diag, 1 up (gap in ref), 2 left (gap in qry)
  for(let j=0; j<=m; j++){ H[j] = 0; T[j] = 2; }
  for(let i=1; i<=n; i++){ H[i*W] = SC.gap * i; T[i*W] = 1; }
  for(let i=1; i<=n; i++){
    const qc = qry[i-1], row = i*W, prev = (i-1)*W;
    for(let j=1; j<=m; j++){
      const d = H[prev + j - 1] + (ref[j-1] === qc ? SC.match : SC.mismatch);
      const u = H[prev + j] + SC.gap;
      const l = H[row + j - 1] + SC.gap;
      let best = d, t = 0;
      if(u > best){ best = u; t = 1; }
      if(l > best){ best = l; t = 2; }
      H[row + j] = best; T[row + j] = t;
    }
  }
  let endJ = 0, bestScore = -Infinity;
  for(let j=0; j<=m; j++){ if(H[n*W + j] >= bestScore){ bestScore = H[n*W + j]; endJ = j; } }
  let i = n, j = endJ, ar = "", aq = "";
  while(i > 0){
    const t = T[i*W + j];
    if(t === 0){ ar = ref[j-1] + ar; aq = qry[i-1] + aq; i--; j--; }
    else if(t === 1){ ar = "-" + ar; aq = qry[i-1] + aq; i--; }
    else { ar = ref[j-1] + ar; aq = "-" + aq; j--; }
    if(j < 0) break;
  }
  return { alnRef: ar, alnQry: aq, score: bestScore, refStart: j, refEnd: endJ - 1 };
}
function alignToPlasmid(p, rawQuery){
  const ref = seqOf(p), circular = p.topology === "circular" && p.type === "dna";
  const query = cleanDNA(rawQuery);
  if(!ref.length || !query.length) return { error:"Need both a reference and a query sequence." };
  // the DP matrix is quadratic, so a very long query is refused rather than freezing the tab
  if(query.length > 4000) return { error:"Query is " + query.length + " bp. Alignment here is capped at 4 kb - split a long read into pieces." };
  const k = Math.max(8, Math.min(14, Math.floor(Math.log(ref.length) / Math.log(4)) + 3));
  const searchRef = circular ? ref + ref : ref;
  const idx = kmerIndex(searchRef, k);
  let best = null;
  [["+", query], ["-", revComp(query)]].forEach(([strand, q]) => {
    const d = bestDiagonal(idx, q, k);
    if(d.diag === null) return;
    if(!best || d.votes > best.votes) best = { strand, q, diag:d.diag, votes:d.votes };
  });
  if(!best || best.votes < 2)
    return { error:"No seed match found. This sequence does not appear to come from this construct (checked both strands)." };
  const pad = Math.max(40, Math.ceil(best.q.length * 0.12));
  let from = Math.max(0, best.diag - pad);
  let to = Math.min(searchRef.length, best.diag + best.q.length + pad);
  const win = searchRef.slice(from, to);
  const aln = semiGlobal(win, best.q);
  if(!aln) return { error:"Alignment failed." };
  const refStart = from + aln.refStart, refEnd = from + aln.refEnd;
  // walk the alignment and record every difference in reference coordinates
  const diffs = [];
  let rp = refStart, ident = 0, aligned = 0;
  for(let i=0; i<aln.alnRef.length; i++){
    const r = aln.alnRef[i], q = aln.alnQry[i];
    if(r === "-"){ diffs.push({ type:"insertion", pos: rp, ref:"-", qry:q }); }
    else if(q === "-"){ diffs.push({ type:"deletion", pos: rp, ref:r, qry:"-" }); rp++; aligned++; }
    else {
      aligned++;
      if(r === q) ident++; else diffs.push({ type:"substitution", pos: rp, ref:r, qry:q });
      rp++;
    }
  }
  // merge runs of adjacent indels into single events
  const merged = [];
  diffs.forEach(d => {
    const last = merged[merged.length-1];
    if(last && last.type === d.type && d.type !== "substitution" && d.pos <= last.pos + last.ref.length + 1 && last.pos + (last.qry === "-" ? last.ref.length : last.qry.length) >= d.pos){
      last.ref = last.ref === "-" ? "-" : last.ref + (d.ref === "-" ? "" : d.ref);
      last.qry = last.qry === "-" ? "-" : last.qry + (d.qry === "-" ? "" : d.qry);
    } else merged.push(Object.assign({}, d));
  });
  return {
    strand: best.strand, refStart, refEnd, refLen: ref.length, circular,
    alnRef: aln.alnRef, alnQry: aln.alnQry, score: aln.score,
    identity: aligned ? ident/aligned*100 : 0, matches: ident, aligned,
    diffs: merged, queryLen: query.length,
    wraps: circular && refEnd >= ref.length
  };
}
function annotationsAt(p, pos){
  const L = seqOf(p).length, x = ((pos % L) + L) % L;
  return (p.ann || []).filter(a => x >= a.start && x <= a.end);
}
