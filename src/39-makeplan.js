/* =========================================================================
   "MAKE THIS"
   Given a construct that exists only as sequence, work out the shortest route
   to it from what is already in the freezer.

   The engine is a diff: find the construct you own that is closest to the
   target, chain exact matches between them, and read the route off the gaps.
   One small gap is a point mutation. One large gap is a cloning step. Many
   gaps, or no close relative at all, means ordering DNA.
   ========================================================================= */

const MAKE_K = 20;            // anchor length; long enough to be unique in a plasmid

/* Maximal exact matches of `q` inside `hay`, walked left to right. */
function makeAnchors(hay, idx, q, k){
  const out = [];
  let i = 0;
  while(i + k <= q.length){
    const hits = idx.get(q.substr(i, k));
    if(!hits || hits.length > 40){ i++; continue; }
    let best = null;
    for(const h of hits){
      let len = k;
      while(i + len < q.length && h + len < hay.length && q[i + len] === hay[h + len]) len++;
      let back = 0;
      while(i - back - 1 >= 0 && h - back - 1 >= 0 && q[i - back - 1] === hay[h - back - 1]) back++;
      const cand = { qStart: i - back, hStart: h - back, len: len + back };
      if(!best || cand.len > best.len) best = cand;
    }
    out.push(best);
    i = best.qStart + best.len;
  }
  return out;
}
/* Keep the run of anchors that advances in both sequences and explains the most
   of the target. Gaps are charged for, which matters: a repeated sequence (a tag
   that appears twice, say) offers a chain that skips a kilobase to pick up a few
   extra matched bases, and without a gap cost that chain wins and the diff is
   nonsense. A clean insertion or deletion leaves one side of the gap at zero and
   is charged little; a gap open on both sides is a replacement and costs more. */
function chainGapCost(pGap, tGap){
  return 2 * Math.min(pGap, tGap) + 0.1 * Math.abs(pGap - tGap);
}
const CHAIN_MAX_OVERLAP = 40;
/* Neighbouring anchors routinely overlap by a base or two, because each one is
   extended as far as it will go in both directions. Overlap is allowed here and
   trimmed afterwards; rejecting it outright throws away the correct chain. */
function chainAnchors(anchors){
  if(!anchors.length) return [];
  const n = anchors.length;
  const score = anchors.map(a => a.len), prev = anchors.map(() => -1);
  for(let i = 0; i < n; i++)
    for(let j = 0; j < i; j++){
      const pGap = anchors[i].hStart - (anchors[j].hStart + anchors[j].len);
      const tGap = anchors[i].qStart - (anchors[j].qStart + anchors[j].len);
      if(pGap < -CHAIN_MAX_OVERLAP || tGap < -CHAIN_MAX_OVERLAP) continue;
      if(anchors[i].hStart <= anchors[j].hStart || anchors[i].qStart <= anchors[j].qStart) continue;
      const cand = score[j] + anchors[i].len - chainGapCost(Math.max(0, pGap), Math.max(0, tGap));
      if(cand > score[i]){ score[i] = cand; prev[i] = j; }
    }
  let bi = 0; for(let i = 1; i < n; i++) if(score[i] > score[bi]) bi = i;
  const chain = [];
  for(let i = bi; i !== -1; i = prev[i]) chain.unshift(Object.assign({}, anchors[i]));
  return trimChain(chain);
}
/* Shrink each anchor so none overlaps its predecessor, leaving clean gaps. */
function trimChain(chain){
  for(let i = 1; i < chain.length; i++){
    const a = chain[i - 1], b = chain[i];
    const over = Math.max(0, (a.hStart + a.len) - b.hStart, (a.qStart + a.len) - b.qStart);
    if(over > 0 && over < b.len){ b.hStart += over; b.qStart += over; b.len -= over; }
  }
  return chain.filter(a => a.len > 0);
}
/* How does `target` differ from `parent`? Returns matched bases and the gaps. */
function diffConstructs(parent, target){
  const ps = seqOf(parent), ts = seqOf(target);
  const circular = parent.topology === "circular";
  if(!ps.length || !ts.length) return null;
  const hay = circular ? ps + ps : ps;
  const idx = kmerIndex(hay, MAKE_K);
  const chain = chainAnchors(makeAnchors(hay, idx, ts, MAKE_K));
  if(!chain.length) return { matched:0, identity:0, gaps:[], chain:[] };
  const matched = chain.reduce((s, a) => s + a.len, 0);
  const gaps = [];
  for(let i = 0; i < chain.length; i++){
    const a = chain[i], b = chain[i + 1];
    if(!b) continue;
    const pGap = b.hStart - (a.hStart + a.len);
    const tGap = b.qStart - (a.qStart + a.len);
    if(pGap || tGap)
      gaps.push({ pStart:(a.hStart + a.len) % ps.length, pLen:pGap,
                  tStart:a.qStart + a.len, tLen:tGap,
                  pSeq: hay.substr(a.hStart + a.len, pGap), tSeq: ts.substr(a.qStart + a.len, tGap) });
  }
  // sequence outside the chain at either end of the target
  const head = chain[0].qStart, tailStart = chain[chain.length-1].qStart + chain[chain.length-1].len;
  const tail = ts.length - tailStart;
  if(!circular && head) gaps.unshift({ pStart:0, pLen:0, tStart:0, tLen:head, pSeq:"", tSeq:ts.slice(0, head), end:true });
  if(!circular && tail) gaps.push({ pStart:ps.length, pLen:0, tStart:tailStart, tLen:tail, pSeq:"", tSeq:ts.slice(tailStart), end:true });
  gaps.forEach(g => leftAlignGap(ps, ts, g));
  return { matched, identity: matched / ts.length, gaps, chain,
           extraInTarget: gaps.reduce((s,g) => s + g.tLen, 0),
           missingFromTarget: gaps.reduce((s,g) => s + g.pLen, 0) };
}


/* Where an indel sits next to a repeat of itself its position is ambiguous -
   inserting A into AAAA could be called at any of five places. Shift it as far
   left as it will go, which is what variant callers do, so the position we
   report is the one a person would name. */
function leftAlignGap(ps, ts, g){
  let guard = 0;
  if(g.pLen === 0 && g.tLen > 0){                       // pure insertion
    while(g.tStart > 0 && g.pStart > 0 && guard++ < 5000 &&
          ts[g.tStart - 1] === g.tSeq[g.tSeq.length - 1]){
      g.tSeq = ts[g.tStart - 1] + g.tSeq.slice(0, -1);
      g.tStart--; g.pStart--;
    }
  } else if(g.tLen === 0 && g.pLen > 0){                // pure deletion
    while(g.pStart > 0 && guard++ < 5000 &&
          ps[g.pStart - 1] === g.pSeq[g.pSeq.length - 1]){
      g.pSeq = ps[g.pStart - 1] + g.pSeq.slice(0, -1);
      g.pStart--; g.tStart--;
    }
  }
  return g;
}
/* Apply a diff gap back to the parent - used to check the diff is self-consistent. */
function applyGap(ps, g){
  return ps.slice(0, g.pStart) + g.tSeq + ps.slice(g.pStart + g.pLen);
}

/* Everything you own, ranked by how close it is to the target. */
function findRelatives(target){
  const out = [];
  state.plasmids.forEach(p => {
    if(p.id === target.id || p.type !== "dna") return;
    const d = diffConstructs(p, target);
    if(!d || d.identity < 0.5) return;
    out.push({ parent:p, diff:d, hasStock: p.stock.length > 0, ug: stockTotal(p) });
  });
  out.sort((a, b) => (b.hasStock - a.hasStock) || (b.diff.identity - a.diff.identity)
                   || (a.diff.gaps.length - b.diff.gaps.length));
  return out;
}
/* Where could this stretch of new sequence come from? */
function sourceForFragment(seq, excludeId){
  for(const p of state.plasmids){
    if(p.id === excludeId || p.type !== "dna") continue;
    const i = seqOf(p).indexOf(seq);
    if(i !== -1) return { how: p.stock.length ? "pcr" : "blocked", from:p, at:i,
      label: p.stock.length ? "PCR from " + p.name : p.name + " has it, but has never been made" };
  }
  return { how:"order", label:"synthesise (" + bp(seq.length) + ")" };
}

/* Replace a stretch of the backbone with a new fragment: inverse-PCR the
   backbone, supply the insert with homology arms, assemble. */
function planReplacement(parent, target, gap, opts){
  opts = opts || {};
  const arm = 25;
  const ps = seqOf(parent), ts = seqOf(target);
  const polyId = opts.polymerase || defaultPolymerase();
  const targetTa = opts.targetTa || (state.lab && state.lab.targetTa) || 60;
  const needTm = tmNeededFor(polyId, targetTa, 25);
  // backbone primers point away from the region being replaced
  const fwdFrom = (gap.pStart + gap.pLen) % ps.length;
  const revTo = (gap.pStart - 1 + ps.length) % ps.length;
  const fA = pickAnnealFor(cycSub(ps, fwdFrom, 46), needTm);
  const rA = pickAnnealFor(revComp(cycSub(ps, revTo - 45, 46)), needTm);
  if(!fA || !rA) return null;
  const bbF = primerRow("backbone-F", "", fA);
  const bbR = primerRow("backbone-R", "", rA);
  bbF.reuse = findMatchingOligo(bbF.full); bbR.reuse = findMatchingOligo(bbR.full);
  // the insert, carrying homology to each side of the cut
  const insert = gap.tSeq;
  const leftArm = cycSub(ps, gap.pStart - arm, arm);
  const rightArm = cycSub(ps, (gap.pStart + gap.pLen) % ps.length, arm);
  const src = sourceForFragment(insert, target.id);
  const ordered = leftArm + insert + rightArm;
  let insF = null, insR = null;
  if(src.how === "pcr"){
    const isrc = seqOf(src.from);
    const iF = pickAnnealFor(isrc.slice(src.at, src.at + 46), needTm);
    const iR = pickAnnealFor(revComp(isrc.slice(Math.max(0, src.at + insert.length - 46), src.at + insert.length)), needTm);
    insF = primerRow("insert-F", leftArm, iF);
    insR = primerRow("insert-R", revComp(rightArm), iR);
    insF.reuse = findMatchingOligo(insF.full); insR.reuse = findMatchingOligo(insR.full);
  }
  return { kind:"replacement", arm, insert, src, ordered, bbF, bbR, insF, insR,
           ta: annealTempFor(polyId, Math.min(bbF.tm, bbR.tm), Math.min(fA.seq.length, rA.seq.length)),
           polymerase: polyId, removed: gap.pLen, added: gap.tLen };
}

/* ---- the plan itself ---- */
function makePlan(target, opts){
  opts = opts || {};
  const ts = seqOf(target);
  const out = { target, routes:[], relatives:[], haveIt:null };
  if(target.type !== "dna" || !ts.length){ out.error = "This only works on DNA constructs."; return out; }

  if(target.stock && target.stock.length){
    out.haveIt = target.stock;
    out.routes.push({ key:"have", title:"You already have it", effortDays:0, cost:0,
      why: stockTotal(target).toFixed(1) + " µg across " + target.stock.length + " tube" +
           (target.stock.length === 1 ? "" : "s") +
           (target.stock[0].loc ? ", in " + target.stock[0].loc : ""),
      steps:["Nothing to make. Check the tube is where the record says it is."], blockers:[], needs:[] });
  }

  const rel = findRelatives(target);
  out.relatives = rel.slice(0, 5);

  rel.slice(0, 3).forEach(r => {
    const d = r.diff, p = r.parent;
    const blockers = [], needs = [];
    if(!r.hasStock){
      blockers.push(p.name + " has never been made, so it cannot be a template. Make that first.");
      needs.push({ id:p.id, name:p.name });
    }

    // identical
    if(!d.gaps.length && Math.abs(seqOf(p).length - ts.length) === 0 && d.identity > 0.999){
      out.routes.push({ key:"same", title:"This is " + p.name, effortDays:0, cost:0,
        why:"The two sequences are identical. You may have the same construct recorded twice.",
        steps:["Use " + p.name + "." + (r.hasStock ? " It has " + r.ug.toFixed(1) + " µg on hand." : "")],
        blockers, needs, parent:p });
      return;
    }
    // one small gap: a point mutation
    const small = d.gaps.length === 1 && d.gaps[0].pLen <= 30 && d.gaps[0].tLen <= 30;
    if(small){
      const g = d.gaps[0];
      const edit = { kind: g.tLen === 0 ? "del" : g.pLen === 0 ? "ins" : "sub",
                     a: g.pStart, b: g.pStart + g.pLen - 1, newSeq: g.tSeq,
                     note: describeGap(g) };
      if(edit.kind === "ins") edit.b = edit.a - 1;
      const des = designMutagenesis(p, edit, { polymerase: opts.polymerase || defaultPolymerase(),
                                               targetTa: opts.targetTa || (state.lab && state.lab.targetTa) || 60 });
      if(des.ok && rotationallyEqual(des.product, ts)){
        const R = state.rates || { oligoPerBase:0.25, seqPerRead:5, daysPerClone:4 };
        out.routes.push({ key:"mutate", title:"Point mutation from " + p.name,
          effortDays: R.daysPerClone, cost: (des.fwd.len + des.rev.len) * R.oligoPerBase + 2 * R.seqPerRead,
          why: describeGap(g) + " — one PCR and a KLD reaction.",
          design: des, parent:p, edit, blockers, needs,
          steps: mutProtocol(p, des) });
        return;
      }
    }
    // one large gap: a cloning step
    const big = d.gaps.length === 1 && (d.gaps[0].tLen > 30 || d.gaps[0].pLen > 30);
    if(big){
      const g = d.gaps[0];
      const plan = planReplacement(p, target, g, opts);
      if(plan){
        const R = state.rates || { oligoPerBase:0.25, synthPerBp:0.09, seqPerRead:5, daysPerClone:4, daysPerOrder:8 };
        const nPrimers = 2 + (plan.insF ? 2 : 0);
        const cost = nPrimers * 45 * R.oligoPerBase
                   + (plan.src.how === "order" ? plan.ordered.length * R.synthPerBp : 0)
                   + 2 * R.seqPerRead;
        if(plan.src.how === "blocked"){
          blockers.push(plan.src.from.name + " carries the insert but has never been made.");
          needs.push({ id:plan.src.from.id, name:plan.src.from.name });
        }
        out.routes.push({ key:"clone", title:(g.pLen ? "Swap " + bp(g.pLen) + " of " : "Insert into ") + p.name,
          effortDays: R.daysPerClone + (plan.src.how === "order" ? R.daysPerOrder : 0),
          cost, why: describeGap(g) + ". " + plan.src.label + ".",
          replacement: plan, parent:p, blockers, needs, steps: replacementProtocol(p, target, plan) });
        return;
      }
    }
    // several differences
    if(d.gaps.length > 1)
      out.routes.push({ key:"complex", title:"Several changes from " + p.name, effortDays:null, cost:null,
        why: d.gaps.length + " separate differences, " + Math.round(d.identity * 100) + "% of the target matched. " +
             "That is more than one cloning step, so building it from parts is usually easier than editing.",
        parent:p, blockers, needs, steps:[], diff:d });
  });

  // always available
  const R = state.rates || { synthPerBp:0.09, vectorFee:35, daysPerOrder:8, seqPerRead:5 };
  const rep = synthesisReport(ts);
  out.routes.push({ key:"order", title:"Order the whole plasmid", effortDays: R.daysPerOrder + 3,
    cost: ts.length * R.synthPerBp + (R.vectorFee || 0) + 2 * R.seqPerRead,
    why: bp(ts.length) + " at " + moneyStr(R.synthPerBp) + "/bp plus a " + moneyStr(R.vectorFee || 0) +
         " cloning fee. No template needed, and no bench work.",
    report: rep, blockers:[], needs:[],
    steps:["Send the full sequence to a gene synthesis vendor, asking for it clonal in a vector rather than as a linear fragment.",
           "Check the complexity flags above first — a vendor will quote higher, or refuse, on the ones listed.",
           "Sequence-verify what comes back before using it."] });

  // cheapest-and-quickest first, but anything blocked drops below anything that is not
  out.routes.forEach(r => {
    r.score = (r.blockers.length ? -1000 : 0)
            - (r.effortDays == null ? 30 : r.effortDays) * 3
            - (r.cost == null ? 200 : r.cost) / 20
            + (r.key === "have" ? 1000 : 0);
  });
  out.routes.sort((a, b) => b.score - a.score);
  out.best = out.routes[0];
  // a blocked route that would be cheaper is the most useful thing to say
  const blocked = out.routes.filter(r => r.blockers.length && r.cost != null && r.effortDays != null);
  if(blocked.length && out.best.cost != null){
    const cheapest = blocked.reduce((a, b) => (b.cost < a.cost ? b : a));
    if(cheapest.cost < out.best.cost * 0.7)
      out.missing = { route:cheapest,
        saving: Math.round(out.best.cost - cheapest.cost),
        days: out.best.effortDays != null ? out.best.effortDays - cheapest.effortDays : null };
  }
  return out;
}
function describeGap(g){
  if(!g.pLen && g.tLen) return "an extra " + bp(g.tLen) + " at position " + (g.pStart + 1);
  if(g.pLen && !g.tLen) return bp(g.pLen) + " removed at position " + (g.pStart + 1);
  if(g.pLen === g.tLen && g.pLen <= 6)
    return g.pSeq + " → " + g.tSeq + " at position " + (g.pStart + 1);
  return bp(g.pLen) + " at position " + (g.pStart + 1) + " replaced by " + bp(g.tLen);
}
function rotationallyEqual(a, b){
  if(a.length !== b.length) return false;
  return (a + a).indexOf(b) !== -1;
}
function replacementProtocol(parent, target, plan){
  const steps = [];
  const P = polymerase(plan.polymerase);
  steps.push("Amplify the " + parent.name + " backbone with backbone-F and backbone-R. They point away from each " +
    "other either side of the region being replaced, so the product is the whole plasmid minus that region. " +
    "Anneal at " + plan.ta + " °C, extend " + P.sPerKb + " s/kb.");
  if(plan.src.how === "pcr")
    steps.push("Amplify the insert from " + plan.src.from.name + " with insert-F and insert-R, which carry " +
      plan.arm + " bp of homology to each side of the backbone cut.");
  else
    steps.push("Order the insert as a synthetic fragment. The sequence below already carries " + plan.arm +
      " bp of homology to each side of the backbone, so it needs no PCR.");
  steps.push("DpnI-treat both PCR products to remove template, then column-purify.");
  steps.push("Assemble 50–100 ng of backbone with a 2–3× molar excess of insert in 20 µL of 2× HiFi master mix, " +
    "50 °C for 15 min.");
  steps.push("Transform 2 µL, then screen by colony PCR across both junctions and sequence them.");
  return steps;
}
