/* ===================== 6d. PROTOCOL LIBRARY =====================
   Each protocol carries its steps and, where a bench calculation exists,
   a reaction table that scales to N reactions with overage.
*/
const PROTOCOLS = [
{ id:"digest", name:"Restriction digest", cat:"Cloning", time:"1-3 h",
  rx:{ label:"Per 50 µL preparative digest", rows:[
    {r:"DNA (0.5-1 µg)", v:"x", unit:"µL"}, {r:"10x buffer", v:5, unit:"µL"},
    {r:"Enzyme 1 (10 U/µL)", v:1, unit:"µL"}, {r:"Enzyme 2 (10 U/µL)", v:1, unit:"µL"},
    {r:"Nuclease-free water", v:"to 50", unit:"µL"} ]},
  steps:[
    {t:"Check both enzymes cut in the same buffer, and that neither is blocked by Dam/Dcm methylation in your prep."},
    {t:"Assemble the reaction on ice, adding enzyme last. Mix by flicking; spin down."},
    {t:"Incubate 1 h at 37 °C (check the datasheet - SmaI is 25 °C, ApaI 25 °C, BclI 50 °C).", meta:"Analytical digests can be 15 min with HF enzymes"},
    {t:"Heat-inactivate (usually 20 min at 65 °C) or column-clean before ligation."},
    {t:"Run 5 µL on a gel next to an uncut control to confirm the expected fragment sizes."},
    {t:"Gel-purify the vector backbone if you are cutting out a stuffer; column-purify otherwise."}]},

{ id:"cip", name:"Vector dephosphorylation (rSAP/CIP)", cat:"Cloning", time:"45 min",
  rx:{ label:"Add directly to a finished digest", rows:[
    {r:"Digested vector", v:"50", unit:"µL"}, {r:"rSAP (1 U/µL)", v:1, unit:"µL"} ]},
  steps:[
    {t:"Only dephosphorylate when both vector ends are compatible with each other (single cut, or blunt)."},
    {t:"Add rSAP directly to the digest; 30 min at 37 °C."},
    {t:"Inactivate 5 min at 65 °C. rSAP is heat-labile - CIP is not and must be removed on a column."},
    {t:"Always run a ligation-without-insert control; that is what tells you the dephosphorylation worked."}]},

{ id:"ligation", name:"Ligation (T4 DNA ligase)", cat:"Cloning", time:"20 min - overnight",
  rx:{ label:"Per 20 µL ligation", rows:[
    {r:"10x T4 ligase buffer (fresh ATP!)", v:2, unit:"µL"}, {r:"Vector (~50 ng)", v:"x", unit:"µL"},
    {r:"Insert (3:1 molar over vector)", v:"y", unit:"µL"}, {r:"T4 DNA ligase", v:1, unit:"µL"},
    {r:"Water", v:"to 20", unit:"µL"} ]},
  steps:[
    {t:"Thaw ligase buffer fully and vortex - the ATP precipitates and a tired buffer is the single most common cause of a dead ligation."},
    {t:"Sticky ends: 10-15 min at room temperature is enough. Blunt ends: 2 h at room temperature or 16 °C overnight."},
    {t:"Set up a vector-only control in parallel, every time."},
    {t:"Transform 2-5 µL directly; do not heat-inactivate before chemical transformation."}]},

{ id:"gibson", name:"Gibson / HiFi assembly", cat:"Cloning", time:"1 h",
  rx:{ label:"Per 20 µL assembly", rows:[
    {r:"2x assembly master mix", v:10, unit:"µL"}, {r:"Linearised vector (~50-100 ng)", v:"x", unit:"µL"},
    {r:"Insert(s), 2-3:1 molar over vector", v:"y", unit:"µL"}, {r:"Water", v:"to 20", unit:"µL"} ]},
  steps:[
    {t:"Overlaps of 20-25 bp with Tm ≥ 48 °C. Longer overlaps do not help; mismatched ones do hurt."},
    {t:"DpnI-treat any PCR product amplified from a plasmid template before assembly."},
    {t:"50 °C for 15 min (2 fragments) or 60 min (3+ fragments)."},
    {t:"Transform 2 µL into chemically competent cells; more DNA does not give more colonies here."},
    {t:"Screen by colony PCR across each junction, then sequence the junctions."}]},

{ id:"goldengate", name:"Golden Gate assembly", cat:"Cloning", time:"1-2 h",
  rx:{ label:"Per 20 µL reaction", rows:[
    {r:"10x T4 DNA ligase buffer", v:2, unit:"µL"}, {r:"Type IIS enzyme (BsaI-HFv2 / BsmBI)", v:1, unit:"µL"},
    {r:"T4 DNA ligase (400 U/µL)", v:1, unit:"µL"}, {r:"Each part (~75 ng)", v:"x", unit:"µL"},
    {r:"Water", v:"to 20", unit:"µL"} ]},
  steps:[
    {t:"Remove every internal site for your chosen type IIS enzyme from all parts first - domesticate by silent mutation."},
    {t:"Design 4 nt overhangs that are unique and not palindromic; avoid overhangs that differ by one base."},
    {t:"Cycle 30x (37 °C 1 min, 16 °C 1 min), then 60 °C 5 min, then 80 °C 10 min."},
    {t:"Blue/white or fluorescence dropout screening on the destination vector makes this near-trivial to score."}]},

{ id:"pcr", name:"PCR (high-fidelity)", cat:"PCR", time:"1.5-2.5 h",
  rx:{ label:"Per 50 µL reaction", rows:[
    {r:"5x HF buffer", v:10, unit:"µL"}, {r:"10 mM dNTPs", v:1, unit:"µL"},
    {r:"10 µM forward primer", v:2.5, unit:"µL"}, {r:"10 µM reverse primer", v:2.5, unit:"µL"},
    {r:"Template (< 1 ng plasmid / 50-250 ng gDNA)", v:1, unit:"µL"},
    {r:"High-fidelity polymerase", v:0.5, unit:"µL"}, {r:"Water", v:"to 50", unit:"µL"} ]},
  steps:[
    {t:"Initial denaturation 98 °C 30 s."},
    {t:"30 cycles: 98 °C 10 s / annealing 20 s / 72 °C for 30 s per kb (Q5, Phusion).", meta:"Use the Tm tool on this page to set the annealing temperature"},
    {t:"Final extension 72 °C 2 min, hold at 10 °C."},
    {t:"If the product is faint, drop the annealing temperature 3 °C before touching anything else; if there are extra bands, raise it."},
    {t:"DpnI-treat (1 µL, 37 °C, 30 min) whenever the template was a plasmid and the product is going into cloning."}]},

{ id:"colonypcr", name:"Colony PCR screen", cat:"PCR", time:"1.5 h",
  rx:{ label:"Per 10 µL screening reaction", rows:[
    {r:"2x Taq master mix", v:5, unit:"µL"}, {r:"10 µM primer mix", v:1, unit:"µL"},
    {r:"Water", v:4, unit:"µL"}, {r:"Colony", v:"touch", unit:""} ]},
  steps:[
    {t:"Number a fresh plate and patch each colony before touching it into the PCR - you will need the patch to grow the positive."},
    {t:"Use a 5 min 95 °C initial denaturation to lyse the cells."},
    {t:"Put one primer in the backbone and one in the insert; that gives orientation as well as presence."},
    {t:"A colony with no product is not evidence of anything if your positive control also failed."}]},

{ id:"sdm", name:"Site-directed mutagenesis", cat:"Cloning", time:"3-4 h",
  steps:[
    {t:"Design primers with the mismatch centred, 10-15 matching bases either side, Tm ≥ 78 °C for whole-plasmid amplification."},
    {t:"Amplify the whole plasmid with a high-fidelity polymerase, 18 cycles, extension 30 s/kb (do not over-cycle)."},
    {t:"DpnI-digest 1 h at 37 °C to destroy the methylated template."},
    {t:"Transform 5 µL. Sequence the whole ORF, not just the mutated codon."},
    {t:"For insertions/deletions, back-to-back primers with the change on one primer plus KLD treatment is more reliable."}]},

{ id:"transform", name:"Heat-shock transformation", cat:"Bacteria", time:"2 h + overnight",
  steps:[
    {t:"Thaw 50 µL chemically competent cells on ice; pre-warm plates and SOC."},
    {t:"Add 1-5 µL DNA (1-100 ng). Flick gently - do not pipette-mix competent cells."},
    {t:"Ice 30 min.", meta:"Shorter is fine for high-efficiency cells but is the first thing to lengthen if efficiency drops"},
    {t:"Heat shock exactly 45 s at 42 °C, then straight back on ice for 2 min."},
    {t:"Add 450-950 µL SOC; recover 1 h at 37 °C with shaking. Ampicillin-only plasmids can skip recovery; kanamycin and chloramphenicol cannot."},
    {t:"Plate 50-200 µL on selective plates; incubate overnight at 37 °C."}]},

{ id:"compcells", name:"Chemically competent cells (CaCl₂)", cat:"Bacteria", time:"1 day",
  steps:[
    {t:"Inoculate 100 mL LB (no antibiotic) with 1 mL of a fresh overnight; grow at 37 °C to OD600 0.35-0.4. Do not overshoot."},
    {t:"Chill on ice 20 min. Everything from here is ice-cold, including the tips."},
    {t:"Spin 4000 g, 10 min, 4 °C. Resuspend gently in 30 mL ice-cold 0.1 M CaCl₂; hold on ice 30 min."},
    {t:"Spin again; resuspend in 4 mL 0.1 M CaCl₂ + 15% glycerol."},
    {t:"Aliquot 50-100 µL, snap-freeze in liquid nitrogen, store at -80 °C."},
    {t:"Titre a fresh batch with 100 pg of a known supercoiled plasmid and record cfu/µg."}]},

{ id:"miniprep", name:"Plasmid miniprep (alkaline lysis)", cat:"DNA prep", time:"45 min",
  steps:[
    {t:"Pellet 1-5 mL of overnight culture. More culture is not better - overloading the column lowers yield and purity."},
    {t:"Resuspend completely in 250 µL P1 (RNase A). No clumps, or the lysis will be partial."},
    {t:"Add 250 µL P2, invert 4-6 times, wait no more than 5 min. Do not vortex."},
    {t:"Add 350 µL N3, invert immediately until the white precipitate is even; spin 10 min at top speed."},
    {t:"Load supernatant on the column, wash, spin the empty column dry to remove ethanol, elute in 30-50 µL warm EB."},
    {t:"Record concentration and A260/280 (~1.8) and A260/230 (~2.0) in the inventory entry."}]},

{ id:"gel", name:"Agarose gel electrophoresis", cat:"DNA prep", time:"1 h",
  steps:[
    {t:"Choose the percentage from the fragment size: 0.7% for 1-10 kb, 1% for 0.5-7 kb, 1.5% for 0.2-3 kb, 2% for 50-800 bp."},
    {t:"Melt agarose fully in 1x TAE; cool to ~55 °C before adding stain and pouring."},
    {t:"Run at 5-8 V/cm. Big fragments need low voltage and a long run; a hot gel means the voltage is too high."},
    {t:"Load a ladder in the outermost usable lane on both sides for wide gels."},
    {t:"For gel extraction, use long-wave UV or blue light and cut the smallest slice you can."}]},

{ id:"glycerol", name:"Glycerol stock", cat:"Bacteria", time:"10 min",
  steps:[
    {t:"Grow a fresh overnight from a single verified colony in selective medium."},
    {t:"Mix 500 µL culture with 500 µL 50% sterile glycerol (final 25%) in a cryovial."},
    {t:"Vortex, label with construct, strain, date and your initials, and freeze at -80 °C."},
    {t:"Add the tube to the inventory here, with its box and slot, before you walk away from the freezer."}]},

{ id:"transfect", name:"Mammalian transfection (PEI / lipid)", cat:"Cell culture", time:"30 min + 24-48 h",
  steps:[
    {t:"Seed so the monolayer is 70-80% confluent at the time of transfection."},
    {t:"Dilute DNA in serum-free medium, add PEI (3:1 w/w PEI:DNA) or lipid reagent, vortex briefly."},
    {t:"Incubate the complexes 15-20 min at room temperature, then add dropwise while swirling."},
    {t:"Change the medium after 4-6 h if the reagent is toxic to your line."},
    {t:"Assay 24-48 h later. Always transfect an empty-vector control at the same total DNA mass."}]},

{ id:"sanger", name:"Sanger sequencing submission", cat:"Verification", time:"15 min",
  steps:[
    {t:"Send 5-10 µL of plasmid at 80-100 ng/µL with 5 µL of 5 µM primer, or use the facility's standard primers."},
    {t:"Space primers ~700-800 bp apart; the first 30-50 bases of a read are unreliable, so start 60 bp before the region you care about."},
    {t:"Sequence both strands across anything you will publish."},
    {t:"Paste the returned read into the Align tab of the construct - the mismatch list tells you immediately whether the clone is right."}]}
];
function protocolById(id){ return PROTOCOLS.concat(state.customProtocols).find(p => p.id === id); }

/* ===================== 6e. CONNECT: sketches and matching =====================
   MinHash over 21-mers. A sketch is a fixed-size sample of hashed k-mers, so
   it supports similarity estimation without moving the sequence itself. It is
   a privacy *reduction*, not a privacy guarantee - see the note in the UI.
*/
function hash32(s){
  let h = 2166136261 >>> 0;
  for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function canonicalKmer(s){ const r = revComp(s); return s < r ? s : r; }
function minhash(seq, k, n){
  k = k || 21; n = n || 128;
  const heap = [];
  for(let i=0; i+k <= seq.length; i++){
    const h = hash32(canonicalKmer(seq.substr(i,k)));
    heap.push(h);
  }
  const uniq = [...new Set(heap)].sort((a,b) => a-b);
  return uniq.slice(0, n);
}
function jaccardFromSketch(a, b){
  if(!a.length || !b.length) return 0;
  const n = Math.min(a.length, b.length);
  const sa = new Set(a.slice(0,n)), sb = new Set(b.slice(0,n));
  const union = new Set([...sa, ...sb]);
  let inter = 0; sa.forEach(x => { if(sb.has(x)) inter++; });
  return inter / union.size;
}
function featureTags(p){
  const t = new Set();
  (p.ann || []).forEach(a => t.add(annLabel(a).replace(/\s*\(.*?\)\s*/g,"").trim()));
  p.tags.forEach(x => t.add(x));
  return [...t].filter(Boolean);
}
/* A small local demo registry. Nothing here is fetched; it exists so the
   matching behaviour can be judged before any server exists. */
const DEMO_REGISTRY = [
  { id:"g1", label:"Group A", field:"Ion channel structural biology", org:"university, EU",
    tags:["LRRC8A","EGFP","His-tag","pcDNA3.1","cryo-EM","HEK293F"], members:6, active:"2026-07" },
  { id:"g2", label:"Group B", field:"Mechanosensation", org:"university, US",
    tags:["PIEZO1","EGFP","P2A","lentivirus","patch clamp"], members:4, active:"2026-08" },
  { id:"g3", label:"Group C", field:"Neuronal excitability", org:"institute, US",
    tags:["Kv2.1","mCherry","AAV","U6 promoter","MEA"], members:9, active:"2026-06" },
  { id:"g4", label:"Group D", field:"Synthetic biology / biosensors", org:"university, UK",
    tags:["T7 promoter","RBS","sfGFP","Golden Gate","BsaI","E. coli"], members:5, active:"2026-08" },
  { id:"g5", label:"Group E", field:"Protein engineering", org:"company, US",
    tags:["His-tag","TEV site","SUMO","pET28a","BL21"], members:12, active:"2026-08" },
  { id:"g6", label:"Group F", field:"Genome editing methods", org:"institute, JP",
    tags:["SpCas9","U6 promoter","lentiCRISPRv2","HDR","ssODN"], members:7, active:"2026-05" },
  { id:"g7", label:"Group G", field:"Ion channel pharmacology", org:"university, US",
    tags:["LRRC8A","LRRC8C","patch clamp","HEK293","pcDNA3.1"], members:3, active:"2026-08" },
  { id:"g8", label:"Group H", field:"Organoid models", org:"hospital, EU",
    tags:["AAV","EGFP","WPRE","organoid","lentivirus"], members:8, active:"2026-04" }
];
function tagOverlap(a, b){
  const A = new Set(a.map(x => x.toLowerCase())), B = new Set(b.map(x => x.toLowerCase()));
  let inter = 0; A.forEach(x => { if(B.has(x)) inter++; });
  const shared = [...A].filter(x => B.has(x));
  return { score: inter / Math.max(1, Math.min(A.size, B.size)), inter, shared };
}

/* ===================== 7. UI SHELL ===================== */
let sel = { start:null, end:null };
let viewMode = "circular", labelColor = PALETTE[0];
let showMenu = false, menuPos = { x:0, y:0 }, copySub = false;
let showSidebar = false, sidebarRegion = null, labelDraft = "";
let hoverIdx = null, showDetails = false, showIdentified = false, lastIdentified = [];
let detailTab = "map";
let createType = "dna", createAuto = true, pendingAuto = null;
let alnResult = null, alnQuery = "";
let crisprState = { plasmidId:null, sys:"SpCas9", from:null, to:null, guides:null, selected:null, hdrEdit:"", armLen:50 };
let proteinState = { orfs:null, sel:null, foldStatus:"" };
let protoState = { open:null, n:1, filter:"", expanded:{} };
let showAllTools = false;   // session-only: reveals tools the profile hides

const NAV = [
  { id:"start",     ic:"◉", t:"Start" },
  { sec:"Design" },
  { id:"plasmids",  ic:"🧬", t:"Constructs" },
  { id:"parts",     ic:"🧩", t:"Parts" },
  { id:"design",    ic:"🏗️", t:"Design" },
  { id:"primers",   ic:"🧷", t:"Primers" },
  { id:"crispr",    ic:"✂️", t:"CRISPR" },
  { id:"protein",   ic:"🧊", t:"Protein" },
  { sec:"Bench" },
  { id:"inventory", ic:"🧪", t:"Inventory" },
  { id:"protocols", ic:"📋", t:"Protocols" },
  { id:"tools",     ic:"🧮", t:"Tools" },
  { sec:"People" },
  { id:"connect",   ic:"🔗", t:"Connect" }
];
function go(v){ state.view = v; if(v !== "plasmids") { showMenu = false; } save(); render(); window.scrollTo(0,0); }
function curP(){ return state.plasmids.find(p => p.id === state.curPlasmid) || null; }

function renderNav(){
  const rail = document.getElementById("rail");
  if(!state.profile || !state.profile.onboarded){ rail.innerHTML = ""; rail.style.display = "none"; return; }
  rail.style.display = "";
  const vis = visibleTools();
  // a section header only earns its place if something under it survived the filter
  const rows = [];
  NAV.forEach((n, i) => {
    if(n.sec){
      const rest = NAV.slice(i + 1);
      const until = rest.findIndex(x => x.sec);
      const group = (until === -1 ? rest : rest.slice(0, until)).filter(x => vis.includes(x.id));
      if(group.length) rows.push(`<div class="navsec">${n.sec}</div>`);
      return;
    }
    if(!vis.includes(n.id)) return;
    rows.push(`<div class="navitem ${state.view===n.id?"on":""}" onclick="go('${n.id}')"><span class="ic">${n.ic}</span>${n.t}</div>`);
  });
  const hidden = ALL_TOOLS.length - vis.length;
  rows.push(`<div class="railfoot">
    <div class="depthrow">
      <span class="depthlbl">Detail</span>
      <div class="toggle mini">
        <button class="${isSimple()?"on":""}" onclick="setDepth('simple')">Simple</button>
        <button class="${isSimple()?"":"on"}" onclick="setDepth('full')">Full</button>
      </div>
    </div>
    ${hidden > 0 || showAllTools
      ? `<div class="navitem tiny" onclick="showAllTools=!showAllTools;render()">
           ${showAllTools ? "Hide " + (ALL_TOOLS.length - (currentProfile() && currentProfile().tools ? currentProfile().tools.length : ALL_TOOLS.length)) + " extra" : "Show all tools (+" + hidden + ")"}</div>`
      : ""}
    <div class="navitem tiny" onclick="reopenOnboarding()">${esc((currentProfile()||{}).title || "Choose a focus")}</div>
  </div>`);
  rail.innerHTML = rows.join("");
}
function render(){
  renderNav();
  const m = document.getElementById("main");
  let html = "";
  if(!state.profile || !state.profile.onboarded){
    m.innerHTML = viewOnboarding();
    document.getElementById("overlays").innerHTML = "";
    return;
  }
  if(!toolVisible(state.view) && state.view !== "plasmids") state.view = "start";
  switch(state.view){
    case "plasmids":  html = state.creating ? viewCreate() : (state.pView === "detail" && curP() ? viewDetail() : viewGallery()); break;
    case "inventory": html = viewInventory(); break;
    case "parts":     html = viewParts(); break;
    case "design":    html = viewDesign(); break;
    case "primers":   html = viewPrimers(); break;
    case "start":     html = viewStart(); break;
    case "crispr":    html = viewCrispr(); break;
    case "protein":   html = viewProtein(); break;
    case "protocols": html = viewProtocols(); break;
    case "tools":     html = viewTools(); break;
    case "connect":   html = viewConnect(); break;
    default:          html = viewGallery();
  }
  m.innerHTML = html;
  document.getElementById("overlays").innerHTML =
    menuHTML() + sidebarHTML() + identifiedModal(curP()) + autoAnnotateModal()
    + colorPickerOverlay() + stockFormOverlay() + shelfMergeOverlay() + makeOverlay();
}
/* keep the caret in a filter box that re-renders on every keystroke */
function refocus(id){
  const e = document.getElementById(id);
  if(e){ e.focus(); try{ e.setSelectionRange(e.value.length, e.value.length); }catch(err){} }
}

/* ===================== helpers ===================== */
function esc(s){ return (s == null ? "" : String(s)).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
/* a JS string literal safe to drop inside a double-quoted HTML attribute */
function jsq(s){ return JSON.stringify(String(s == null ? "" : s)).replace(/"/g, "&quot;"); }
function val(id){ const el = document.getElementById(id); return el ? el.value : ""; }
function num(id){ const v = parseFloat(val(id)); return isNaN(v) ? null : v; }
function toast(msg){
  const d = document.createElement("div"); d.className = "toast"; d.textContent = msg;
  document.body.appendChild(d); setTimeout(() => d.remove(), 2200);
}
function copyText(t, label){
  navigator.clipboard.writeText(t).then(() => toast((label || "Copied") + " (" + t.length + " chars)"))
    .catch(() => { window.prompt("Copy with Ctrl+C:", t); });
}
function download(name, text, mime){
  const b = new Blob([text], { type: mime || "text/plain" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
/* Bench convention: "45 s", "1 min 30 s", "2 min" - the same spacing every
   other line of a protocol uses, so a cycling step reads consistently. */
function fmtTime(sec){
  sec = Math.round(sec);
  const m = Math.floor(sec/60), s = sec%60;
  if(!m) return s + " s";
  return s ? m + " min " + s + " s" : m + " min";
}
function bp(n){ return n >= 1000 ? (n/1000).toFixed(n >= 10000 ? 1 : 2) + " kb" : n + " bp"; }
/* "1 construct", "2 constructs" - a count of one on the Start screen is the
   first thing a new user sees, so it should not read "1 constructs". */
function plural(n, word, pluralForm){ return n === 1 ? word : (pluralForm || word + "s"); }

function exportWorkspace(){
  download("betterbench-" + today() + ".json", JSON.stringify(state, null, 2), "application/json");
  toast("Workspace exported");
}
function importWorkspace(input){
  const f = input.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = () => {
    try{
      const s = JSON.parse(r.result);
      if(!s.plasmids) throw new Error("not a BetterBench workspace");
      if(!confirm("Replace the current workspace with " + s.plasmids.length + " sequences from this file?")) return;
      state = normalize(s); save(); render(); toast("Workspace imported");
    }catch(e){ alert("Could not read that file: " + e.message); }
  };
  r.readAsText(f); input.value = "";
}
function fastaOf(p){ return ">" + p.name.replace(/\s+/g,"_") + " " + seqOf(p).length + (p.type==="protein"?"aa":"bp") + "\n"
  + (seqOf(p).match(/.{1,70}/g) || []).join("\n") + "\n"; }
