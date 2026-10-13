console.log("\n== diffing a target against what you own ==");
{
  const base = state.plasmids.find(x => x.type === "dna" && x.topology === "circular");
  const bs = seqOf(base);
  const mk = (name, seq, stock) => {
    const p = { id:uid(), name, type:"dna", topology:"circular", uniprot:"", seq, ann:[],
                stock: stock ? [{ id:uid(), kind:"miniprep", label:"c1", conc:200, vol:50, loc:"-20 A/1", date:today(), notes:"" }] : [],
                inSilico:!stock, tags:[], created:today(), source:"", parents:[], notes:"", color:null };
    state.plasmids.push(p); return p;
  };
  const added = [];
  const clean = () => { added.forEach(p => { state.plasmids = state.plasmids.filter(x => x.id !== p.id); }); added.length = 0; };

  // identical
  const twin = mk("twin", bs, true); added.push(twin);
  let d = diffConstructs(base, twin);
  ok("an identical construct shows no gaps", d.gaps.length === 0, JSON.stringify(d.gaps.length));
  ok("and full identity", d.identity > 0.999, d.identity.toFixed(3));

  // one substitution
  const subSeq = bs.slice(0, 400) + (bs[400] === "A" ? "C" : "A") + bs.slice(401);
  const sub = mk("sub", subSeq, false); added.push(sub);
  d = diffConstructs(base, sub);
  ok("a point substitution gives exactly one gap", d.gaps.length === 1, JSON.stringify(d.gaps));
  ok("the gap is one base each side", d.gaps[0].pLen === 1 && d.gaps[0].tLen === 1,
     d.gaps[0].pLen + "/" + d.gaps[0].tLen);
  ok("at the right position", Math.abs(d.gaps[0].pStart - 400) <= 1, d.gaps[0].pStart + "");

  // a deletion
  const delSeq = bs.slice(0, 300) + bs.slice(360);
  const del = mk("del", delSeq, false); added.push(del);
  d = diffConstructs(base, del);
  ok("a deletion gives one gap with nothing on the target side",
     d.gaps.length === 1 && d.gaps[0].tLen === 0 && d.gaps[0].pLen === 60,
     JSON.stringify(d.gaps.map(g => g.pLen + "/" + g.tLen)));
  ok("applying the deletion gap rebuilds the target",
     rotationallyEqual(applyGap(bs, d.gaps[0]), delSeq), "");

  // an insertion
  const ins = "ATGGACTACAAGGACGACGATGACAAG".repeat(3);
  const insSeq = bs.slice(0, 500) + ins + bs.slice(500);
  const insP = mk("ins", insSeq, false); added.push(insP);
  d = diffConstructs(base, insP);
  ok("an insertion gives one gap with nothing on the parent side",
     d.gaps.length === 1 && d.gaps[0].pLen === 0 && d.gaps[0].tLen === ins.length,
     JSON.stringify(d.gaps.map(g => g.pLen + "/" + g.tLen)));
  ok("the inserted sequence is the right length", d.gaps[0].tSeq.length === ins.length, d.gaps[0].tSeq.length + "");
  // the assertion that actually matters: applying the gap to the parent rebuilds the target
  ok("applying the reported gap to the parent rebuilds the target",
     rotationallyEqual(applyGap(bs, d.gaps[0]), insSeq), applyGap(bs, d.gaps[0]).length + " vs " + insSeq.length);
  ok("the insertion is reported at its leftmost equivalent position",
     d.gaps[0].tStart <= 500, d.gaps[0].tStart + "");

  // two separate changes
  let twoSeq = bs.slice(0, 200) + "TTTT" + bs.slice(204);
  twoSeq = twoSeq.slice(0, 700) + "GGGG" + twoSeq.slice(704);
  const two = mk("two", twoSeq, false); added.push(two);
  d = diffConstructs(base, two);
  ok("two changes give two gaps", d.gaps.length === 2, d.gaps.length + "");

  // unrelated
  const junk = mk("junk", "ATGCATGCTTAGGCCTAAGC".repeat(50), false); added.push(junk);
  d = diffConstructs(base, junk);
  ok("an unrelated sequence matches almost nothing", d.identity < 0.3, d.identity.toFixed(3));
  clean();
}

console.log("\n== the make plan picks the shortest honest route ==");
{
  const base = state.plasmids.find(x => x.type === "dna" && x.topology === "circular");
  const bs = seqOf(base);
  const added = [];
  const mk = (name, seq, stock) => {
    const p = { id:uid(), name, type:"dna", topology:"circular", uniprot:"", seq, ann:[],
                stock: stock ? [{ id:uid(), kind:"miniprep", label:"c1", conc:200, vol:50, loc:"-20 A/1", date:today(), notes:"" }] : [],
                inSilico:!stock, tags:[], created:today(), source:"", parents:[], notes:"", color:null };
    state.plasmids.push(p); added.push(p); return p;
  };
  const clean = () => { added.forEach(p => { state.plasmids = state.plasmids.filter(x => x.id !== p.id); }); added.length = 0; };
  const hasStockOnBase = base.stock.length > 0;
  ok("the template we diff against is one we own", hasStockOnBase);

  // a point mutant of something we have
  const mutSeq = bs.slice(0, 400) + (bs[400] === "A" ? "C" : "A") + bs.slice(401);
  const target = mk("pTarget-mut", mutSeq, false);
  let plan = makePlan(target, {});
  ok("a route is found", plan.routes.length > 0, plan.routes.map(r => r.key).join(", "));
  ok("mutagenesis wins for a single base change", plan.best.key === "mutate",
     plan.routes.map(r => r.key + ":" + Math.round(r.score)).join(" "));
  ok("it names the parent", /pDemo|base/i.test(plan.best.title) || !!plan.best.parent, plan.best.title);
  ok("it carries a real primer design", !!plan.best.design && plan.best.design.ok);
  ok("the designed product really is the target",
     rotationallyEqual(plan.best.design.product, seqOf(target)), "");
  ok("it is cheaper than ordering the plasmid",
     plan.best.cost < plan.routes.find(r => r.key === "order").cost,
     Math.round(plan.best.cost) + " vs " + Math.round(plan.routes.find(r => r.key === "order").cost));
  ok("ordering is always offered as a fallback", plan.routes.some(r => r.key === "order"));
  ok("the protocol is not empty", plan.best.steps.length > 2, plan.best.steps.length + " steps");
  clean();

  // a big insert, with the insert living in another construct we own
  const donorFrag = "ATGGCTAAAGAACTGATTGTGCTGGCCTACAGCGGCGGCCTGGAAGTGCTGTTTCAGGGACCCAGCGGC";
  const donor = mk("pDonor", "GGCCTAAGCTTGGATCC" + donorFrag + "AAGCTTGGATCCGGCCTAAG".repeat(8), true);
  const bigSeq = bs.slice(0, 500) + donorFrag + bs.slice(500);
  const bigTarget = mk("pTarget-insert", bigSeq, false);
  plan = makePlan(bigTarget, {});
  ok("a large insertion is a cloning route, not a mutation", plan.best.key === "clone",
     plan.routes.map(r => r.key).join(", "));
  ok("it finds the donor we already own",
     plan.best.replacement && plan.best.replacement.src.how === "pcr",
     plan.best.replacement ? plan.best.replacement.src.label : "none");
  ok("it designs backbone primers", !!(plan.best.replacement && plan.best.replacement.bbF && plan.best.replacement.bbR));
  ok("it designs insert primers with homology arms",
     !!(plan.best.replacement && plan.best.replacement.insF &&
        plan.best.replacement.insF.tail.length === plan.best.replacement.arm),
     plan.best.replacement && plan.best.replacement.insF ? plan.best.replacement.insF.tail.length + "" : "none");
  clean();

  // the same, but the donor has never been made
  const donor2 = mk("pGhostDonor", "GGCCTAAGCTTGGATCC" + donorFrag + "AAGCTTGGATCCGGCCTAAG".repeat(8), false);
  const bigTarget2 = mk("pTarget-insert2", bigSeq, false);
  plan = makePlan(bigTarget2, {});
  const cloneRoute = plan.routes.find(r => r.key === "clone");
  ok("a donor that was never made is called out",
     cloneRoute && cloneRoute.blockers.some(b => /never been made/.test(b)),
     cloneRoute ? cloneRoute.blockers.join(" | ") : "no clone route");
  ok("a blocked route does not win", plan.best.key !== "clone" || !plan.best.blockers.length,
     plan.best.key + " blockers:" + plan.best.blockers.length);
  clean();

  // something we already physically have
  const owned = mk("pOwned", bs.slice(0, 600) + "TTTTAAAACCCCGGGG" + bs.slice(616), true);
  plan = makePlan(owned, {});
  ok("a construct you already have says so first", plan.best.key === "have", plan.best.key);
  ok("and tells you where it is", /A\/1|µg/.test(plan.best.why), plan.best.why);
  clean();

  // nothing related at all
  const orphan = mk("pOrphan", "ATGCGTACGTTAGCCATGGCATTAGCCGTATCGGATCCGTTAACGGCATTAGC".repeat(20), false);
  plan = makePlan(orphan, {});
  ok("with no relative, ordering is the only route", plan.best.key === "order",
     plan.routes.map(r => r.key).join(", "));
  ok("it says there is no template", plan.relatives.length === 0, plan.relatives.length + " relatives");
  ok("it still runs a synthesis complexity check", !!plan.best.report);
  clean();

  // a protein construct is refused clearly
  const prot = { id:uid(), name:"prot", type:"protein", topology:"linear", seq:"MKALIVL", ann:[], stock:[],
                 tags:[], created:today(), source:"", parents:[], notes:"", color:null, inSilico:true, uniprot:"" };
  state.plasmids.push(prot);
  ok("a protein construct is refused with a reason", !!makePlan(prot, {}).error, makePlan(prot, {}).error);
  state.plasmids = state.plasmids.filter(x => x.id !== prot.id);
}

console.log("\n== the make panel renders ==");
{
  const base = state.plasmids.find(x => x.type === "dna" && x.topology === "circular");
  const bs = seqOf(base);
  const t = { id:uid(), name:"pRenderTest", type:"dna", topology:"circular", uniprot:"",
              seq: bs.slice(0, 400) + (bs[400] === "A" ? "C" : "A") + bs.slice(401),
              ann:[], stock:[], inSilico:true, tags:[], created:today(), source:"", parents:[], notes:"", color:null };
  state.plasmids.push(t);
  try {
    openMake(t.id);
    ok("the overlay opens", makeOverlay().indexOf("How to make pRenderTest") !== -1);
    ok("it lists the routes", makeOverlay().indexOf("routecard") !== -1);
    ok("it names the closest relative", /Closest thing you own/.test(makeOverlay()));
    makeCache.routes.forEach((r, i) => { makePick = i; makeOverlay(); });
    ok("every route renders its detail", true);
    closeMake();
    ok("closing clears it", makeFor === null && makeOverlay() === "");
  } catch(e){ ok("the make panel renders", false, e.message + " @ " + (e.stack||"").split("\n")[1]); }
  state.plasmids = state.plasmids.filter(x => x.id !== t.id);
}
console.log("\n" + pass + " passed, " + fail + " failed\n");

console.log("\n== it tells you what you are missing ==");
{
  const base = state.plasmids.find(x => x.type === "dna" && x.topology === "circular");
  const bs = seqOf(base);
  const added = [];
  const mk = (name, seq, stock) => {
    const p = { id:uid(), name, type:"dna", topology:"circular", uniprot:"", seq, ann:[],
      stock: stock ? [{ id:uid(), kind:"miniprep", label:"c1", conc:200, vol:50, loc:"-20 A/1", date:today(), notes:"" }] : [],
      inSilico:!stock, tags:[], created:today(), source:"", parents:[], notes:"", color:null };
    state.plasmids.push(p); added.push(p); return p;
  };
  const clean = () => { added.forEach(p => { state.plasmids = state.plasmids.filter(x => x.id !== p.id); }); added.length = 0; };

  const frag = "ATGGCTAAAGAACTGATTGTGCTGGCCTACAGCGGCGGCCTGGAAGTGCTGTTTCAGGGACCCAGCGGC";
  const ghost = mk("pGhostDonor", "GGCCTAAGCTTGGATCC" + frag + "AAGCTTGGATCCGGCCTAAG".repeat(8), false);
  const target = mk("pNeedsGhost", bs.slice(0, 500) + frag + bs.slice(500), false);

  let plan = makePlan(target, {});
  const clone = plan.routes.find(r => r.key === "clone");
  ok("the blocked route names what is missing", clone && clone.needs.length === 1 &&
     clone.needs[0].name === "pGhostDonor", JSON.stringify(clone && clone.needs));
  ok("a blocked route does not become the recommendation", plan.best.blockers.length === 0, plan.best.key);
  ok("but the cheaper blocked route is surfaced", !!plan.missing,
     plan.missing ? plan.missing.route.title : "not surfaced");
  ok("with the saving quantified", plan.missing && plan.missing.saving > 0, plan.missing && plan.missing.saving + "");
  ok("and a way through to making it", plan.missing && plan.missing.route.needs[0].id === ghost.id);

  // the chain: making the donor first is itself plannable
  const donorPlan = makePlan(ghost, {});
  ok("the missing construct has its own plan", donorPlan.routes.length > 0,
     donorPlan.routes.map(r => r.key).join(", "));

  // once it exists, the block lifts and the cheap route wins
  ghost.stock = [{ id:uid(), kind:"miniprep", label:"c1", conc:200, vol:50, loc:"-20 B/4", date:today(), notes:"" }];
  ghost.inSilico = false;
  plan = makePlan(target, {});
  ok("logging a tube unblocks the route", plan.best.key === "clone", plan.best.key);
  ok("and nothing is flagged as missing any more", !plan.missing);
  ok("the recommendation now has no blockers", plan.best.blockers.length === 0);
  clean();
}
console.log("\n" + pass + " passed, " + fail + " failed\n");
