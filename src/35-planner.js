/* =========================================================================
   ASSEMBLY PLANNER
   Composes an ordered list of parts into a finished construct, designs the
   primers for it, and prices each route against what is actually on the shelf.
   ========================================================================= */

/* ---- where can this sequence come from? ---- */
function sourceOf(part){
  // a part lifted from a construct you physically have is a PCR away;
  // one from a construct that exists only as sequence is not.
  const src = part.sourceId ? state.plasmids.find(p => p.id === part.sourceId) : null;
  if(src && src.stock && src.stock.length)
    return { how:"pcr", label:"PCR from " + src.name, from:src, ug:stockTotal(src) };
  if(src)
    return { how:"blocked", label:src.name + " is designed but not made", from:src };
  // maybe the exact sequence sits inside something we do have
  for(const p of state.plasmids){
    if(p.type !== "dna" || !p.stock.length) continue;
    const i = seqOf(p).indexOf(part.seq);
    if(i !== -1) return { how:"pcr", label:"PCR from " + p.name, from:p, at:i, ug:stockTotal(p) };
  }
  return { how:"order", label:"synthesise (" + part.seq.length + " bp)" };
}

/* ---- 4 nt Golden Gate overhangs, chosen in product coordinates ----
   A junction can slide a few bases either way without changing the finished
   sequence, which is exactly how a clashing overhang gets resolved.        */
function validOverhang(o, taken){
  if(o.length !== 4 || /[^ACGT]/.test(o)) return false;
  if(o === revComp(o)) return false;                    // palindromic: ligates to itself
  if(/^(.)\1{3}$/.test(o)) return false;                // AAAA and friends ligate promiscuously
  for(const t of taken){ if(t === o || t === revComp(o)) return false; }
  return true;
}
function chooseOverhangs(product, junctions){
  const taken = [], chosen = [], problems = [];
  const order = [0,1,-1,2,-2,3,-3,4,-4,5,-5];
  junctions.forEach((j, idx) => {
    let picked = null;
    for(const d of order){
      const at = ((j + d) % product.length + product.length) % product.length;
      const o = product.substr(at, 4).length === 4 ? product.substr(at, 4)
                                                  : (product + product).substr(at, 4);
      if(validOverhang(o, taken)){ picked = { at, seq:o, shift:d }; break; }
    }
    if(!picked){
      problems.push("junction " + (idx+1) + " has no clean 4 nt overhang within 5 bp - move the boundary or add a short linker");
      const at = j, o = (product + product).substr(at, 4);
      picked = { at, seq:o, shift:0, bad:true };
    }
    taken.push(picked.seq); chosen.push(picked);
  });
  return { overhangs:chosen, problems };
}

/* ---- the assembly itself ----
   pieces[0] is the linearised backbone; the rest are inserts, in order.   */
function assemblePieces(pieces, method, opts){
  opts = opts || {};
  const arm = opts.arm || 25;
  const iis = opts.iis || "BsaI";
  const product = pieces.map(p => p.seq).join("");
  // junction k sits at the start of piece k
  const junctions = [];
  let acc = 0;
  pieces.forEach(p => { junctions.push(acc); acc += p.seq.length; });

  const warnings = [];   // things that could stop this working
  const notes = [];      // explanations of how the design was arrived at
  let overhangs = null, spans = null;

  if(method === "goldengate"){
    const oh = chooseOverhangs(product, junctions);
    overhangs = oh.overhangs;
    oh.problems.forEach(x => warnings.push(x));
    // a shifted junction moves bases between neighbours; recompute the spans
    spans = overhangs.map((o, i) => ({ start:o.at, end: overhangs[(i+1) % overhangs.length].at }));
    pieces.forEach((p, i) => {
      if(countSites(p.seq, iis) > 0)
        warnings.push(p.name + " contains an internal " + iis + " site - domesticate it or use a different enzyme");
    });
  } else {
    spans = junctions.map((j, i) => ({ start:j, end: junctions[(i+1) % junctions.length] }));
  }

  const sliceCyc = (a, b) => {
    const L = product.length;
    a = ((a % L) + L) % L; b = ((b % L) + L) % L;
    return b > a ? product.slice(a, b) : product.slice(a) + product.slice(0, b);
  };

  /* How each stretch of the product is actually obtained.
     A piece is a "core" if it is long enough to amplify AND there is a template
     to amplify it from. Short pieces ride in a neighbouring core's primer tail;
     short pieces with no core to ride on are combined and synthesised.        */
  const MIN_AMPLICON = 60, MAX_RIDER = 40;
  const cycLen = sp => { const L = product.length; return ((sp.end - sp.start) % L + L) % L || L; };
  const srcOf = i => pieces[i].source || sourceOf(pieces[i]);
  const isCore = i => cycLen(spans[i]) >= MIN_AMPLICON && srcOf(i).how === "pcr";
  const spanLen = idxs => idxs.reduce((t,k) => t + cycLen(spans[k]), 0);
  const orderUnit = idxs => ({ idxs:idxs.slice(), start:spans[idxs[0]].start,
                               end:spans[idxs[idxs.length-1]].end, lead:[], trail:[], forceOrder:true });

  const units = [{ idxs:[0], start:spans[0].start, end:spans[0].end, isBackbone:true, lead:[], trail:[] }];
  let pending = [];
  for(let i = 1; i < spans.length; i++){
    if(!isCore(i)){ pending.push(i); continue; }
    const u = { idxs:[i], coreIdx:i, start:spans[i].start, end:spans[i].end, lead:[], trail:[] };
    if(pending.length){
      if(spanLen(pending) <= MAX_RIDER){
        u.start = spans[pending[0]].start; u.lead = pending.slice(); u.idxs = pending.concat(u.idxs);
      } else units.push(orderUnit(pending));
      pending = [];
    }
    units.push(u);
  }
  if(pending.length){
    const last = units[units.length - 1];
    if(last && last.coreIdx !== undefined && spanLen(pending) <= MAX_RIDER){
      last.end = spans[pending[pending.length - 1]].end;
      last.trail = pending.slice(); last.idxs = last.idxs.concat(pending);
    } else units.push(orderUnit(pending));
  }

  units.forEach(u => {
    u.names = u.idxs.map(i => pieces[i].name);
    u.label = u.names.join(" + ");
    u.seq = sliceCyc(u.start, u.end);
    u.len = cycLen(u);
    if(u.isBackbone){ u.mode = (pieces[0].source || { how:"digest" }).how === "pcr" ? "pcr" : "digest"; return; }
    if(u.coreIdx !== undefined){
      u.mode = "pcr";
      u.src = srcOf(u.coreIdx);
      const riders = u.lead.concat(u.trail);
      if(riders.length) u.riderNames = riders.map(i => pieces[i].name);
    } else {
      u.mode = "order";
      u.why = u.idxs.length > 1 ? "combines " + u.idxs.length + " parts into one synthetic fragment"
            : srcOf(u.idxs[0]).how !== "pcr" ? srcOf(u.idxs[0]).label
            : "only " + u.len + " bp and no neighbouring PCR to carry it";
    }
  });
  units.forEach(u => { if(u.riderNames) u.riderNames.forEach(n =>
    notes.push(n + " is short enough to ride in the " + pieces[u.coreIdx].name + " primer tail rather than be made separately")); });

  // adjacent stretches that both have to be ordered are one fragment, not two
  for(let i = units.length - 1; i > 1; i--){
    const cur = units[i], prev = units[i - 1];
    if(cur.isBackbone || prev.isBackbone) continue;
    if(cur.mode !== "order" || prev.mode !== "order") continue;
    prev.end = cur.end;
    prev.idxs = prev.idxs.concat(cur.idxs);
    prev.names = prev.idxs.map(k => pieces[k].name);
    prev.label = prev.names.join(" + ");
    prev.seq = sliceCyc(prev.start, prev.end);
    prev.len = cycLen(prev);
    prev.why = "combines " + prev.names.length + " parts into one synthetic fragment";
    units.splice(i, 1);
  }

  const primers = [], orders = [];
  units.forEach((u, i) => {
    const nextU = units[(i + 1) % units.length];
    const nextOh = () => sliceCyc(nextU.start, (nextU.start + 4) % product.length);

    if(u.mode === "order"){
      const body = u.seq;
      const orderSeq = method === "goldengate"
        ? "TTT" + ENZ[iis].s + "A" + body + nextOh() + "A" + revComp(ENZ[iis].s) + "TTT"
        : sliceCyc((u.start - arm + product.length) % product.length, u.start) + body
          + sliceCyc(u.end, (u.end + arm) % product.length);
      orders.push({ label:u.label, len:body.length, orderSeq, why:u.why,
                    report: synthesisReport(orderSeq) });
      return;
    }
    if(u.mode === "digest") return;     // the backbone comes out of a digest, no primers

    // only the core has a template to anneal to; the riders live in the tails
    const core = u.coreIdx !== undefined ? spans[u.coreIdx] : { start:u.start, end:u.end };
    const coreSeq = sliceCyc(core.start, core.end);
    const lead  = sliceCyc(u.start, core.start);   // riders 5' of the core
    const trail = sliceCyc(core.end, u.end);       // riders 3' of the core
    const fA = pickAnneal(coreSeq, 62), rA = pickAnneal(revComp(coreSeq), 62);
    let fTail, rTail;
    if(method === "goldengate"){
      fTail = "TTT" + ENZ[iis].s + "A" + lead;
      rTail = "TTT" + ENZ[iis].s + "A" + revComp(trail + nextOh());
    } else {
      fTail = sliceCyc((u.start - arm + product.length) % product.length, u.start) + lead;
      rTail = revComp(trail + sliceCyc(u.end, (u.end + arm) % product.length));
    }
    const f = primerRow(u.label + "-F", fTail, fA);
    const r = primerRow(u.label + "-R", rTail, rA);
    if(fA.tooShort) f.warn.push("template under 18 bp");
    if(rA.tooShort) r.warn.push("template under 18 bp");
    if(lead.length)  f.carries = lead.length + " bp of " + (u.riderNames || []).join(" / ");
    if(trail.length) r.carries = trail.length + " bp of " + (u.riderNames || []).join(" / ");
    f.reuse = findMatchingOligo(f.full); r.reuse = findMatchingOligo(r.full);
    primers.push({ piece:u.label, len:u.len, amplicon:coreSeq.length, mode:u.mode, f, r });
  });

  // carry annotations: every piece keeps its own labels, offset into the product
  const ann = [];
  let off = 0;
  pieces.forEach(p => {
    if(p.ann) p.ann.forEach(a => {
      const s = a.start + off, e = a.end + off;
      if(e < product.length) ann.push(Object.assign({}, a, { id:uid(), start:s, end:e }));
    });
    if(p.seq.length > 0 && p.kind !== "backbone")
      ann.push({ id:uid(), start:off, end:off + p.seq.length - 1, label:p.name,
                 color: CAT_COLOR[p.kind] || PALETTE[ann.length % PALETTE.length], kind:p.kind || "custom", strand:1 });
    off += p.seq.length;
  });

  return { product, spans, units, primers, orders, overhangs, warnings, notes, ann, method, arm, iis };
}

/* ---- costing. Rough by construction, and editable in Tools. ---- */
function costRoute(route){
  const R = state.rates;
  let money = 0, days = 0, detail = [];
  const P = route.plan;
  const pcrs = P.primers.length;
  const orders = P.orders;
  const orderBp = orders.reduce((s,o) => s + o.orderSeq.length, 0);
  route.primerCount = P.primers.length * 2;
  route.newPrimers = P.primers.reduce((s,x) => s + (x.f.reuse?0:1) + (x.r.reuse?0:1), 0);
  if(route.primerCount){
    const oligoCost = route.primerCount * 45 * R.oligoPerBase;
    money += oligoCost; detail.push(route.primerCount + " primers ≈ " + moneyStr(oligoCost));
    if(route.newPrimers === 0) detail.push("all primers already in the freezer");
  }
  if(pcrs){ money += pcrs * R.enzymePerRxn; detail.push(pcrs + " PCR" + (pcrs>1?"s":"")); }
  if(orderBp){
    const c = orderBp * R.synthPerBp;
    money += c; detail.push(bp(orderBp) + " synthesised ≈ " + moneyStr(c));
  }
  const reads = Math.max(1, Math.ceil(route.productLen / 800));
  money += reads * R.seqPerRead; detail.push(reads + " sequencing reads");
  days = route.steps * R.daysPerClone + (orders.length ? R.daysPerOrder : 0);
  route.orderCount = orders.length; route.orderBp = orderBp;
  if(route.enzymesMissing && route.enzymesMissing.length)
    detail.push("plus buying " + route.enzymesMissing.join(", "));
  return { money, days, detail };
}
function moneyStr(n){ const c = (state.rates && state.rates.currency) || "$";
  return c + (n >= 100 ? Math.round(n) : Math.round(n*100)/100); }

/* ---- enumerate and rank the routes for a target ---- */
function planRoutes(backbonePlasmid, parts, cutName){
  if(!backbonePlasmid || !parts.length) return [];
  const vs = seqOf(backbonePlasmid);
  const routes = [];
  const sourced = parts.map(p => Object.assign({}, p, { source: sourceOf(p) }));
  const totalInsert = sourced.reduce((s,p) => s + p.seq.length, 0);

  // linearise the backbone: prefer a unique cutter the lab owns
  const uniq = uniqueCutters(vs, backbonePlasmid.topology === "circular");
  const cutters = Object.keys(uniq).filter(n => sourced.every(p => countSites(p.seq, n) === 0));
  const owned = cutters.filter(ownsEnzyme);
  const cut = cutName && uniq[cutName] ? cutName : (owned[0] || cutters[0] || null);

  const backbone = cut
    ? { name:"backbone", kind:"backbone", seq: vs.slice(uniq[cut].cut) + vs.slice(0, uniq[cut].cut),
        ann:(backbonePlasmid.ann||[]).map(a => shiftAnn(a, uniq[cut].cut, vs.length)).filter(Boolean),
        source:{ how: backbonePlasmid.stock.length ? "digest" : "blocked",
                 label: backbonePlasmid.stock.length ? "digest " + backbonePlasmid.name + " with " + cut
                                                     : backbonePlasmid.name + " has no physical stock" } }
    : { name:"backbone", kind:"backbone", seq: vs, ann:(backbonePlasmid.ann||[]).slice(),
        source:{ how:"pcr", label:"amplify the whole backbone" } };

  /* --- route 1: multi-fragment HiFi / Gibson --- */
  {
    const pieces = [backbone].concat(sourced);
    const plan = assemblePieces(pieces, "gibson", { arm:25 });
    const newPrimers = plan.primers.reduce((s,x) => s + (x.f.reuse?0:1) + (x.r.reuse?0:1), 0);
    routes.push(finishRoute({
      key:"gibson", title:"Multi-fragment HiFi assembly",
      why: sourced.length + " fragment" + (sourced.length>1?"s":"") + " plus backbone, 25 bp overlaps, one reaction",
      pieces, plan, sourced, backbonePlasmid, cut, steps:1,
      primerCount: plan.primers.length * 2, newPrimers,
      enzymesMissing: cut && !ownsEnzyme(cut) ? [cut] : []
    }));
  }
  /* --- route 2: Golden Gate --- */
  {
    const iis = ownsEnzyme("BsaI") ? "BsaI" : (ownsEnzyme("BsmBI") ? "BsmBI" : "BsaI");
    const pieces = [backbone].concat(sourced);
    const plan = assemblePieces(pieces, "goldengate", { iis });
    const newPrimers = plan.primers.reduce((s,x) => s + (x.f.reuse?0:1) + (x.r.reuse?0:1), 0);
    const blocked = plan.warnings.some(w => /no clean 4 nt overhang/.test(w));
    routes.push(finishRoute({
      key:"goldengate", title:"Golden Gate (" + iis + ")",
      why: blocked ? "overhangs clash - see warnings"
                   : "scarless, one pot, and repeatable once the parts are domesticated",
      pieces, plan, sourced, backbonePlasmid, cut:null, steps:1, blocked,
      primerCount: plan.primers.length * 2, newPrimers,
      enzymesMissing: ownsEnzyme(iis) ? [] : [iis]
    }));
  }
  /* --- route 3: order the whole insert as one fragment --- */
  {
    const joined = { name:"synthetic insert", kind:"custom", seq: sourced.map(p => p.seq).join(""),
                     source:{ how:"order", label:"synthesise the whole insert" } };
    joined.ann = [];
    let o = 0;
    sourced.forEach(p => { joined.ann.push({ id:uid(), start:o, end:o+p.seq.length-1, label:p.name,
                            color: CAT_COLOR[p.kind] || PALETTE[0], kind:p.kind||"custom", strand:1 }); o += p.seq.length; });
    const pieces = [backbone, joined];
    const plan = assemblePieces(pieces, "gibson", { arm:25 });
    routes.push(finishRoute({
      key:"synthesis", title:"Order the insert, then one clone",
      why:"no PCR, no part sourcing - " + bp(joined.seq.length) + " arrives ready to assemble",
      pieces, plan, sourced:[joined], backbonePlasmid, cut, steps:1,
      primerCount:0, newPrimers:0, report: synthesisReport(joined.seq),
      enzymesMissing: cut && !ownsEnzyme(cut) ? [cut] : []
    }));
  }
  /* --- route 4: classic restriction cloning, only when there is a single insert --- */
  if(sourced.length === 1){
    const r4 = restrictionRoute(backbonePlasmid, sourced[0]);
    if(r4) routes.push(r4);
  }
  routes.forEach(r => r.cost = costRoute(r));
  routes.forEach(r => r.score = scoreRoute(r));
  routes.sort((a,b) => b.score - a.score);
  return routes;
}
function shiftAnn(a, cut, L){
  const s = ((a.start - cut) % L + L) % L, e = ((a.end - cut) % L + L) % L;
  if(e < s) return null;
  return Object.assign({}, a, { start:s, end:e });
}
function finishRoute(r){
  r.productLen = r.plan.product.length;
  r.blockedParts = r.sourced.filter(p => p.source && p.source.how === "blocked");
  r.orders = r.sourced.filter(p => p.source && p.source.how === "order");
  r.warnings = r.plan.warnings.slice();
  r.notes = (r.plan.notes || []).slice();
  if(r.pieces[0].source && r.pieces[0].source.how === "blocked")
    r.warnings.push(r.pieces[0].source.label + " - make or order the backbone first");
  r.blockedParts.forEach(p => r.warnings.push(p.name + ": " + p.source.label));
  return r;
}
function scoreRoute(r){
  let s = 100;
  if(r.blocked) s -= 60;
  s -= r.warnings.length * 8;
  s -= r.blockedParts.length * 15;
  s -= r.cost.days * 1.5;
  s -= r.cost.money / 25;
  if(r.enzymesMissing.length) s -= 12 * r.enzymesMissing.length;
  if(r.newPrimers === 0 && r.primerCount > 0) s += 10;   // everything already in the freezer
  return Math.round(s);
}

/* ---- consumption: what a route would take off the shelf ---- */
function consumeForRoute(route){
  const used = [];
  if(route.cut && enzymeStock(route.cut)) used.push({ kind:"enzyme", name:route.cut, amount:1 });
  if(route.key === "goldengate"){
    const iis = route.plan.iis;
    if(enzymeStock(iis)) used.push({ kind:"enzyme", name:iis, amount:1 });
  }
  route.pieces.forEach(p => {
    if(p.source && p.source.from) used.push({ kind:"template", name:p.source.from.name, id:p.source.from.id, amount:0.05 });
  });
  return used;
}
function applyConsumption(used){
  let n = 0;
  used.forEach(u => {
    if(u.kind === "enzyme"){
      const e = state.reagents.enzymes[u.name];
      if(e && typeof e.units === "number" && e.units > 0){ e.units = Math.max(0, e.units - 10); n++; }
    } else if(u.kind === "template"){
      const p = state.plasmids.find(x => x.id === u.id);
      if(p && p.stock.length){
        const t = p.stock.find(x => x.conc && x.vol);
        if(t){ t.vol = Math.max(0, Math.round((t.vol - 1) * 10) / 10); n++; }
      }
    }
  });
  if(n) save();
  return n;
}

/* ---- shared protocol helpers (previously in the Build tab) ---- */
function restrictionProtocol(S, pair, addSites, built){
  const steps = [];
  if(addSites){
    const PP = polymerase(defaultPolymerase());
    steps.push("Amplify the insert with the two tailed primers above using " + PP.label + ", "
      + fmtTime(PP.sPerKb * S.ins.length / 1000) + " extension per cycle.");
    steps.push("DpnI-treat the PCR product (1 µL, 37 °C, 30 min) if the template was a plasmid, then column-purify.");
    steps.push("Digest the purified product with " + pair.e5 + " + " + pair.e3 + " for 1 h at 37 °C, then column-purify.");
  } else {
    steps.push("Digest " + S.insName + " with " + pair.e5 + " + " + pair.e3 + " and gel-purify the "
      + bp(built.pieceLen) + " insert band.");
  }
  steps.push("Digest 1 µg of " + S.vec.name + " with the same two enzymes for 1 h at 37 °C. Expect bands of "
    + fragments(seqOf(S.vec), S.vec.topology === "circular", [pair.e5, pair.e3]).map(f => bp(f.size)).join(" and ") + ".");
  steps.push("Gel-purify the " + bp(built.backboneLen) + " backbone band away from the " + bp(pair.dropped) + " stuffer.");
  const o5 = overhangOf(pair.e5), o3 = overhangOf(pair.e3);
  if(o5.type === "blunt" || o3.type === "blunt")
    steps.push("Dephosphorylate the backbone with rSAP (30 min, 37 °C; 5 min 65 °C) — with a blunt end, self-ligation is the main background.");
  const ins = built.pieceLen, vlen = built.backboneLen;
  const ng = (3 * ins / vlen * 50).toFixed(1);
  steps.push("Ligate: 50 ng backbone + " + ng + " ng insert (3:1 molar) in 20 µL with T4 ligase; "
    + ((o5.type === "blunt" || o3.type === "blunt") ? "2 h at room temperature or 16 °C overnight (blunt)." : "15 min at room temperature (sticky)."));
  steps.push("Transform 2-5 µL into chemically competent cells; plate on the backbone's selection. Include a vector-only control.");
  const screenEnz = pickScreeningDigest(built.product);
  if(screenEnz) steps.push("Screen colonies by " + screenEnz.names.join(" + ") + " digest — a correct clone gives "
    + screenEnz.sizes.map(bp).join(" + ") + ".");
  steps.push("Sequence across both junctions before using the clone.");
  return steps;
}
function pickScreeningDigest(product){
  const map = digestMap(product, true);
  const names = Object.keys(map).filter(n => map[n].length >= 2 && map[n].length <= 3 && !ENZ[n].iis);
  for(const n of names){
    const f = fragments(product, true, [n]);
    if(f.length >= 2 && f[f.length-1].size > 300 && (f[0].size / f[1].size) < 6)
      return { names:[n], sizes: f.map(x => x.size) };
  }
  return names.length ? { names:[names[0]], sizes: fragments(product, true, [names[0]]).map(x => x.size) } : null;
}
function protocolList(steps){
  return `<ol style="padding-left:20px;margin:6px 0;line-height:1.7;font-size:12.5px">
    ${steps.map(s => `<li style="margin-bottom:5px">${s}</li>`).join("")}</ol>`;
}

/* ---- classic two-enzyme cloning, shaped like every other route ----
   This is what the old Build tab did; it lives here so a single-insert job and a
   five-part assembly are the same question with different answers.            */
function restrictionRoute(vec, part){
  const vs = seqOf(vec);
  const pairs = suggestEnzymePairs(vs, vec.topology === "circular", part.seq, Math.floor(vs.length * 0.5));
  if(!pairs.length) return null;
  const pair = pairs[0];
  const head = part.seq.slice(0, 40), tail = part.seq.slice(-40);
  const ready = head.indexOf(ENZ[pair.e5].s) !== -1 && tail.indexOf(ENZ[pair.e3].s) !== -1;
  const built = buildRestrictionProduct(vec, part.seq, part.ann || [], pair, !ready);
  const src = part.source || sourceOf(part);

  const primers = [];
  if(!ready){
    const fA = pickAnneal(part.seq, 61), rA = pickAnneal(revComp(part.seq), 61);
    const f = primerRow(part.name + "-F", "TTT" + ENZ[pair.e5].s, fA);
    const r = primerRow(part.name + "-R", "TTT" + revComp(ENZ[pair.e3].s), rA);
    f.reuse = findMatchingOligo(f.full); r.reuse = findMatchingOligo(r.full);
    primers.push({ piece:part.name, len:part.seq.length, amplicon:part.seq.length, mode:"pcr", f, r });
  }
  const units = [
    { label:"backbone", isBackbone:true, mode:"digest", len:built.backboneLen,
      why:"cut with " + pair.e5 + " + " + pair.e3 + ", dropping " + bp(pair.dropped) },
    { label:part.name, mode: ready ? "digest" : (src.how === "pcr" ? "pcr" : "order"),
      len:built.pieceLen,
      why: ready ? "already carries both sites" : src.how === "pcr" ? src.label : src.label }
  ];
  const warnings = [], notes = [];
  const o5 = overhangOf(pair.e5), o3 = overhangOf(pair.e3);
  if(o5.type === "blunt" || o3.type === "blunt")
    warnings.push("one end is blunt, so self-ligation is the main background - dephosphorylate the backbone");
  if(ENZ[pair.e5].dam || ENZ[pair.e3].dam)
    warnings.push("blocked by Dam methylation in a standard dam+ strain - grow the plasmid in a dam- strain");
  notes.push(ready ? "the insert already carries " + pair.e5 + " and " + pair.e3 + ", so no PCR is needed"
                   : "sites are added by PCR with tailed primers");
  const orders = src.how === "order" && !ready
    ? [{ label:part.name, len:part.seq.length,
         orderSeq:"TTT" + ENZ[pair.e5].s + part.seq + ENZ[pair.e3].s + "TTT",
         why:src.label, report:synthesisReport(part.seq) }] : [];

  const plan = { product:built.product, units, primers, orders, overhangs:null, warnings, notes,
                 ann:built.ann, method:"restriction", pair, ready, built, arm:0, iis:null,
                 spans:[] };
  return finishRoute({
    key:"restriction",
    title:"Restriction cloning (" + pair.e5 + " + " + pair.e3 + ")",
    why: ready ? "both sites are already on the insert - digest, ligate, done"
               : "the oldest route, and still the cheapest when a clean pair exists",
    pieces:[{ name:"backbone", kind:"backbone", seq:"", source:{ how: vec.stock.length ? "digest" : "blocked",
                label: vec.stock.length ? "digest " + vec.name : vec.name + " has no physical stock" } },
            Object.assign({}, part, { source:src })],
    plan, sourced:[part], backbonePlasmid:vec, cut:null, steps:1,
    primerCount: primers.length * 2,
    newPrimers: primers.reduce((s,x) => s + (x.f.reuse?0:1) + (x.r.reuse?0:1), 0),
    enzymesMissing: [pair.e5, pair.e3].filter(n => !ownsEnzyme(n))
  });
}
