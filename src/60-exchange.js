/* =========================================================================
   PROTOCOL EXCHANGE
   A protocol is the one thing in a lab that is genuinely worth sharing and
   almost never is: it lives in a drawer, a Word file, or somebody's head, and
   the version that actually works is the one with the pencil annotations.

   This is the exchange half of the Protocols tool. Three jobs:

     browse  - a bundled starter catalogue you can add to your own list
     share   - turn one of your protocols into something you can send
     import  - take what somebody sent you and put it in your list

   It is deliberately file-based rather than server-based. Offline is the whole
   point of the tool, and a protocol you can paste into Slack or attach to an
   email travels further than one behind a login. A hosted index is a strict
   addition later: the same record shape, fetched instead of pasted.
   ========================================================================= */

const EXCHANGE_FORMAT = "betterbench.protocol/1";

/* ---- the bundled starter catalogue ----
   These ship with the app. They are written out in full rather than linked,
   because a protocol you cannot read offline at the bench is not a protocol.
   A real index would carry the contributing lab on each row; these are all
   marked as the starter set rather than attributed to anyone.              */
const EXCHANGE_CATALOGUE = [
{ id:"x-iso", name:"Homemade Gibson (ISO) master mix", cat:"Cloning", time:"2 h to make, keeps 1 year",
  from:"BetterBench starter set", tags:["gibson","assembly","cheap"],
  blurb:"The same chemistry as the commercial kit at roughly a fiftieth of the cost. Worth it once you are doing more than a couple of assemblies a month.",
  rx:{ label:"5x ISO buffer, 6 mL", rows:[
    {r:"1 M Tris-HCl pH 7.5", v:3, unit:"mL"}, {r:"2 M MgCl₂", v:150, unit:"µL"},
    {r:"100 mM each dNTP", v:600, unit:"µL"}, {r:"1 M DTT", v:300, unit:"µL"},
    {r:"PEG-8000", v:1.5, unit:"g"}, {r:"100 mM NAD⁺", v:300, unit:"µL"},
    {r:"Water", v:"to 6", unit:"mL"} ]},
  steps:[
    {t:"Make the 5x ISO buffer first. PEG-8000 dissolves slowly - warm to 50 °C and vortex, and do not give up early."},
    {t:"Aliquot the 5x buffer at 320 µL and freeze at -20 °C. It is stable for a year and you only thaw what you need."},
    {t:"For 1.2 mL of 2x assembly mix: 320 µL 5x ISO buffer, 0.64 µL T5 exonuclease (10 U/µL), 20 µL Phusion (2 U/µL), 160 µL Taq ligase (40 U/µL), water to 1.2 mL.", meta:"T5 is the one to get right - too much and it chews past the overlap"},
    {t:"Aliquot 15 µL and freeze at -20 °C. Thaw once; refreezing costs you efficiency."},
    {t:"Use 15 µL of 2x mix with 5 µL of DNA, 50 °C for 15 min (2 fragments) or 60 min (3 or more)."},
    {t:"Run a vector-only control the first time you make a batch, so you know the background before you trust it."}]},

{ id:"x-electro", name:"Electroporation of E. coli", cat:"Bacteria", time:"30 min + overnight",
  from:"BetterBench starter set", tags:["transformation","efficiency"],
  blurb:"Ten to a hundred times the efficiency of heat shock. Worth the extra handling whenever the ligation is marginal or the library has to be large.",
  steps:[
    {t:"Everything is ice-cold and salt-free. Salt in the DNA is what causes arcing, so column-purify or drop-dialyse the ligation first."},
    {t:"Thaw 50 µL of electrocompetent cells on ice; chill the cuvette (1 mm gap) on ice too."},
    {t:"Add 1-2 µL of DNA (under 10 ng, and under 1 µL of ligation). Mix by flicking, not pipetting."},
    {t:"Transfer to the cuvette without bubbles - tap it down on the bench. Wipe the outside dry."},
    {t:"Pulse at 1.8 kV (1 mm) or 2.5 kV (2 mm). A good pulse gives a time constant of 4.5-5.5 ms; under 4 ms means salt."},
    {t:"Add 950 µL room-temperature SOC immediately. Seconds matter here - the cells are leaky and recovering fast."},
    {t:"Recover 1 h at 37 °C shaking, then plate. Keep 100 µL of a dilution series if you need the efficiency number."}]},

{ id:"x-spri", name:"SPRI bead cleanup and size selection", cat:"DNA prep", time:"20 min",
  from:"BetterBench starter set", tags:["cleanup","beads","size selection"],
  blurb:"Replaces a column for PCR cleanup, costs pennies a reaction once you buy the beads in bulk, and gives you size selection for free.",
  rx:{ label:"Ratios that matter", rows:[
    {r:"PCR cleanup, keep > 150 bp", v:"1.8", unit:"x"},
    {r:"Keep > 300 bp (drop primers/dimer)", v:"1.0", unit:"x"},
    {r:"Keep > 500 bp", v:"0.8", unit:"x"},
    {r:"Keep > 1 kb", v:"0.6", unit:"x"} ]},
  steps:[
    {t:"Bring the beads fully to room temperature and vortex until the suspension is even. Cold beads bind badly."},
    {t:"Add the bead volume for the cut-off you want (ratio × sample volume). Mix by pipetting 10 times, not vortexing."},
    {t:"Stand 5 min at room temperature, then on the magnet until the supernatant is clear (2-5 min)."},
    {t:"With the tube still on the magnet, remove and discard the supernatant without touching the pellet."},
    {t:"Wash twice with 200 µL fresh 80% ethanol, 30 s each, on the magnet. Make the ethanol the same day."},
    {t:"Air-dry 2-3 min. Stop the moment the pellet loses its shine - an over-dried pellet cracks and will not elute."},
    {t:"Elute off the magnet in 20-30 µL EB or water, stand 2 min, then put back on the magnet and take the eluate."}]},

{ id:"x-gelex", name:"Gel extraction that actually recovers", cat:"DNA prep", time:"45 min",
  from:"BetterBench starter set", tags:["gel","purification"],
  blurb:"Gel extraction is where most cloning projects quietly lose their insert. The fixes are all about heat and UV.",
  steps:[
    {t:"Use blue light or long-wave UV, not a 254 nm transilluminator. Thirty seconds of short-wave UV is enough to nick everything you cut out."},
    {t:"Cut the smallest slice you can and trim the agarose off the edges. Gel mass is the main thing limiting your yield."},
    {t:"Dissolve at 50 °C, not 60 °C, and stop as soon as the slice has gone. Over-heating in chaotropic buffer damages the DNA."},
    {t:"Add 1 gel volume of isopropanol for fragments under 500 bp or over 4 kb; it improves binding at both extremes."},
    {t:"Spin the empty column dry before eluting. Residual ethanol carried into the eluate will inhibit the next enzyme."},
    {t:"Elute in 30 µL of EB warmed to 50 °C, stand on the column 2 min, and spin. Expect 40-60% recovery and plan the amount you load around that."}]},

{ id:"x-domest", name:"Domesticating a part for Golden Gate", cat:"Cloning", time:"half a day of design",
  from:"BetterBench starter set", tags:["golden gate","type IIS","silent mutation"],
  blurb:"Removing internal type IIS sites without changing the protein. The step everyone skips once and only once.",
  steps:[
    {t:"Scan the part for every site of the enzyme you plan to use, on both strands. BsaI and BsmBI are not palindromic, so the reverse-strand sites are easy to miss."},
    {t:"For a site inside a coding sequence, change the third base of a codon so the amino acid is unchanged. Pick the alternative codon the host actually uses."},
    {t:"For a site outside coding sequence, change any base that is not in a promoter, RBS or terminator you care about."},
    {t:"Check the new sequence again, for the same enzyme and for whichever one you might switch to later."},
    {t:"Introduce the change with whichever route is cheaper: the mutagenesis tool if the part already exists, or just order the corrected fragment if you are ordering anyway."},
    {t:"Record the domestication in the construct's notes. Six months on, an unexplained silent change looks like a sequencing error."}]},

{ id:"x-induct", name:"Small-scale expression test (IPTG)", cat:"Protein", time:"1 day",
  from:"BetterBench starter set", tags:["expression","IPTG","solubility"],
  blurb:"Before scaling to a litre, find out in 5 mL whether the protein expresses at all and whether any of it is soluble.",
  rx:{ label:"Conditions worth testing in parallel", rows:[
    {r:"37 °C, 1 mM IPTG", v:"3", unit:"h"},
    {r:"30 °C, 0.5 mM IPTG", v:"4", unit:"h"},
    {r:"18 °C, 0.1 mM IPTG", v:"16", unit:"h"},
    {r:"Uninduced control", v:"-", unit:""} ]},
  steps:[
    {t:"Inoculate 5 mL of selective LB from a fresh colony and grow at 37 °C to OD600 0.5-0.6."},
    {t:"Take a 500 µL uninduced sample now. Without it you cannot tell expression from a background band."},
    {t:"Split the culture across the conditions above and induce."},
    {t:"Harvest 500 µL per condition, normalise by OD, and pellet."},
    {t:"Lyse in BugBuster or by sonication in 100 µL, then spin 15 min at top speed and keep the pellet and supernatant separately."},
    {t:"Run both fractions on a gel. Expression in the pellet only means inclusion bodies - drop the temperature before changing anything else."},
    {t:"Low temperature and low IPTG almost always wins for solubility. Start there next time."}]},

{ id:"x-plates", name:"Pouring plates that do not kill your antibiotic", cat:"Bacteria", time:"1 h",
  from:"BetterBench starter set", tags:["plates","antibiotic","media"],
  blurb:"Ampicillin plates that stop working after two weeks, and the two mistakes that cause it.",
  steps:[
    {t:"Autoclave LB agar, then cool to 50-55 °C before adding antibiotic. You should be able to hold the bottle against your wrist."},
    {t:"Adding antibiotic to agar above 60 °C destroys a large part of it, especially ampicillin. This is the usual cause of satellite colonies."},
    {t:"Add antibiotic to the final working concentration, swirl without making bubbles, and pour 20-25 mL per 90 mm plate."},
    {t:"Leave to set with the lids ajar for 20 min, or flame the surface briefly, to stop condensation dripping onto the agar."},
    {t:"Dry the plates upside down at 37 °C for 30 min before use. A wet plate gives you a lawn, not colonies."},
    {t:"Store inverted, in a bag, at 4 °C. Ampicillin plates are good for 4 weeks; kanamycin and chloramphenicol keep for months."}]},

{ id:"x-walk", name:"Planning a sequencing walk", cat:"Verification", time:"20 min",
  from:"BetterBench starter set", tags:["sanger","primer walking","verification"],
  blurb:"Covering a long construct in reads without paying for twice as many as you need.",
  steps:[
    {t:"A good Sanger read is ~800 bases, and the first 30-50 are unreliable. Treat each read as 750 usable bases starting 50 bases after the primer."},
    {t:"Space primers 600-700 bp apart so consecutive reads overlap by 100 bp or more. Overlaps are what let you call the junctions with confidence."},
    {t:"Start the first primer 60 bp before the first region you care about, not at the feature itself."},
    {t:"Put a primer either side of every junction you created, pointing outwards. A junction read from one side only is not verified."},
    {t:"Reuse primers you already own before designing new ones - check the oligo shelf first."},
    {t:"Sequence both strands for anything going into a paper or a repository. One strand is enough for routine screening."}]}
];

/* ---------- state ---------- */
let xState = { tab:"browse", filter:"", open:null, paste:"", shareId:null, shareAs:"json", error:null };

/* a stable fingerprint, so the same protocol imported twice is recognised */
function protocolKey(p){
  return (p.name || "").trim().toLowerCase() + "|" + (p.steps || []).length;
}
function alreadyHave(p){
  const k = protocolKey(p);
  return PROTOCOLS.concat(state.customProtocols).some(x => protocolKey(x) === k);
}

/* ---------- the record that travels ---------- */
function protocolToRecord(p){
  return {
    format: EXCHANGE_FORMAT,
    name: p.name, cat: p.cat, time: p.time || "",
    blurb: p.blurb || "",
    from: (state.lab && (state.lab.me || state.lab.labName)) || "",
    tags: p.tags || [],
    rx: p.rx || null,
    steps: (p.steps || []).map(s => ({ t: s.t, meta: s.meta || "" })),
    shared: today()
  };
}
/* Validate rather than trust. A pasted blob is the one place a bad record can
   get into the workspace, so everything is checked and nothing else is kept. */
function recordToProtocol(rec){
  if(!rec || typeof rec !== "object") return { error:"That is not a protocol record." };
  if(rec.format && String(rec.format).indexOf("betterbench.protocol") !== 0)
    return { error:"Unrecognised format: " + String(rec.format).slice(0, 40) };
  const name = String(rec.name || "").trim();
  if(!name) return { error:"The record has no name." };
  const steps = Array.isArray(rec.steps) ? rec.steps
      .map(s => ({ t: String((s && s.t) || s || "").trim(), meta: String((s && s.meta) || "").trim() }))
      .filter(s => s.t) : [];
  if(!steps.length) return { error:"The record has no steps." };
  const cat = String(rec.cat || "Imported").trim() || "Imported";
  const rx = rec.rx && Array.isArray(rec.rx.rows) ? {
    label: String(rec.rx.label || "Reaction"),
    rows: rec.rx.rows.filter(r => r && r.r).map(r => ({ r:String(r.r), v:r.v, unit:String(r.unit || "") }))
  } : null;
  return { ok:{ id:"c" + uid(), name, cat, time:String(rec.time || ""), blurb:String(rec.blurb || ""),
                tags: Array.isArray(rec.tags) ? rec.tags.map(String).slice(0, 8) : [],
                from: String(rec.from || "").slice(0, 80), rx, steps } };
}

/* ---------- actions ---------- */
function xAdd(id){
  const p = EXCHANGE_CATALOGUE.find(x => x.id === id);
  if(!p) return;
  if(alreadyHave(p)){ toast("Already in your protocols"); return; }
  const copy = recordToProtocol(protocolToRecord(p));
  if(copy.error){ toast(copy.error); return; }
  copy.ok.from = p.from;
  state.customProtocols.push(copy.ok);
  save(); render();
  toast("Added “" + p.name + "” to your protocols");
}
function xImport(){
  xState.error = null;
  const txt = (xState.paste || "").trim();
  if(!txt){ xState.error = "Paste a shared protocol first."; render(); return; }
  let rec = null;
  try { rec = JSON.parse(txt); }
  catch(e){
    // tolerate a pasted block with surrounding chatter: find the outermost {...}
    const a = txt.indexOf("{"), b = txt.lastIndexOf("}");
    if(a !== -1 && b > a){ try { rec = JSON.parse(txt.slice(a, b + 1)); } catch(e2){} }
  }
  if(!rec){ xState.error = "That is not valid JSON. Paste the whole block, braces included."; render(); return; }
  const list = Array.isArray(rec) ? rec : [rec];
  if(!list.length){ xState.error = "That record is empty - there is nothing to import."; render(); return; }
  let added = 0, skipped = 0, failed = null;
  list.forEach(r => {
    const out = recordToProtocol(r);
    if(out.error){ failed = failed || out.error; return; }
    if(alreadyHave(out.ok)){ skipped++; return; }
    state.customProtocols.push(out.ok); added++;
  });
  if(!added && failed){ xState.error = failed; render(); return; }
  xState.paste = "";
  save(); render();
  toast(added + " added" + (skipped ? ", " + skipped + " already had" : ""));
}
function xImportFile(input){
  const f = input.files && input.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = () => { xState.paste = String(r.result || ""); xImport(); };
  r.readAsText(f);
}
function xShareText(p, as){
  const rec = protocolToRecord(p);
  if(as === "md"){
    const lines = ["# " + p.name, ""];
    if(p.blurb) lines.push("> " + p.blurb, "");
    lines.push("**Category:** " + p.cat + (p.time ? "  ·  **Time:** " + p.time : ""), "");
    if(p.rx){
      lines.push("**" + p.rx.label + "**", "");
      lines.push("| component | amount |", "| --- | --- |");
      p.rx.rows.forEach(r => lines.push("| " + r.r + " | " + r.v + " " + (r.unit || "") + " |"));
      lines.push("");
    }
    (p.steps || []).forEach((s, i) => {
      lines.push((i + 1) + ". " + s.t);
      if(s.meta) lines.push("   - _" + s.meta + "_");
    });
    lines.push("", "_Shared from BetterBench" + (rec.from ? " by " + rec.from : "") + "._");
    return lines.join("\n");
  }
  return JSON.stringify(rec, null, 2);
}
function xCopyShare(){
  const p = protocolById(xState.shareId); if(!p) return;
  copyText(xShareText(p, xState.shareAs));
}
function xDownloadShare(){
  const p = protocolById(xState.shareId); if(!p) return;
  const ext = xState.shareAs === "md" ? ".md" : ".json";
  download(p.name.replace(/[^\w.-]+/g, "-").toLowerCase() + ext,
           xShareText(p, xState.shareAs),
           xState.shareAs === "md" ? "text/markdown" : "application/json");
}

/* ---------- view ---------- */
function viewExchange(){
  const tab = xState.tab;
  const tabBtn = (id, label) =>
    `<button class="${tab===id?"primary":"ghost"}" onclick="xState.tab='${id}';xState.error=null;render()">${label}</button>`;

  return `<h1 class="page">Protocol exchange</h1>
  <p class="lede">The version of a protocol that actually works is the one with the pencil annotations on it.
  This is for getting that version out of one drawer and into another.</p>

  <div class="panel">
    <div class="lblrow" style="margin-bottom:10px">
      <div>${tabBtn("browse","Browse")} ${tabBtn("import","Import")} ${tabBtn("share","Share yours")}</div>
      <span class="muted small">${EXCHANGE_CATALOGUE.length} in the starter catalogue ·
        ${state.customProtocols.length} of your own</span>
    </div>
    ${tab === "browse" ? xBrowse() : tab === "import" ? xImportPanel() : xSharePanel()}
  </div>

  <div class="note info">Everything here is a file, not an account. A protocol you can paste into a message
  travels further than one behind a login, and it still works on a bench laptop with no network.
  A hosted index would use this same record shape &mdash; fetched instead of pasted.</div>`;
}

function xBrowse(){
  const q = xState.filter.trim().toLowerCase();
  const shown = EXCHANGE_CATALOGUE.filter(p => !q
    || p.name.toLowerCase().includes(q) || p.cat.toLowerCase().includes(q)
    || (p.blurb || "").toLowerCase().includes(q)
    || (p.tags || []).some(t => t.toLowerCase().includes(q))
    || p.steps.some(s => s.t.toLowerCase().includes(q)));

  if(xState.open){
    const p = EXCHANGE_CATALOGUE.find(x => x.id === xState.open);
    if(p) return xPreview(p);
  }
  return `<input id="xq" placeholder="search the catalogue…" value="${esc(xState.filter)}"
      oninput="xState.filter=this.value;render();refocus('xq')" style="max-width:320px;margin-bottom:10px">
    ${shown.length ? `<div class="xgrid">${shown.map(p => {
      const have = alreadyHave(p);
      return `<div class="xcard">
        <div class="xhead">
          <h3>${esc(p.name)}</h3>
          <span class="pill grey">${esc(p.cat)}</span>
        </div>
        <p class="muted">${esc(p.blurb || "")}</p>
        <div class="xtags">${(p.tags || []).map(t => `<span class="pill grey">${esc(t)}</span>`).join("")}</div>
        <div class="xfoot">
          <span class="muted small">${p.steps.length} steps${p.time ? " · " + esc(p.time) : ""}</span>
          <span>
            <button class="ghost" onclick="xState.open='${p.id}';render()">Preview</button>
            ${have ? `<span class="pill green">in your list</span>`
                   : `<button class="primary" onclick="xAdd('${p.id}')">Add</button>`}
          </span>
        </div>
      </div>`; }).join("")}</div>`
    : `<div class="empty"><div class="big">📋</div>Nothing matches &ldquo;${esc(xState.filter)}&rdquo;.</div>`}`;
}

function xPreview(p){
  const have = alreadyHave(p);
  return `<div class="lblrow">
      <button class="ghost" onclick="xState.open=null;render()">&lsaquo; Back to the catalogue</button>
      ${have ? `<span class="pill green">already in your protocols</span>`
             : `<button class="primary" onclick="xAdd('${p.id}')">Add to my protocols</button>`}
    </div>
    <h2 style="margin-top:12px">${esc(p.name)}</h2>
    <p class="muted">${esc(p.blurb || "")}</p>
    <div class="xtags" style="margin-bottom:10px">
      <span class="pill grey">${esc(p.cat)}</span>
      ${p.time ? `<span class="pill grey">${esc(p.time)}</span>` : ""}
      <span class="pill grey">${esc(p.from)}</span>
    </div>
    ${p.rx ? `<div class="panel" style="padding:10px"><b>${esc(p.rx.label)}</b>
      <table style="margin-top:6px"><tbody>${p.rx.rows.map(r =>
        `<tr><td>${esc(r.r)}</td><td style="text-align:right"><b>${esc(String(r.v))}</b> ${esc(r.unit || "")}</td></tr>`
      ).join("")}</tbody></table></div>` : ""}
    <ol style="padding-left:20px;line-height:1.7;font-size:12.5px">
      ${p.steps.map(s => `<li style="margin-bottom:6px">${esc(s.t)}
        ${s.meta ? `<div class="muted small">${esc(s.meta)}</div>` : ""}</li>`).join("")}
    </ol>`;
}

function xImportPanel(){
  return `<p class="muted">Paste what somebody sent you, or open the file. Both the JSON block and a
  whole file containing one are fine &mdash; surrounding text is ignored.</p>
  ${xState.error ? `<div class="note warn">${esc(xState.error)}</div>` : ""}
  <textarea id="xpaste" rows="9" placeholder='{ "format": "betterbench.protocol/1", "name": "...", "steps": [ ... ] }'
    oninput="xState.paste=this.value" style="width:100%;font-family:var(--mono);font-size:11.5px">${esc(xState.paste)}</textarea>
  <div class="lblrow" style="margin-top:8px">
    <span>
      <button class="primary" onclick="xImport()">Import</button>
      <label class="ghost" style="margin-left:6px;cursor:pointer">Open a file…
        <input type="file" accept=".json,.md,.txt" style="display:none" onchange="xImportFile(this)"></label>
    </span>
    <span class="muted small">Imported protocols land in your own list and are included in the workspace export.</span>
  </div>`;
}

function xSharePanel(){
  const mine = state.customProtocols;
  const all = PROTOCOLS.concat(mine);
  const p = xState.shareId ? protocolById(xState.shareId) : null;
  return `<p class="muted">Pick a protocol and get something you can send. JSON imports back into
  BetterBench with one paste; Markdown is for people who do not use it.</p>
  <select onchange="xState.shareId=this.value||null;render()" style="max-width:420px">
    <option value="">— choose a protocol —</option>
    ${all.map(x => `<option value="${x.id}" ${xState.shareId===x.id?"selected":""}>${esc(x.name)}${mine.includes(x)?" (yours)":""}</option>`).join("")}
  </select>
  ${p ? `<div style="margin-top:10px">
    <div class="lblrow">
      <span>
        <button class="${xState.shareAs==="json"?"primary":"ghost"}" onclick="xState.shareAs='json';render()">JSON</button>
        <button class="${xState.shareAs==="md"?"primary":"ghost"}" onclick="xState.shareAs='md';render()">Markdown</button>
      </span>
      <span>
        <button class="ghost" onclick="xCopyShare()">Copy</button>
        <button class="ghost" onclick="xDownloadShare()">Download</button>
      </span>
    </div>
    <pre class="seqbox" style="max-height:340px;overflow:auto;white-space:pre-wrap">${esc(xShareText(p, xState.shareAs))}</pre>
    ${(state.lab && (state.lab.me || state.lab.labName)) ? "" :
      `<div class="note">Set your name in Connect and it will be stamped on anything you share.</div>`}
  </div>` : ""}`;
}
