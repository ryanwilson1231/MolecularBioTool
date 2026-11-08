/* =========================================================================
   MANUAL AND GUIDED TOUR
   Two different jobs, which is why this is one tool with two halves.

   The manual answers "what is this thing doing and why", with diagrams,
   because the three things people get wrong about BetterBench - what the
   pre-check is, what half of a primer actually anneals, and why the cheapest
   route depends on your freezer - are all spatial and all unreadable as prose.

   The tour answers "where do I click", by driving the real app rather than
   showing pictures of it. Every step navigates somewhere real and puts a ring
   round a real element, so nothing can go stale the way a screenshot does.
   ========================================================================= */

let manualState = { section: "overview" };
let tourState = { on:false, i:0 };

/* ---------- diagrams ----------
   Inline SVG, theme variables only, no external anything. Each one is drawn to
   explain a single mechanism and is captioned with the thing it is there to fix. */

function dgWorkflow(){
  const box = (x, y, w, t, sub) => `
    <rect x="${x}" y="${y}" width="${w}" height="46" rx="8" fill="var(--panel2)" stroke="var(--line)"/>
    <text x="${x + w/2}" y="${y + 20}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--fg)">${t}</text>
    <text x="${x + w/2}" y="${y + 35}" text-anchor="middle" font-size="10" fill="var(--muted)">${sub}</text>`;
  const arrow = (x1, x2, y) => `
    <line x1="${x1}" y1="${y}" x2="${x2 - 7}" y2="${y}" stroke="var(--line)" stroke-width="1.5"/>
    <path d="M${x2 - 7},${y - 4} L${x2},${y} L${x2 - 7},${y + 4}" fill="var(--line)"/>`;
  return `<svg viewBox="0 0 760 210" class="dg" role="img" aria-label="How a construct moves through BetterBench">
    ${box(10, 20, 130, "Sequence in", "paste or FASTA")}
    ${arrow(140, 175, 43)}
    ${box(175, 20, 130, "Pre-check", "what is in it")}
    ${arrow(305, 340, 43)}
    ${box(340, 20, 130, "Design", "routes, costed")}
    ${arrow(470, 505, 43)}
    ${box(505, 20, 120, "Make", "primers, protocol")}
    ${arrow(625, 645, 43)}
    ${box(645, 20, 105, "Verify", "align a read")}

    <rect x="175" y="120" width="295" height="50" rx="8" fill="var(--accent-soft)" stroke="var(--line)"/>
    <text x="322" y="140" text-anchor="middle" font-size="12" font-weight="600" fill="var(--fg)">Inventory</text>
    <text x="322" y="156" text-anchor="middle" font-size="10" fill="var(--muted)">tubes, enzymes, oligos, cells</text>

    <line x1="240" y1="120" x2="240" y2="70" stroke="var(--line)" stroke-width="1.5" stroke-dasharray="3 3"/>
    <path d="M236,74 L240,66 L244,74" fill="var(--line)"/>
    <line x1="405" y1="120" x2="405" y2="70" stroke="var(--line)" stroke-width="1.5" stroke-dasharray="3 3"/>
    <path d="M401,74 L405,66 L409,74" fill="var(--line)"/>
    <text x="322" y="188" text-anchor="middle" font-size="10.5" fill="var(--muted)">
      what you own changes what the pre-check recognises and which route is cheapest</text>
  </svg>
  <p class="dgcap">The dotted lines are the part other tools do not have. Your freezer is an input to the
  design, not a separate spreadsheet: a route that needs an enzyme you do not own is ranked below one that
  does, and the pre-check recognises sequences you already have in the workspace.</p>`;
}

function dgPrimer(){
  return `<svg viewBox="0 0 760 230" class="dg" role="img" aria-label="Anatomy of a Gibson primer">
    <text x="10" y="18" font-size="11" fill="var(--muted)">the primer you paste in</text>
    <rect x="10" y="26" width="250" height="26" rx="4" fill="#cbd5e1" stroke="var(--line)"/>
    <rect x="260" y="26" width="220" height="26" rx="4" fill="var(--accent-soft)" stroke="var(--line)"/>
    <text x="135" y="43" text-anchor="middle" font-size="11" font-weight="600" fill="#37475b">5' tail &mdash; 25 bp</text>
    <text x="370" y="43" text-anchor="middle" font-size="11" font-weight="600" fill="var(--fg)">3' annealing region &mdash; 22 nt</text>
    <text x="490" y="43" font-size="11" fill="var(--muted)">3'</text>

    <text x="10" y="86" font-size="11" fill="var(--muted)">the template it is used on</text>
    <rect x="260" y="94" width="470" height="26" rx="4" fill="var(--panel2)" stroke="var(--line)"/>
    <text x="495" y="111" text-anchor="middle" font-size="11" fill="var(--muted)">your plasmid</text>
    <line x1="260" y1="52" x2="260" y2="94" stroke="var(--green,#2e8b57)" stroke-width="1.5"/>
    <line x1="480" y1="52" x2="480" y2="94" stroke="var(--green,#2e8b57)" stroke-width="1.5"/>
    <text x="370" y="72" text-anchor="middle" font-size="10.5" fill="var(--green,#2e8b57)">only this part matches</text>

    <text x="10" y="152" font-size="11" fill="var(--muted)">what the tail is for</text>
    <rect x="10" y="160" width="250" height="26" rx="4" fill="#cbd5e1" stroke="var(--line)"/>
    <text x="135" y="177" text-anchor="middle" font-size="11" fill="#37475b">homology to the neighbour</text>
    <text x="275" y="177" font-size="11" fill="var(--muted)">&rarr; this is what Gibson glues to, after the PCR</text>

    <text x="10" y="214" font-size="11.5" fill="var(--fg)" font-weight="600">Set the annealing temperature from the 22 nt, not the 47.</text>
  </svg>
  <p class="dgcap">This is the single most common way to lose a Gibson PCR. The full 47-mer has a much higher
  Tm than the part that actually binds in the first cycle, so a thermocycler programmed from the full-length
  Tm anneals far too hot and gives you nothing. Paste a primer into the Primers tool and it splits it for
  you &mdash; longest 3'-anchored match wins, the rest is tail &mdash; and quotes the Tm of the annealing part only.</p>`;
}

function dgMutagenesis(){
  return `<svg viewBox="0 0 760 250" class="dg" role="img" aria-label="Back-to-back mutagenesis primers">
    <circle cx="200" cy="125" r="86" fill="none" stroke="var(--line)" stroke-width="12"/>
    <text x="200" y="121" text-anchor="middle" font-size="12" font-weight="600" fill="var(--fg)">your plasmid</text>
    <text x="200" y="137" text-anchor="middle" font-size="10" fill="var(--muted)">whole thing is the product</text>

    <path d="M200,27 A86,86 0 0,1 268,61" fill="none" stroke="var(--accent,#4f7cff)" stroke-width="11" stroke-linecap="round"/>
    <path d="M200,27 A86,86 0 0,0 132,61" fill="none" stroke="#2e8b57" stroke-width="11" stroke-linecap="round"/>
    <circle cx="200" cy="27" r="5.5" fill="#e8532f"/>
    <text x="292" y="52" font-size="11" fill="var(--accent,#4f7cff)" font-weight="600">forward &rarr;</text>
    <text x="292" y="67" font-size="10.5" fill="var(--muted)">carries the change</text>
    <text x="22" y="52" font-size="11" fill="#2e8b57" font-weight="600" text-anchor="start">&larr; reverse</text>
    <text x="22" y="67" font-size="10.5" fill="var(--muted)">pure template</text>
    <text x="200" y="14" text-anchor="middle" font-size="10.5" fill="#e8532f">the edit</text>

    <text x="400" y="36" font-size="12" font-weight="600" fill="var(--fg)">They point away from each other.</text>
    <text x="400" y="56" font-size="11" fill="var(--muted)">Their 5' ends meet at the edit, so the PCR copies</text>
    <text x="400" y="72" font-size="11" fill="var(--muted)">the whole plasmid once, as a linear product.</text>

    <text x="400" y="104" font-size="12" font-weight="600" fill="var(--fg)">Only the forward one is mutated.</text>
    <text x="400" y="124" font-size="11" fill="var(--muted)">Round one makes one strand carrying the change.</text>
    <text x="400" y="140" font-size="11" fill="var(--muted)">From round two on, the reverse primer copies</text>
    <text x="400" y="156" font-size="11" fill="var(--muted)">that strand too, so the mutant takes over.</text>

    <text x="400" y="188" font-size="12" font-weight="600" fill="var(--fg)">Then KLD, in one tube.</text>
    <text x="400" y="208" font-size="11" fill="var(--muted)">Kinase phosphorylates the ends, ligase closes the</text>
    <text x="400" y="224" font-size="11" fill="var(--muted)">circle, DpnI destroys the methylated template.</text>
  </svg>
  <p class="dgcap">There is no overlap between the two primers, which is what makes this different from
  QuikChange. Overlapping mutagenic primers mostly anneal to each other; back-to-back ones cannot, which is
  why this version works at normal cycle numbers and needs no special polymerase.</p>`;
}

function dgRanking(){
  const bar = (y, label, w, money, colour, note) => `
    <text x="10" y="${y + 13}" font-size="11.5" fill="var(--fg)">${label}</text>
    <rect x="215" y="${y}" width="${w}" height="18" rx="4" fill="${colour}"/>
    <text x="${225 + w}" y="${y + 13}" font-size="11" fill="var(--muted)">${money}${note ? " &middot; " + note : ""}</text>`;
  return `<svg viewBox="0 0 760 190" class="dg" role="img" aria-label="How routes are ranked">
    <text x="10" y="14" font-size="11" fill="var(--muted)">the same job, four ways</text>
    ${bar(26, "Restriction cloning", 70, "$40", "#2e8b57", "4 days, enzymes you own")}
    ${bar(60, "Gibson assembly", 72, "$40", "#2e8b57", "4 days")}
    ${bar(94, "Golden Gate", 72, "$40", "#c9a227", "4 days, needs BsaI you do not own")}
    ${bar(128, "Order the insert", 150, "$84", "#8a8f98", "12 days, no bench work")}
    <text x="10" y="172" font-size="11" fill="var(--muted)">Ranking is cost, then days, then whether you already have the reagents.</text>
  </svg>
  <p class="dgcap">The prices are not a quote, they are your prices: the per-base and per-reaction rates live
  in Tools and you can change them. The reason the order matters is that the honest answer is often the
  boring one &mdash; the enzymes in your own freezer usually beat the clever method.</p>`;
}

const MANUAL_SECTIONS = [
  { id:"overview", t:"How it fits together", fn: dgWorkflow,
    lede:"Five steps and one loop. Everything else in the app is a detail of one of these." },
  { id:"precheck", t:"What the pre-check does", fn: null,
    lede:"The first thing that happens to a sequence you paste in." },
  { id:"primers", t:"Anatomy of a primer", fn: dgPrimer,
    lede:"Why the Tm you want is not the Tm of the whole oligo." },
  { id:"mutate", t:"Point mutation by PCR", fn: dgMutagenesis,
    lede:"Back-to-back primers, and why only one of them carries the change." },
  { id:"routes", t:"How routes are ranked", fn: dgRanking,
    lede:"Where the numbers come from, and why your freezer moves them." }
];

function manualPrecheckBody(){
  const rows = [
    ["Restriction sites", "every site for " + Object.keys(ENZ).length + " enzymes, with the unique cutters called out"],
    ["Promoters and terminators", "T7, lac, tac, CMV, SV40 and the common bacterial ones"],
    ["Tags and markers", "FLAG, His, HA, Myc, GST, MBP, and the resistance genes"],
    ["Reporters", "GFP and its relatives, mCherry, luciferase"],
    ["Origins", "pUC, p15A, pSC101, f1, SV40"],
    ["Open reading frames", "only the ones long enough to plausibly be a gene, not every stretch without a stop"],
    ["Anything you taught it", "a sequence you have added yourself, like a polyhedrin promoter"],
    ["Your own constructs", "a region that matches something already in the workspace, so provenance is visible"]
  ];
  return `<table><thead><tr><th>What it looks for</th><th></th></tr></thead><tbody>
    ${rows.map(r => `<tr><td><b>${esc(r[0])}</b></td><td class="muted">${esc(r[1])}</td></tr>`).join("")}
  </tbody></table>
  <p class="dgcap">Nothing is applied without you ticking it. The ORF list in particular is deliberately
  conservative &mdash; on any sequence some reading frames stay open by chance, so only the ones well past
  that threshold are ticked for you, and the rest are offered unticked with the reason shown.</p>
  <p class="dgcap">If it misses something you use often, the fix is permanent: select the region on the map,
  choose <b>Teach this sequence</b>, and the pre-check will recognise it in every construct from then on.</p>`;
}

/* ---------- the guided tour ---------- */
const TOUR = [
  { view:"start", sel:".actgrid",
    t:"Start tells you what to do next",
    b:"These are not generic tips. They are computed from what is actually in your workspace - an unannotated construct, an empty shelf, something designed but never made." },
  { view:"plasmids", sel:".gallery, .panel",
    t:"Your constructs live here",
    b:"Drag the cards to reorder them, and give them colours. A construct with no physical stock is treated as designed-but-not-made everywhere else in the app.",
    before(){ state.pView = "home"; state.curPlasmid = null; } },
  { view:"plasmids", sel:"#main svg, .panel",
    t:"The map, and the pre-check",
    b:"Open a construct and it draws the circular map. Run the pre-check once and it labels the restriction sites, promoters, tags, markers and plausible ORFs - you tick what you want to keep.",
    before(){ const p = state.plasmids.find(x => x.type === "dna"); if(p){ openPlasmid(p.id); detailTab = "map"; } } },
  { view:"inventory", sel:".panel",
    t:"Tick the enzymes you actually own",
    b:"One minute of work. From then on every cloning route is ranked around your freezer, and a route needing something you do not have is marked and costed with the purchase included.",
    before(){ invTab = "enzymes"; } },
  { view:"design", sel:".panel",
    t:"Say what the construct should contain",
    b:"Pick a backbone, list the contents in order, and you get several routes side by side - restriction, Gibson, Golden Gate, synthesis - each costed against your own rates and your own shelf.",
    before(){ asm.mode = "build"; } },
  { view:"primers", sel:".panel",
    t:"Paste a primer, find out what it really does",
    b:"It splits a Gibson primer into tail and annealing region without you trimming anything, quotes the Tm of the part that binds, and lists every other place in the template that 3' end could prime from.",
    before(){ primerState.mode = "analyse"; } },
  { view:"protocols", sel:".tree, .panel",
    t:"Protocols that remember where you were",
    b:"Grouped by kind, scaled to the number of reactions you are doing, and the ticks are saved - a half-finished protocol is still half-finished tomorrow." }
];

function startTour(){
  tourState = { on:true, i:0 };
  applyTourStep();
}
function endTour(){ tourState.on = false; render(); }
function tourGo(d){
  const n = tourState.i + d;
  if(n < 0) return;
  if(n >= TOUR.length){ endTour(); toast("That is the tour. The manual has the diagrams."); return; }
  tourState.i = n;
  applyTourStep();
}
function applyTourStep(){
  const s = TOUR[tourState.i];
  if(!s) return endTour();
  if(s.before) { try { s.before(); } catch(e){} }
  if(!toolVisible(s.view)) showAllTools = true;
  state.view = s.view;
  if(s.view === "plasmids" && !s.before) state.pView = "home";
  save();
  render();
}
/* The spotlight is measured after #main has been written, which is why this is
   built as part of the overlay pass rather than from the step itself. */
function tourOverlay(){
  if(!tourState.on) return "";
  const s = TOUR[tourState.i];
  if(!s) return "";
  let r = null;
  try {
    const el = document.querySelector(s.sel.split(",").map(x => "#main " + x.trim()).join(", "));
    if(el) r = el.getBoundingClientRect();
  } catch(e){}
  const pad = 8;
  const ring = r && r.width > 20 && r.height > 20
    ? `<div class="tour-ring" style="left:${r.left - pad}px;top:${r.top - pad}px;
         width:${r.width + pad*2}px;height:${r.height + pad*2}px"></div>` : "";
  // put the card below the highlight when there is room, otherwise above it
  let top = r ? (r.bottom + 14) : 120;
  if(r && top + 190 > window.innerHeight) top = Math.max(12, r.top - 200);
  const left = r ? Math.min(Math.max(12, r.left), Math.max(12, window.innerWidth - 430)) : 120;
  // the ring's own box-shadow dims everything outside it, so a second dim layer
  // over the top would darken the thing being pointed at. Keep it transparent
  // when there is a ring, purely as a click-to-close catcher.
  return `<div class="tour-dim${ring ? " clear" : ""}" onclick="endTour()"></div>
    ${ring}
    <div class="tour-card" style="left:${left}px;top:${top}px">
      <div class="tour-step">Step ${tourState.i + 1} of ${TOUR.length}</div>
      <h3>${esc(s.t)}</h3>
      <p>${esc(s.b)}</p>
      <div class="tour-bar">
        <button class="ghost" onclick="endTour()">Close</button>
        <span>
          ${tourState.i ? `<button class="ghost" onclick="tourGo(-1)">&lsaquo; Back</button>` : ""}
          <button class="primary" onclick="tourGo(1)">${tourState.i === TOUR.length - 1 ? "Finish" : "Next &rsaquo;"}</button>
        </span>
      </div>
    </div>`;
}

/* ---------- view ---------- */
function viewManual(){
  const cur = MANUAL_SECTIONS.find(s => s.id === manualState.section) || MANUAL_SECTIONS[0];
  return `<h1 class="page">Manual</h1>
  <p class="lede">The three things people get wrong about this app are all spatial, so they are drawn
  rather than described. If you would rather be shown where to click, take the tour.</p>

  <div class="panel" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
    <div>
      <b>Guided tour</b>
      <div class="muted small">Seven steps through the real app, not screenshots. You can stop at any point.</div>
    </div>
    <button class="primary" onclick="startTour()">Start the tour</button>
  </div>

  <div class="mantabs">
    ${MANUAL_SECTIONS.map(s => `<button class="${s.id===cur.id?"primary":"ghost"}"
      onclick="manualState.section='${s.id}';render()">${esc(s.t)}</button>`).join("")}
  </div>

  <div class="panel">
    <h2 style="margin-top:0">${esc(cur.t)}</h2>
    <p class="muted" style="margin-top:-2px">${esc(cur.lede)}</p>
    ${cur.fn ? cur.fn() : manualPrecheckBody()}
  </div>

  <div class="panel">
    <h2>Two things worth knowing</h2>
    <div class="grid2">
      <div>
        <h3 style="font-size:13px;margin-bottom:4px">Everything is in this browser</h3>
        <p class="muted" style="font-size:12px;line-height:1.6">There is no account and no server. That means it
        works on a bench laptop with no network, and it also means clearing site data wipes the workspace.
        Use <b>Export</b> in the header before you rely on it.</p>
      </div>
      <div>
        <h3 style="font-size:13px;margin-bottom:4px">Nothing is hidden permanently</h3>
        <p class="muted" style="font-size:12px;line-height:1.6">The profile you picked at the start only decides
        which tools are in the way. <b>Show all tools</b> on the Start screen brings the rest back, and you can
        change what you work on at any time without losing anything.</p>
      </div>
    </div>
  </div>`;
}
