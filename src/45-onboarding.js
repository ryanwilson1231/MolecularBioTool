/* =========================================================================
   PROFILES, ONBOARDING AND THE START SCREEN
   The app has more tools than any one person needs. A profile decides which
   of them are in the way, and the Start screen decides what to do next.
   Nothing is deleted - "Show all tools" is always one click away.
   ========================================================================= */

const ALL_TOOLS = ["start","plasmids","parts","design","crispr","protein","inventory","protocols","tools","connect"];

const PROFILES = [
  { id:"cloning", icon:"🧬", title:"Cloning and constructs",
    blurb:"Design a plasmid, build it, and check the clone came back right.",
    example:"Putting a gene into an expression vector",
    tools:["start","plasmids","design","inventory","protocols","tools"] },
  { id:"crispr", icon:"✂️", title:"Genome editing",
    blurb:"Design guides, check them against your own plasmids, and plan the repair donor.",
    example:"Knocking in a tag at an endogenous locus",
    tools:["start","plasmids","crispr","design","inventory","protocols"] },
  { id:"protein", icon:"🧊", title:"Protein expression",
    blurb:"Tag it, express it, and look at the structure behind the sequence.",
    example:"A His-tagged construct for purification",
    tools:["start","plasmids","protein","design","inventory","protocols","tools"] },
  { id:"synbio", icon:"🧩", title:"Synthetic biology",
    blurb:"Keep a library of parts and compose constructs out of them.",
    example:"A four-fragment Golden Gate assembly",
    tools:["start","plasmids","parts","design","inventory","protocols"] },
  { id:"manager", icon:"🧪", title:"Running the lab",
    blurb:"Who has what, where it lives, and what still needs making.",
    example:"Finding the tube and knowing how much is left",
    tools:["start","inventory","plasmids","protocols","tools"] },
  { id:"everything", icon:"✳️", title:"Show me everything",
    blurb:"Every tool, no filtering. You can narrow it down later.",
    example:"You already know your way around",
    tools:null }
];
function profileOf(id){ return PROFILES.find(p => p.id === id) || null; }
function currentProfile(){ return profileOf(state.profile && state.profile.id); }
function visibleTools(){
  if(showAllTools) return ALL_TOOLS;
  const p = currentProfile();
  if(!p || !p.tools) return ALL_TOOLS;
  const extra = (state.profile.added || []).filter(t => ALL_TOOLS.includes(t));
  return ALL_TOOLS.filter(t => p.tools.includes(t) || extra.includes(t));
}
function toolVisible(id){ return visibleTools().includes(id); }
function isSimple(){ return (state.profile && state.profile.depth) === "simple"; }

function chooseProfile(id){
  const p = profileOf(id);
  state.profile = { id, depth: id === "everything" ? "full" : "simple", onboarded:true, added:[] };
  showAllTools = false;
  save();
  go("start");
  toast(p ? p.title + " - " + (p.tools ? p.tools.length - 1 + " tools shown" : "all tools shown") : "Ready");
}
function setDepth(d){ state.profile.depth = d; save(); render(); }
function reopenOnboarding(){ state.profile.onboarded = false; save(); render(); }
function addToolToProfile(id){
  state.profile.added = state.profile.added || [];
  if(!state.profile.added.includes(id)) state.profile.added.push(id);
  save(); go(id);
}

/* ---------------- the picker ---------------- */
function viewOnboarding(){
  const cur = state.profile && state.profile.id;
  return `<div class="onboard">
    <div class="onboard-head">
      <div class="eyebrow-ob">Welcome</div>
      <h1 class="page" style="font-size:26px">What do you work on?</h1>
      <p class="lede" style="max-width:62ch">BetterBench has tools for cloning, genome editing, protein work,
      parts libraries, inventory and protocols. Showing you all of them at once is not helpful, so pick the
      closest match and the rest get out of the way. You can change this any time, and nothing is ever deleted.</p>
    </div>
    <div class="obgrid">
      ${PROFILES.map(p => `<div class="obcard ${cur===p.id?"on":""}" onclick="chooseProfile('${p.id}')"
          tabindex="0" onkeydown="if(event.key==='Enter')chooseProfile('${p.id}')">
        <div class="obic">${p.icon}</div>
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.blurb)}</p>
        <div class="obex">e.g. ${esc(p.example)}</div>
        <div class="obtools">${(p.tools ? p.tools.filter(t => t !== "start") : ALL_TOOLS.filter(t => t !== "start"))
          .map(t => `<span class="pill grey">${esc(navLabel(t))}</span>`).join("")}</div>
      </div>`).join("")}
    </div>
    ${state.profile && state.profile.onboarded === false && currentProfile()
      ? `<div style="margin-top:18px"><button class="ghost" onclick="state.profile.onboarded=true;save();render()">‹ Cancel, keep ${esc(currentProfile().title)}</button></div>`
      : ""}
  </div>`;
}
function navLabel(id){ const n = NAV.find(x => x.id === id); return n ? n.t : id; }

/* ---------------- start screen ---------------- */
function nextActions(){
  const out = [];
  const dna = state.plasmids.filter(p => p.type === "dna");
  const unannotated = dna.filter(p => !(p.ann || []).length);
  const noStock = dna.filter(p => !p.stock.length);
  const prof = (state.profile && state.profile.id) || "cloning";

  if(!dna.length)
    out.push({ ic:"＋", t:"Add your first construct",
      why:"Paste a sequence or drop in a FASTA file. Everything else starts here.",
      go:"startCreate()" });
  else if(unannotated.length)
    out.push({ ic:"🔍", t:"Run the pre-check on " + esc(unannotated[0].name),
      why:"Finds restriction sites, promoters, tags, resistance markers and ORFs in one pass.",
      go:"openPlasmid('" + unannotated[0].id + "');runAutoAnnotate()" });

  if(dna.length && !tracksEnzymes() && toolVisible("inventory"))
    out.push({ ic:"🧊", t:"Tick the enzymes you actually own",
      why:"One minute of work, and every cloning route from then on is ranked around your freezer.",
      go:"invTab='enzymes';go('inventory')" });

  if(prof === "crispr" && dna.length && toolVisible("crispr"))
    out.push({ ic:"✂️", t:"Find guides in " + esc(dna[0].name),
      why:"PAM scan, sequence-rule scoring, and an off-target check against everything you have loaded.",
      go:"crisprState.plasmidId='" + dna[0].id + "';crisprState.guides=null;go('crispr')" });

  if(prof === "synbio" && !state.parts.length && toolVisible("parts"))
    out.push({ ic:"🧩", t:"Harvest your parts library",
      why:"Turns every label already drawn on a map into a reusable part the planner can compose with.",
      go:"go('parts');harvestParts()" });

  if(prof === "protein" && dna.length && toolVisible("protein"))
    out.push({ ic:"🧊", t:"Translate an ORF and pull its structure",
      why:"Region to ORF to UniProt to the AlphaFold model, without leaving the app.",
      go:"proteinState.sel={plasmidId:'" + dna[0].id + "'};go('protein')" });

  if(dna.length && toolVisible("design"))
    out.push({ ic:"🏗️", t:"Plan a construct you have not made yet",
      why:"Pick a backbone, say what goes in it, and get costed routes ranked against your shelf.",
      go:"go('design')" });

  if(dna.length && toolVisible("plasmids"))
    out.push({ ic:"🧬", t:"Check a sequencing read",
      why:"Paste the read; every difference comes back in construct coordinates with the codon it hits.",
      go:"openPlasmid('" + dna[0].id + "');detailTab='align';render()" });

  if(noStock.length && toolVisible("inventory"))
    out.push({ ic:"🧪", t:"Log a tube for " + esc(noStock[0].name),
      why:"Until something has a tube it is treated as designed-but-not-made everywhere in the app.",
      go:"addStock('" + noStock[0].id + "')" });

  return out.slice(0, 4);
}
function viewStart(){
  const p = currentProfile();
  const dna = state.plasmids.filter(x => x.type === "dna");
  const acts = nextActions();
  const recent = state.plasmids.slice(-4).reverse();
  const tools = visibleTools().filter(t => t !== "start");
  const ug = state.plasmids.reduce((s,x) => s + stockTotal(x), 0);
  return `<div class="lblrow" style="align-items:flex-start">
    <div>
      <h1 class="page">Start</h1>
      <p class="lede" style="margin-bottom:10px">${p ? esc(p.title) : "All tools"} &middot;
        ${tools.length} tool${tools.length===1?"":"s"} shown.
        <a href="#" onclick="reopenOnboarding();return false">Change what you work on</a></p>
    </div>
  </div>

  <div class="panel">
    <h2>Do this next</h2>
    <div class="actgrid">
      ${acts.map(a => `<div class="actcard" onclick="${a.go}" tabindex="0"
          onkeydown="if(event.key==='Enter'){${a.go}}">
        <div class="actic">${a.ic}</div>
        <div><h3>${a.t}</h3><p>${esc(a.why)}</p></div>
      </div>`).join("")}
    </div>
  </div>

  <div class="grid2">
    <div class="panel">
      <div class="lblrow"><h2 style="margin:0">Your constructs</h2>
        <button class="ghost" onclick="startCreate()">＋ New</button></div>
      ${recent.length ? recent.map(x => `<div class="comp" onclick="openPlasmid('${x.id}')">
          <span class="comp-sw" style="background:${x.stock.length?"#d6f5d6":"#ffe0b3"}"></span>
          <span class="comp-nm">${esc(x.name)}</span>
          <span class="comp-pos">${x.type==="protein" ? seqOf(x).length + " aa" : bp(seqOf(x).length)}</span>
        </div>`).join("") + (state.plasmids.length > 4
          ? `<div style="margin-top:8px"><button class="ghost" onclick="go('plasmids')">See all ${state.plasmids.length}</button></div>` : "")
        : `<div class="empty" style="padding:22px"><div class="big">🧬</div>Nothing yet.</div>`}
    </div>
    <div class="panel">
      <h2>Where things stand</h2>
      <div class="statrow">
        <div><b>${dna.length}</b><span>constructs</span></div>
        <div><b>${ug.toFixed(1)}</b><span>µg logged</span></div>
        <div><b>${dna.filter(x => !x.stock.length).length}</b><span>not made yet</span></div>
        <div><b>${tracksEnzymes() ? ownedEnzymes().length : "—"}</b><span>enzymes on shelf</span></div>
      </div>
      <div class="note info" style="margin-top:12px">Everything is stored in this browser.
        Use <b>Export</b> in the header before you rely on it &mdash; clearing site data wipes the workspace.</div>
    </div>
  </div>

  <div class="panel">
    <div class="lblrow"><h2 style="margin:0">What is switched on</h2>
      <button class="ghost" onclick="showAllTools=!showAllTools;render()">${showAllTools ? "Hide the rest" : "Show all tools"}</button></div>
    <div class="toolgrid">
      ${ALL_TOOLS.filter(t => t !== "start").map(t => {
        const on = toolVisible(t), n = NAV.find(x => x.id === t) || {};
        return `<div class="toolchip ${on?"on":""}" onclick="${on ? `go('${t}')` : `addToolToProfile('${t}')`}">
          <span class="ic">${n.ic||""}</span>
          <span><b>${esc(n.t||t)}</b><span class="muted small">${esc(TOOL_BLURB[t]||"")}</span></span>
          ${on ? "" : '<span class="pill grey">add</span>'}</div>`;
      }).join("")}
    </div>
  </div>`;
}
const TOOL_BLURB = {
  plasmids:"maps, annotation, alignment, digests",
  parts:"a reusable library of promoters, tags and ORFs",
  design:"routes, primers and protocols for a new construct",
  crispr:"guides, oligos, donors",
  protein:"translation, properties, structure",
  inventory:"tubes, enzymes, oligos, cells",
  protocols:"the standard bench protocols, scaled",
  tools:"Tm, ligation, dilution and other calculators",
  connect:"opt-in matching with other labs"
};
