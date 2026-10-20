/* =========================================================================
   PRIMER ANALYSIS
   A Gibson primer is a 5' homology tail welded onto a 3' annealing region, and
   only the annealing part has anything to do with the template you amplify from.
   Nobody should have to trim it by hand to find out where it binds or what its
   real Tm is, so this works that out: longest 3'-anchored match wins, the rest
   is tail.

   The second job is off-targets. A primer primes from its 3' end, so a site is
   dangerous when the last several bases match perfectly, however bad the 5' end
   is. Pairs of such sites facing each other are what actually produce the extra
   band on the gel, so those are enumerated too.
   ========================================================================= */

const PRIMER_MIN_ANNEAL = 12;   // below this a "match" is chance
const PRIMER_SEED_3P    = 10;   // 3' bases that must match exactly to seed a site

/* Split a primer into 5' tail and 3' annealing region against one template. */
function splitPrimer(primer, tmpl, circular){
  const p = cleanDNA(primer);
  if(p.length < PRIMER_MIN_ANNEAL) return { error:"Too short to place - " + p.length + " bases." };
  const hay = circular ? tmpl + tmpl : tmpl;
  for(let len = p.length; len >= PRIMER_MIN_ANNEAL; len--){
    const suf = p.slice(-len);
    let at = hay.indexOf(suf);
    if(at !== -1 && at < tmpl.length)
      return primerPlacement(p, suf, 1, at, tmpl, circular);
    at = hay.indexOf(revComp(suf));
    if(at !== -1 && at < tmpl.length)
      return primerPlacement(p, suf, -1, at, tmpl, circular);
  }
  return { error:"No part of this primer's 3' end matches that template." };
}
function primerPlacement(primer, anneal, strand, at, tmpl, circular){
  const tail = primer.slice(0, primer.length - anneal.length);
  const start = at % tmpl.length, end = (at + anneal.length - 1) % tmpl.length;
  return {
    primer, anneal, tail, strand,
    start, end,
    threePrime: strand === 1 ? end : start,
    annealTm: tmNN(anneal),
    fullTm: tmNN(primer),
    annealGc: gcPct(anneal),
    isGibson: tail.length >= 15,
    wraps: circular && (at + anneal.length) > tmpl.length,
    warn: primerWarnings(primer)
  };
}
/* Where else could this anneal? Seeded on the 3' end, because that is what
   has to match for a polymerase to extend. */
function primerSites(anneal, tmpl, circular, opts){
  opts = opts || {};
  const seedLen = Math.min(opts.seed || PRIMER_SEED_3P, anneal.length);
  const maxMm = opts.maxMismatch == null ? 5 : opts.maxMismatch;
  const L = tmpl.length;
  const hay = circular ? tmpl + tmpl : tmpl;
  const out = [];
  const scan = (seedSeq, strand) => {
    let i = hay.indexOf(seedSeq);
    while(i !== -1){
      if(i < L){
        const site = scoreSite(anneal, strand, i, hay, L, seedLen, circular);
        if(site && site.mismatches <= maxMm &&
           !out.some(o => o.strand === site.strand && o.threePrime === site.threePrime))
          out.push(site);
      }
      i = hay.indexOf(seedSeq, i + 1);
    }
  };
  scan(anneal.slice(-seedLen), 1);
  scan(revComp(anneal.slice(-seedLen)), -1);
  out.sort((a, b) => a.mismatches - b.mismatches || b.terminal3 - a.terminal3);
  return out;
}
/* `i` is where the 3' seed sits in the (possibly doubled) template.

   strand +1: the primer reads like the top strand. Its 3' base sits at
              i + seedLen - 1, and the primer runs leftwards from there.
   strand -1: the primer is the reverse complement of a top-strand stretch, so
              its 3' base pairs with top position i and the primer runs
              rightwards along the top strand as you walk back from its 3' end.
*/
function scoreSite(anneal, strand, i, hay, L, seedLen, circular){
  const n = anneal.length;
  const from = strand === 1 ? (i + seedLen - n) : i;          // leftmost top-strand base covered
  if(from < 0 || from + n > hay.length) return null;          // footprint falls off the template
  let mismatches = 0, matched = 0, terminal3 = 0, stillRunning = true;
  for(let k = 0; k < n; k++){                                  // k counts back from the 3' end
    const pb = anneal[n - 1 - k];
    const hb = strand === 1 ? hay[i + seedLen - 1 - k]
                            : (COMP[hay[i + k]] || "N");
    if(pb === hb){ matched++; if(stillRunning) terminal3++; }
    else { mismatches++; stillRunning = false; }
  }
  const s = ((from % L) + L) % L;
  const e = ((from + n - 1) % L + L) % L;
  return {
    strand, start:s, end:e,
    threePrime: strand === 1 ? e : s,
    mismatches, matched, terminal3,
    identity: matched / n,
    tm3: terminal3 >= 2 ? tmNN(anneal.slice(n - terminal3)) : null,
    risk: siteRisk(mismatches, terminal3, n)
  };
}
/* A polymerase extends from the 3' end, so a long perfectly matched 3' run is
   dangerous however mismatched the 5' end is - that is exactly how a primer with
   a Gibson tail works on purpose, and how a spurious band happens by accident.
   Total mismatch count matters much less. */
function siteRisk(mismatches, terminal3, n){
  if(mismatches === 0) return "exact";
  if(terminal3 >= 15 || mismatches <= 2) return "high";
  if(terminal3 >= 10 || mismatches <= 4) return "medium";
  return "low";
}
/* Every product a set of primers could make: the one you want, and the ones
   you do not. A product needs a forward site and a reverse site facing it. */
function predictAmplicons(sites, L, circular, maxLen){
  maxLen = maxLen || Math.min(L, 12000);
  const out = [];
  const fwd = sites.filter(s => s.site.strand === 1);
  const rev = sites.filter(s => s.site.strand === -1);
  fwd.forEach(f => rev.forEach(r => {
    let len = r.site.end - f.site.start + 1;
    if(len <= 0){
      if(!circular) return;
      len += L;                                  // the product crosses the origin
    }
    if(len > maxLen || len < 30) return;
    const worst = Math.max(f.site.mismatches, r.site.mismatches);
    out.push({ fwd:f, rev:r, len, start:f.site.start, end:r.site.end,
      onTarget: f.site.mismatches === 0 && r.site.mismatches === 0,
      mismatches: f.site.mismatches + r.site.mismatches,
      risk: worst === 0 ? "exact" : (f.site.risk === "low" || r.site.risk === "low") ? "low"
            : (f.site.risk === "high" || r.site.risk === "high") ? "high" : "medium" });
  }));
  out.sort((a, b) => a.mismatches - b.mismatches || a.len - b.len);
  // the same stretch of DNA is one product however many primers happen to bind its ends
  const seen = new Set(), uniq = [];
  out.forEach(a => {
    const key = a.start + ":" + a.end;
    if(seen.has(key)) return;
    seen.add(key); uniq.push(a);
  });
  return uniq;
}
/* The whole job for a pasted set of primers against one template. */
function analysePrimers(list, tmplPlasmid, opts){
  opts = opts || {};
  const tmpl = seqOf(tmplPlasmid);
  const circular = tmplPlasmid.topology === "circular";
  const polyId = opts.polymerase || defaultPolymerase();
  const rows = list.map(item => {
    const placed = splitPrimer(item.seq, tmpl, circular);
    if(placed.error) return { name:item.name, seq:cleanDNA(item.seq), error:placed.error };
    const sites = primerSites(placed.anneal, tmpl, circular, opts);
    const off = sites.filter(s => !(s.strand === placed.strand && s.threePrime === placed.threePrime));
    return { name:item.name, seq:placed.primer, placed, sites, off,
             tailSource: placed.tail ? whereDoesTailMatch(placed.tail, tmplPlasmid) : null };
  });
  const good = rows.filter(r => !r.error);
  const allSites = [];
  good.forEach(r => r.sites.forEach(s => allSites.push({ primer:r, site:s })));
  const amplicons = predictAmplicons(allSites, tmpl.length, circular, opts.maxAmplicon);
  let ta = null;
  if(good.length){
    const tms = good.map(r => r.placed.annealTm).filter(x => x != null);
    if(tms.length){
      const lo = Math.min.apply(null, tms);
      const lenOfLo = good.find(r => r.placed.annealTm === lo).placed.anneal.length;
      ta = annealTempFor(polyId, lo, lenOfLo);
    }
  }
  return { rows, amplicons, ta, polymerase:polyId, template:tmplPlasmid };
}
/* A Gibson tail is homology to whatever sits next to it in the finished
   construct. Saying where it came from turns a blob of bases into a fact. */
function whereDoesTailMatch(tail, exclude){
  const t = cleanDNA(tail);
  if(t.length < 12) return null;
  for(const p of state.plasmids){
    if(p.type !== "dna") continue;
    const s = seqOf(p);
    const hay = p.topology === "circular" ? s + s : s;
    let at = hay.indexOf(t);
    let strand = 1;
    if(at === -1){ at = hay.indexOf(revComp(t)); strand = -1; }
    if(at !== -1 && at < s.length)
      return { plasmid:p, at: at % s.length, strand, same: exclude && p.id === exclude.id };
  }
  return null;
}
/* Parse a pasted block: "name,SEQ" / "name<tab>SEQ" / ">name\nSEQ" / bare sequences. */
function parsePrimerPaste(text){
  const out = [];
  const lines = String(text || "").split(/\r?\n/);
  let pendingName = null;
  lines.forEach(raw => {
    const line = raw.trim();
    if(!line) return;
    if(line.startsWith(">")){ pendingName = line.slice(1).trim(); return; }
    const m = line.match(/^(.*?)[,;\t]\s*([ACGTNacgtn\s]+)$/);
    if(m && cleanDNA(m[2]).length >= PRIMER_MIN_ANNEAL){
      out.push({ name:m[1].trim() || ("primer " + (out.length + 1)), seq:cleanDNA(m[2]) });
      pendingName = null; return;
    }
    const seq = cleanDNA(line);
    if(seq.length >= PRIMER_MIN_ANNEAL){
      out.push({ name: pendingName || ("primer " + (out.length + 1)), seq });
      pendingName = null;
    }
  });
  return out;
}
