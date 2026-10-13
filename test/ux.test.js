console.log("\n== ORFs are filtered to plausible genes ==");
{
  const seq = seqOf(p);
  const raw = findORFs(seq, 80);
  const kept = plausibleORFs(seq);
  ok("fewer ORFs survive than the raw six-frame scan", kept.length <= raw.length,
     raw.length + " raw -> " + kept.length + " kept");
  ok("at most four are offered", kept.length <= 4, kept.length + "");
  ok("all are at least 100 codons", kept.every(o => o.len >= 100), kept.map(o=>o.len).join(","));
  ok("none is buried inside another", kept.every((o,i) => kept.every((k,j) => {
      if(i === j) return true;
      const ov = Math.min(k.end,o.end) - Math.max(k.start,o.start) + 1;
      return !(ov > 0 && ov / (o.end-o.start+1) > 0.5 && k.len > o.len);
    })), kept.map(o=>o.start+"-"+o.end).join(" "));
  ok("the longest is marked likely", kept.length === 0 || kept[0].likely);
  ok("every kept ORF really starts with ATG on its own strand",
     kept.every(o => (o.strand === 1 ? seq.substr(o.start,3) : revComp(seq.substr(o.end-2,3))) === "ATG"),
     kept.map(o => o.strand + ":" + (o.strand===1?seq.substr(o.start,3):revComp(seq.substr(o.end-2,3)))).join(" "));
  // only confident ORFs are ticked by default in the pre-check
  state.curPlasmid = p.id; p.ann = [];
  runAutoAnnotate();
  const orfRows = pendingAuto.feats.filter(r => r.f.cat === "orf");
  ok("unlikely ORFs are not ticked for you", orfRows.every(r => r.on === !!r.f.likely),
     orfRows.map(r => r.f.name + (r.on?" [on]":" [off]")).join(", "));
  ok("non-ORF hits are still ticked", pendingAuto.feats.filter(r => r.f.cat !== "orf").every(r => r.on));
}

console.log("\n== drag-select in the pre-check ==");
{
  const n = pendingAuto.feats.length;
  pendingAuto.feats.forEach(r => r.on = false);
  autoRowDown(0, { preventDefault(){}, shiftKey:false });
  ok("mousedown turns a row on", pendingAuto.feats[0].on);
  autoRowEnter(1); autoRowEnter(2);
  ok("dragging carries the same value across rows", pendingAuto.feats[1].on && pendingAuto.feats[2].on);
  autoDragEnd();
  autoRowEnter(3);
  ok("nothing changes once the drag ends", !pendingAuto.feats[3].on);
  // shift-click fills a range
  pendingAuto.feats.forEach(r => r.on = false);
  autoRowDown(0, { preventDefault(){}, shiftKey:false }); autoDragEnd();
  autoRowDown(Math.min(4, n-1), { preventDefault(){}, shiftKey:true });
  let filled = true; for(let i=0;i<=Math.min(4,n-1);i++) if(!pendingAuto.feats[i].on) filled = false;
  ok("shift-click fills everything between", filled,
     pendingAuto.feats.slice(0,5).map(r=>r.on?1:0).join(""));
  // group toggle
  autoToggleGroup("orf");
  const orfs = pendingAuto.feats.filter(r => r.f.cat === "orf");
  ok("a group toggles as a unit", orfs.every(r => r.on) || orfs.every(r => !r.on));
  pendingAuto = null;
}

console.log("\n== notes, tags and colour ==");
{
  state.curPlasmid = p.id;
  setNotes("grew slowly, clone 2 was the good one");
  ok("notes save on the construct", p.notes.indexOf("clone 2") !== -1);
  const before = (p.tags||[]).length;
  p.tags = p.tags || []; p.tags.push("zzz-test");
  removeTag("zzz-test");
  ok("a tag can be removed", !(p.tags||[]).includes("zzz-test"), (p.tags||[]).join(","));
  setCardColor(p.id, "#2f6fed");
  ok("a colour sticks to the construct", p.color === "#2f6fed");
  setCardColor(p.id, null);
  ok("a colour can be cleared", p.color === null);
  ok("new constructs carry notes and colour fields",
     "notes" in p && "color" in p);
}

console.log("\n== reordering ==");
{
  const extra = { id:uid(), name:"aaa-first", type:"dna", topology:"circular", uniprot:"", seq:"ATGC".repeat(80),
                  ann:[], stock:[], inSilico:true, tags:[], created:today(), source:"", parents:[], notes:"", color:null };
  state.plasmids.push(extra);
  const n = state.plasmids.length;
  const lastName = state.plasmids[n-1].name;
  dragFrom = n-1; cardDrop(0, { preventDefault(){}, stopPropagation(){} });
  ok("a card can be dragged to a new position", state.plasmids[0].name === lastName,
     state.plasmids.map(x=>x.name).join(" | "));
  sortConstructs();
  ok("sort A-Z orders by name", state.plasmids[0].name === "aaa-first", state.plasmids.map(x=>x.name).join(" | "));
  state.plasmids = state.plasmids.filter(x => x.id !== extra.id);
}

console.log("\n== the stock form replaces the prompt chain ==");
{
  const target = state.plasmids[0];
  const before = target.stock.length;
  addStock(target.id);
  ok("the form opens", !!stockForm && stockForm.plasmidId === target.id);
  ok("it renders", stockFormOverlay().indexOf("Add a tube") !== -1);
  ok("every field is present at once",
     ["sf-label","sf-kind","sf-conc","sf-vol","sf-date","sf-loc","sf-notes"]
       .every(id => stockFormOverlay().indexOf(id) !== -1));
  // saving with everything blank must still work - all fields are optional
  saveStock();
  ok("a blank tube still saves", target.stock.length === before + 1, target.stock.length + " tubes");
  const t = target.stock[target.stock.length-1];
  ok("it does not invent data", !t.label && !t.conc && !t.vol && !t.loc,
     JSON.stringify({l:t.label,c:t.conc,v:t.vol,loc:t.loc}));
  ok("the construct is no longer in silico", target.inSilico === false);
  editStock(target.id, t.id);
  ok("editing an existing tube opens the same form", stockForm.tubeId === t.id);
  ok("edit mode says Save", stockFormOverlay().indexOf("Edit tube") !== -1);
  stockForm = null;
  delStock(target.id, t.id);
  ok("a tube can be deleted", target.stock.length === before);
}
console.log("\n" + pass + " passed, " + fail + " failed\n");

console.log("\n== protocols are a collapsed tree ==");
{
  protoState = { open:null, n:1, filter:"", expanded:{} };
  state.view = "protocols";
  const collapsed = viewProtocols();
  const cats = [...new Set(PROTOCOLS.map(x => x.cat))];
  ok("every category appears as a branch", cats.every(c => collapsed.includes(">" + c + "<")),
     cats.join(", "));
  ok("no protocol is listed while collapsed",
     PROTOCOLS.every(x => !collapsed.includes(">" + x.name + "<")),
     PROTOCOLS.filter(x => collapsed.includes(">" + x.name + "<")).map(x=>x.name).join(", "));
  ok("branches carry a count", /class="tcount">\d+</.test(collapsed));

  toggleCat("Cloning");
  const open = viewProtocols();
  const cloning = PROTOCOLS.filter(x => x.cat === "Cloning");
  ok("expanding a branch reveals its protocols",
     cloning.every(x => open.includes(x.name)), cloning.map(x=>x.name).join(", "));
  const other = PROTOCOLS.find(x => x.cat === "Bacteria");
  ok("other branches stay shut", !open.includes(">" + other.name + "<"), other.name);

  toggleCat("Cloning");
  ok("clicking again collapses it", !viewProtocols().includes(">" + cloning[0].name + "<"));

  expandAllCats(true);
  ok("expand all opens everything", PROTOCOLS.every(x => viewProtocols().includes(x.name)));
  expandAllCats(false);
  ok("collapse all shuts everything", PROTOCOLS.every(x => !viewProtocols().includes(">" + x.name + "<")));

  // searching opens the branches that match, without changing what you had expanded
  protoState.filter = "ligase";
  const found = viewProtocols();
  ok("a search reveals matches without expanding by hand", found.includes("Ligation"), "");
  protoState.filter = "DpnI";       // appears only in step text, never in a protocol name
  const byStep = viewProtocols();
  ok("a search also matches step text",
     byStep.includes("PCR (high-fidelity)") && !PROTOCOLS.some(x => /DpnI/i.test(x.name)),
     "matched: " + PROTOCOLS.filter(x => x.steps.some(y => /DpnI/.test(y.t))).map(x=>x.name).join(", "));
  protoState.filter = "zzzz";
  ok("no matches gives a clear empty state", viewProtocols().includes("Nothing matches"));
  protoState.filter = "";

  ok("the preferred order puts Cloning before Cell culture",
     catRank("Cloning") < catRank("Cell culture"));
  ok("an unknown category sorts last", catRank("Custom") >= CAT_ORDER.length);

  // opening a leaf still works
  protoState.open = "ligation";
  const leaf = viewProtocols();
  ok("a leaf opens the protocol itself",
     leaf.includes("Ligation (T4 DNA ligase)") && leaf.includes("Reset ticks"), "");
  ok("the open protocol shows its reaction table", leaf.includes("Per 20 µL ligation"));
  protoState.open = null;
}

console.log("\n== inventory header is lean ==");
{
  state.view = "inventory"; invTab = "constructs";
  const h = viewInventory();
  ok("total plasmid DNA is gone", !/Total plasmid DNA/.test(h));
  ok("enzyme count is gone from the header", !/Enzymes on the shelf/.test(h));
  ok("oligo count is gone from the header", !/>Oligos<\/div>/.test(h));
  ok("tube count survives", /tube/.test(h));
  ok("designed-but-not-made survives", !state.plasmids.some(x=>!x.stock.length&&x.type==="dna") || /not made yet/.test(h));
  ok("the tabs still reach the reagent lists", /Enzymes/.test(h) && /Oligos/.test(h) && /Competent cells/.test(h));
}
console.log("\n" + pass + " passed, " + fail + " failed\n");

console.log("\n== the shared shelf merges rather than overwrites ==");
{
  state.lab = { me:"RW", labName:"Test lab", lastMerge:null };
  state.reagents = { enzymes:{}, oligos:[], cells:[] };
  presetEnzymes();
  addOligoDirect = (n,s2,upd) => state.reagents.oligos.push({ id:uid(), name:n, seq:s2, conc:100, vol:200,
                                                              loc:"box A", date:today(), owner:"RW", updated:upd });
  addOligoDirect("mine-F","ACGTACGTACGTACGTACGT","2026-01-01T00:00:00Z");
  const before = ownedEnzymes().length;

  const snap = { kind:"betterbench-shelf", v:1, lab:"Other lab", from:"JS", exported:"2026-09-01",
    enzymes: { SbfI:{ units:500, loc:"-20 theirs", updated:"2026-09-01T00:00:00Z", owner:"JS" },
               EcoRI:{ units:999, loc:"-20 theirs", updated:"2030-01-01T00:00:00Z", owner:"JS" } },
    oligos: [ { id:"x", name:"theirs-F", seq:"TTTTGGGGCCCCAAAATTTT", updated:"2026-09-01T00:00:00Z", owner:"JS" },
              { id:"y", name:"mine-F-older", seq:"ACGTACGTACGTACGTACGT", loc:"WRONG", updated:"2020-01-01T00:00:00Z", owner:"JS" } ],
    cells: [ { id:"c", strain:"Stbl3", date:"2026-08-01", vials:10, updated:"2026-09-01T00:00:00Z", owner:"JS" } ] };

  const plan = planShelfMerge(snap);
  ok("a preview lists what would be added", plan.added.some(x => /SbfI/.test(x)), plan.added.join(", "));
  ok("a preview lists what would be updated", plan.updated.some(x => /EcoRI/.test(x)), plan.updated.join(", "));
  ok("a preview lists what of yours wins", plan.kept.some(x => /mine-F/.test(x)), plan.kept.join(", "));
  ok("previewing changes nothing", ownedEnzymes().length === before && state.reagents.oligos.length === 1);

  const res = applyShelfMerge(snap);
  ok("new enzymes arrive", ownsEnzyme("SbfI"));
  ok("a newer remote record wins", state.reagents.enzymes.EcoRI.units === 999, JSON.stringify(state.reagents.enzymes.EcoRI));
  ok("an older remote record does not clobber yours",
     state.reagents.oligos.find(o => cleanDNA(o.seq) === "ACGTACGTACGTACGTACGT").loc === "box A",
     state.reagents.oligos.find(o => cleanDNA(o.seq) === "ACGTACGTACGTACGTACGT").loc);
  ok("their oligo is added", state.reagents.oligos.some(o => o.name === "theirs-F"));
  ok("oligos match on sequence, not name", state.reagents.oligos.length === 2,
     state.reagents.oligos.map(o=>o.name).join(", "));
  ok("their cells arrive", state.reagents.cells.some(c => c.strain === "Stbl3"));
  ok("the merge is counted", res.added > 0 && res.updated > 0, JSON.stringify(res));
  ok("nothing of yours was deleted", state.reagents.oligos.some(o => o.name === "mine-F"));

  // merging the same file twice is a no-op
  const second = applyShelfMerge(snap);
  ok("re-importing the same file changes nothing", second.added === 0 && second.updated === 0, JSON.stringify(second));

  const snapOut = shelfSnapshot();
  ok("an export carries only the shelf", !("plasmids" in snapOut) && !("parts" in snapOut),
     Object.keys(snapOut).join(","));
  ok("an export is identifiable", snapOut.kind === "betterbench-shelf");
  ok("records are stamped with an owner", state.reagents.enzymes.BamHI.owner === "RW",
     JSON.stringify(state.reagents.enzymes.BamHI));
  ok("the share tab renders", invShare().indexOf("Export shelf") !== -1);
  ok("the merge preview renders", (function(){ shelfPending = snap; const h = shelfMergeOverlay(); shelfPending = null;
     return h.indexOf("Merge") !== -1; })());
}

console.log("\n== structure ladder plumbing ==");
{
  ok("AlphaFold ids parse to an accession", afAccession("AF_AFP42212F1_1") === "P42212", afAccession("AF_AFP42212F1_1"));
  ok("a non-AlphaFold id parses to nothing", afAccession("4EUL_1") === null);
  const body = JSON.parse(rcsbBody("MVSKGEELFTG".repeat(3), 0.95, ["experimental"], 5));
  ok("the query asks for verbose results so identity comes back",
     body.request_options.results_verbosity === "verbose");
  ok("the identity cutoff is passed through", body.query.parameters.identity_cutoff === 0.95);
  ok("it searches protein, not nucleotide", body.query.parameters.sequence_type === "protein");
  proteinState.search = { running:false, steps:[{t:"x",s:"none"}], results:[], error:null, picked:null };
  ok("with no hits the ladder offers a prediction", structureLadder("MVSK").indexOf("ESMFold") !== -1);
  proteinState.search = { running:false, steps:[], picked:0, error:null,
    results:[{ kind:"homolog", entry:"1ABC", identity:0.42, coverage:0.9, name:"Something related" }] };
  ok("a relative is labelled as a stand-in, not your protein",
     structureLadder("MVSK").indexOf("relative") !== -1 && structureLadder("MVSK").indexOf("not your protein") !== -1);
  proteinState.search = null;
}
console.log("\n" + pass + " passed, " + fail + " failed\n");
