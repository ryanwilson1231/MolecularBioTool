/* ===================== VIEW: gallery ===================== */
function stockTotal(p){ return (p.stock||[]).reduce((s,t) => s + ((t.conc||0) * (t.vol||0) / 1000), 0); }
const CARD_COLORS = ["#2f6fed","#17915f","#b57d09","#d4504a","#7c5cf0","#0f8a9c","#c2456f","#5b6b7c"];
function viewGallery(){
  const cards = state.plasmids.map((p, i) => {
    const len = seqOf(p).length, unit = p.type === "protein" ? "aa" : "bp";
    const ug = stockTotal(p);
    const badge = p.type === "protein" ? `<span class="pill grey">protein</span>`
      : (p.stock.length ? `<span class="pill green">${ug.toFixed(1)} µg</span>` : `<span class="pill amber">in silico</span>`);
    return `<div class="card" draggable="true" data-idx="${i}"
        ondragstart="cardDragStart(${i},event)" ondragover="cardDragOver(${i},event)"
        ondrop="cardDrop(${i},event)" ondragend="cardDragEnd()"
        onclick="openPlasmid('${p.id}')">
      <span class="cardstripe" style="background:${p.color || "transparent"}"></span>
      <button class="carddot" title="Colour" style="background:${p.color || "transparent"};
        ${p.color ? "" : "border-color:var(--line)"}"
        onclick="event.stopPropagation();colorPickFor='${p.id}';render()"></button>
      <div><div class="nm">${esc(p.name)}</div>
      <div class="sub">${p.type === "protein" ? "Protein" : "DNA · " + p.topology}</div></div>
      <div><div class="sub">${len} ${unit} · ${(p.ann||[]).length} components</div>
      <div class="chips">${badge}${p.tags.slice(0,2).map(t => `<span class="pill grey">${esc(t)}</span>`).join("")}</div></div>
      ${p.notes ? `<span class="cardnote" title="${esc(p.notes.slice(0,140))}">note</span>` : ""}
      ${p.type === "dna" && !p.stock.length
        ? `<button class="cardmake" title="How to make this" onclick="event.stopPropagation();openMake('${p.id}')">🔨</button>` : ""}</div>`;
  }).join("");
  return `<div class="lblrow" style="align-items:flex-start">
      <div>
        <h1 class="page">Constructs</h1>
        <p class="lede" style="margin-bottom:10px">Drag to reorder; the dot sets a colour.</p>
      </div>
      <button class="ghost" onclick="sortConstructs()">Sort A→Z</button>
    </div>
    <div class="gallery">
      <div class="card new" onclick="startCreate()"><div class="plus">＋</div>New construct</div>${cards}
    </div>`;
}
/* ---- drag to reorder ---- */
let dragFrom = null;
function cardDragStart(i, e){
  dragFrom = i;
  if(e.dataTransfer){ e.dataTransfer.effectAllowed = "move"; try{ e.dataTransfer.setData("text/plain", String(i)); }catch(err){} }
  const el = e.currentTarget; if(el) el.classList.add("dragging");
}
function cardDragOver(i, e){
  if(dragFrom === null) return;
  e.preventDefault();
  if(e.dataTransfer) e.dataTransfer.dropEffect = "move";
  const el = e.currentTarget;
  document.querySelectorAll(".card.dropzone").forEach(x => x.classList.remove("dropzone"));
  if(el && i !== dragFrom) el.classList.add("dropzone");
}
function cardDrop(i, e){
  e.preventDefault(); e.stopPropagation();
  if(dragFrom === null || dragFrom === i){ cardDragEnd(); return; }
  const moved = state.plasmids.splice(dragFrom, 1)[0];
  state.plasmids.splice(i, 0, moved);
  dragFrom = null; save(); render();
}
function cardDragEnd(){
  dragFrom = null;
  document.querySelectorAll(".card.dragging,.card.dropzone").forEach(x => x.classList.remove("dragging","dropzone"));
}
function sortConstructs(){
  state.plasmids.sort((a,b) => a.name.localeCompare(b.name, undefined, { numeric:true, sensitivity:"base" }));
  save(); render(); toast("Sorted by name");
}
/* ---- colour picker ---- */
let colorPickFor = null;
function setCardColor(pid, c){
  const p = state.plasmids.find(x => x.id === pid); if(!p) return;
  p.color = c; colorPickFor = null; save(); render();
}
function colorPickerOverlay(){
  if(!colorPickFor) return "";
  const p = state.plasmids.find(x => x.id === colorPickFor);
  if(!p) return "";
  return `<div class="modalbg" onclick="if(event.target===this){colorPickFor=null;render()}">
    <div class="modal" style="max-width:340px">
      <div class="lblrow"><h2 style="margin:0">Colour for ${esc(p.name)}</h2>
        <button class="ghost" onclick="colorPickFor=null;render()">Close</button></div>
      <p class="muted small" style="margin:8px 0 12px">A colour is just for your own grouping &mdash; it does not
        change the sequence or the map.</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${CARD_COLORS.map(c => `<button class="cswatch ${p.color===c?"on":""}" style="background:${c}"
            onclick="setCardColor('${p.id}','${c}')"></button>`).join("")}
        <button class="cswatch none ${!p.color?"on":""}" onclick="setCardColor('${p.id}',null)" title="No colour">✕</button>
      </div>
    </div></div>`;
}
function openPlasmid(pid){
  state.curPlasmid = pid; state.pView = "detail"; state.view = "plasmids";
  const p = curP(); viewMode = p.type === "protein" ? "linear" : "circular";
  clearSel(); showDetails = false; detailTab = "map"; alnResult = null; aboutOpen = false;
  save(); render();
}
function goHome(){ state.pView = "home"; state.creating = false; clearSel(); save(); render(); }

/* ===================== VIEW: create ===================== */
function startCreate(){ state.creating = true; state.view = "plasmids"; createType = "dna"; createAuto = true; render(); }
function setCreateType(t){ createType = t; render(); }
function viewCreate(){
  return `<h1 class="page">New construct</h1>
  <div class="panel">
    <div class="row">
      <div><label>Name</label><input id="cr-name" placeholder="pET28a-LRRC8C"></div>
      <div><label>Tags (comma separated)</label><input id="cr-tags" placeholder="expression, mouse">
        <div class="muted small" style="margin-top:4px">Free-text labels. They filter the Inventory list, and if
          you ever turn Connect on they are part of what gets matched. Optional.</div></div>
    </div>
    <label>Sequence type</label>
    <div class="toggle">
      <button class="${createType==='dna'?'on':''}" onclick="setCreateType('dna')">DNA</button>
      <button class="${createType==='protein'?'on':''}" onclick="setCreateType('protein')">Amino acid</button>
    </div>
    ${createType==='dna' ? `<label>Topology</label><select id="cr-topo">
      <option value="circular">Circular (plasmid)</option><option value="linear">Linear fragment</option></select>` : ""}
    <label>Paste sequence</label>
    <textarea id="cr-seq" rows="6" placeholder="${createType==='dna'?'ATGC...':'MKALIVL...'}"></textarea>
    <label>…or upload a file (.txt / .fasta / .fa / .seq — FASTA headers are stripped)</label>
    <input type="file" accept=".txt,.fasta,.fa,.seq,.gb,text/plain" onchange="loadCreateFile(this)">
    <label>Notes</label>
    <textarea id="cr-notes" rows="3" style="font-family:inherit;font-size:13px"
      placeholder="Anything you will want to know later - where it came from, which clone worked, what to watch out for."></textarea>
    ${createType==='dna' ? `<label class="plain" style="margin-top:14px">
      <input type="checkbox" id="cr-auto" ${createAuto?"checked":""} style="width:auto;margin-right:7px;vertical-align:-2px">
      Run the auto-annotation pre-check after creating</label>` : ""}
    <div style="margin-top:16px">
      <button class="primary" onclick="doCreate()">Create</button>
      <button class="ghost" style="margin-left:8px" onclick="goHome()">Cancel</button>
    </div>
  </div>`;
}
function loadCreateFile(input){
  const f = input.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = () => {
    let txt = String(r.result);
    let name = f.name.replace(/\.[^.]+$/, "");
    if(/^LOCUS/m.test(txt)){                       // very light GenBank handling: take ORIGIN block
      const m = txt.split(/^ORIGIN/m)[1];
      if(m) txt = m.replace(/\/\//g, "");
      const loc = txt.match(/^LOCUS\s+(\S+)/m); if(loc) name = loc[1];
    }
    const lines = txt.split(/\r?\n/);
    if(lines[0] && lines[0].startsWith(">")){ name = lines[0].slice(1).trim().split(/\s+/)[0] || name; txt = lines.slice(1).join(""); }
    const ta = document.getElementById("cr-seq"); if(ta) ta.value = txt;
    const nm = document.getElementById("cr-name"); if(nm && !nm.value) nm.value = name;
  };
  r.readAsText(f);
}
function doCreate(){
  const name = val("cr-name").trim() || ("construct_" + (state.plasmids.length + 1));
  const seq = createType === "protein" ? cleanAA(val("cr-seq")) : cleanDNA(val("cr-seq"));
  if(!seq){ alert("No valid " + (createType === "protein" ? "amino acid" : "DNA") + " sequence found in that input."); return; }
  const topo = createType === "dna" ? (val("cr-topo") || "circular") : "linear";
  const auto = createType === "dna" && document.getElementById("cr-auto") && document.getElementById("cr-auto").checked;
  const tags = val("cr-tags").split(",").map(s => s.trim()).filter(Boolean);
  const np = { id:uid(), name, type:createType, topology:topo, uniprot:"", seq, ann:[], stock:[],
               inSilico:true, tags, notes: val("cr-notes").trim(), color:null,
               created:today(), source:"pasted / uploaded" };
  state.plasmids.push(np);
  state.curPlasmid = np.id; state.creating = false; state.pView = "detail";
  viewMode = createType === "protein" ? "linear" : "circular";
  clearSel(); showDetails = false; detailTab = "map"; save();
  if(auto) runAutoAnnotate();
  else render();
}

/* ===================== auto-annotation pre-check ===================== */
function runAutoAnnotate(){
  const p = curP(); if(!p || p.type !== "dna"){ alert("The pre-check runs on DNA sequences."); return; }
  const seq = seqOf(p);
  const feats = autoAnnotate(seq, p.topology === "circular", p.id);
  const sites = detectRestrictionSites(seq, p.topology === "circular");
  const counts = {}; sites.forEach(s => counts[s.name] = (counts[s.name]||0) + 1);
  pendingAuto = {
    feats: feats.map(f => ({ f, on: f.cat !== "orf" || !!f.likely })),
    unique: Object.keys(counts).filter(n => counts[n] === 1).sort(),
    siteCount: sites.length, enzymeCount: Object.keys(counts).length
  };
  render();
}
function autoAnnotateModal(){
  if(!pendingAuto) return "";
  const p = curP(); if(!p) return "";
  const groups = {};
  pendingAuto.feats.forEach((row, i) => { (groups[row.f.cat] = groups[row.f.cat] || []).push([row, i]); });
  const order = ["marker","reporter","promoter","element","tag","origin","enzyme","orf","workspace"];
  const titles = { marker:"Resistance markers", reporter:"Reporters", promoter:"Promoters & regulatory",
    element:"Elements", tag:"Tags & cleavage sites", origin:"Origins", enzyme:"Enzymes",
    orf:"Open reading frames", workspace:"Matches to your other constructs" };
  const body = order.filter(k => groups[k]).map(k => `
    <div style="margin-bottom:16px">
      <div class="lblrow">
        <h3 style="margin:0">${titles[k]} <span class="muted small">(${groups[k].length})</span></h3>
        <button class="ghost" onclick="autoToggleGroup('${k}')">toggle all</button>
      </div>
      ${GROUP_HELP[k] ? `<div class="muted small" style="margin:4px 0 8px;line-height:1.5;max-width:70ch">${GROUP_HELP[k]}</div>` : ""}
      ${groups[k].map(([row, i]) => `
        <label class="obrow ${row.on?"on":""}" data-row="${i}"
               onmousedown="autoRowDown(${i},event)" onmouseenter="autoRowEnter(${i})">
          <input type="checkbox" data-auto="${i}" style="width:auto;pointer-events:none" ${row.on?"checked":""}>
          <span style="flex:1">${esc(row.f.name)}</span>
          <span class="muted small">${row.f.start+1}–${row.f.end+1} · ${row.f.strand===1?"+":"−"} · ${esc(row.f.how)}</span>
        </label>`).join("")}
    </div>`).join("") || `<p class="muted">Nothing recognised. That is normal for a fragment with no standard parts.</p>`;
  const on = pendingAuto.feats.filter(r => r.on).length;
  return `<div class="modalbg" onclick="if(event.target===this){pendingAuto=null;render()}">
    <div class="modal">
      <div class="lblrow"><h2 style="margin:0">Pre-check: ${esc(p.name)}</h2>
        <button class="ghost" onclick="pendingAuto=null;render()">Close</button></div>
      <p class="muted" style="margin:8px 0 16px">
        ${seqOf(p).length} bp scanned. ${pendingAuto.siteCount} restriction sites from
        ${pendingAuto.enzymeCount} enzymes, ${pendingAuto.unique.length} of them unique cutters.
        Matches below come from your feature library, exact motifs, six-frame protein signatures, and your own
        labelled constructs —
        they are seeds, not validated full-length annotations, so check anything you will rely on.</p>
      <div class="note info" style="margin-bottom:14px"><b>Unique cutters:</b>
        ${pendingAuto.unique.length ? pendingAuto.unique.join(", ") : "none"}</div>
      ${body}
      ${featureTeachPanel()}
      <div class="muted small" style="margin:10px 0 2px">Click a row to toggle it. <b>Click and drag</b> down a list
        to change several at once, or <b>shift-click</b> to set everything between two rows.</div>
      <div style="margin-top:12px;display:flex;gap:8px;align-items:center;position:sticky;bottom:-22px;
                  background:var(--panel);padding:10px 0 2px;border-top:1px solid var(--line2)">
        <button class="primary" onclick="applyAuto()">Add <span id="autoCount">${on}</span> annotation${on===1?"":"s"}</button>
        <button class="ghost" onclick="pendingAuto.feats.forEach(r=>r.on=true);render()">Select all</button>
        <button class="ghost" onclick="pendingAuto.feats.forEach(r=>r.on=false);render()">Select none</button>
      </div>
    </div></div>`;
}
function applyAuto(){
  const p = curP(); if(!p || !pendingAuto) return;
  let n = 0;
  pendingAuto.feats.filter(r => r.on).forEach(r => {
    const f = r.f;
    if(p.ann.some(a => a.start === f.start && a.end === f.end && a.label === f.name)) return;
    p.ann.push({ id:uid(), start:f.start, end:f.end, label:f.name, color:CAT_COLOR[f.cat] || PALETTE[p.ann.length % PALETTE.length],
                 kind:f.cat, strand:f.strand, how:f.how });
    n++;
  });
  p.ann.sort((a,b) => a.start - b.start);
  pendingAuto = null; save(); render(); toast("Added " + n + " annotation" + (n===1?"":"s"));
}


/* ---- what each group of hits actually is ---- */
const GROUP_HELP = {
  orf: "An <b>open reading frame</b> is a stretch that could be translated into protein: it starts at an ATG " +
       "and runs to a stop codon. BetterBench checks all six reading frames, so a long sequence throws up several " +
       "even when only one is a real gene. Only the convincing ones are ticked for you - the rest are listed in " +
       "case they matter, but a short ORF on the reverse strand is usually just chance.",
  workspace: "Regions you have already labelled on your other constructs, found again here.",
  marker: "Antibiotic resistance genes, matched on the protein sequence rather than the DNA, so a recoded version still matches."
};

/* ---- click, drag or shift-click to select rows in the pre-check ---- */
let autoDrag = null, autoLastRow = null;
function autoRowDown(i, e){
  if(e) e.preventDefault();
  if(e && e.shiftKey && autoLastRow !== null){
    const a = Math.min(autoLastRow, i), b = Math.max(autoLastRow, i);
    const v = !pendingAuto.feats[i].on;
    for(let k = a; k <= b; k++) setAutoRow(k, v);
    autoLastRow = i;
    return;
  }
  const v = !pendingAuto.feats[i].on;
  autoDrag = { value: v };
  setAutoRow(i, v);
  autoLastRow = i;
  window.addEventListener("mouseup", autoDragEnd, { once:true });
}
function autoRowEnter(i){ if(autoDrag) setAutoRow(i, autoDrag.value); }
function autoDragEnd(){ autoDrag = null; }
function setAutoRow(i, v){
  if(!pendingAuto || !pendingAuto.feats[i]) return;
  pendingAuto.feats[i].on = v;
  const cb = document.querySelector('[data-auto="' + i + '"]');
  if(cb) cb.checked = v;
  const row = document.querySelector('[data-row="' + i + '"]');
  if(row) row.classList.toggle("on", v);
  const n = document.getElementById("autoCount");
  if(n) n.textContent = pendingAuto.feats.filter(r => r.on).length;
}
function autoToggleGroup(cat){
  const rows = pendingAuto.feats.map((r,i) => [r,i]).filter(([r]) => r.f.cat === cat);
  const allOn = rows.every(([r]) => r.on);
  rows.forEach(([,i]) => setAutoRow(i, !allOn));
}


/* ---- notes and tags, editable in place ---- */
function aboutPanel(p){
  const open = aboutOpen || !!p.notes || (p.tags && p.tags.length);
  if(!open) return `<div style="margin-bottom:14px">
    <button class="ghost" onclick="aboutOpen=true;render()">＋ Add notes or tags</button></div>`;
  return `<div class="panel tight" style="margin-bottom:14px">
    <div class="lblrow"><h2 style="margin:0;font-size:13px">Notes</h2>
      <span class="muted small">saved as you type</span></div>
    <textarea rows="3" style="font-family:inherit;font-size:13px;margin-top:6px"
      placeholder="Where it came from, which clone was verified, what to watch out for."
      oninput="setNotes(this.value)">${esc(p.notes || "")}</textarea>
    <div class="lblrow" style="margin-top:10px">
      <div style="flex:1">
        <label class="plain" style="margin:0 0 4px">Tags</label>
        <div>${(p.tags||[]).map(t => `<span class="pill grey" style="margin:0 4px 4px 0">${esc(t)}
          <span style="cursor:pointer;opacity:.6" onclick="removeTag('${esc(t)}')">✕</span></span>`).join("")
          || '<span class="muted small">none</span>'}</div>
      </div>
      <button class="ghost" onclick="addTag()">＋ Tag</button>
    </div>
  </div>`;
}
let aboutOpen = false;
function setNotes(v){ const p = curP(); if(!p) return; p.notes = v; save(); }
function addTag(){
  const p = curP(); const t = prompt("Tag"); if(!t || !t.trim()) return;
  p.tags = p.tags || []; if(!p.tags.includes(t.trim())) p.tags.push(t.trim());
  save(); render();
}
function removeTag(t){
  const p = curP(); p.tags = (p.tags||[]).filter(x => x !== t); save(); render();
}

/* ===================== VIEW: detail ===================== */
function viewDetail(){
  const p = curP(), seq = seqOf(p), unit = p.type === "protein" ? "aa" : "bp";
  const tabs = [["map","Map & sequence"],["align","Align a read"],["features","Features & digest"],["stock","Physical stock"]]
    .filter(t => p.type === "dna" || t[0] === "map")
    .map(([k,l]) => `<button class="${detailTab===k?"on":""}" onclick="detailTab='${k}';render()">${l}</button>`).join("");
  let body = "";
  if(detailTab === "map") body = detailMap(p, seq, unit);
  else if(detailTab === "align") body = detailAlign(p);
  else if(detailTab === "features") body = detailFeatures(p, seq);
  else body = detailStock(p);
  return `<div class="toolbar" style="justify-content:space-between;margin-top:0">
      <div><button class="backbtn" onclick="goHome()"><span>‹</span> All constructs</button>
        <b style="margin-left:12px;font-size:15px">${esc(p.name)}</b>
        <span class="muted"> · ${seq.length} ${unit} · ${p.type === "protein" ? "protein" : "DNA " + p.topology}</span>
        ${p.stock.length ? `<span class="pill green" style="margin-left:6px">${stockTotal(p).toFixed(1)} µg on hand</span>`
                         : `<span class="pill amber" style="margin-left:6px">in silico only</span>`}</div>
      <div>
        ${p.type === "dna" ? `<button class="${p.stock.length ? "ghost" : "primary"}" onclick="openMake('${p.id}')">
          ${p.stock.length ? "How was this made?" : "🔨 Make this"}</button>` : ""}
        <button class="ghost" onclick="renamePlasmid()">Rename</button>
        <button class="ghost" onclick="download('${esc(p.name).replace(/[^A-Za-z0-9_.-]/g,'_')}.fasta', fastaOf(curP()))">FASTA</button>
        <button class="ghost danger" onclick="deletePlasmid()">Delete</button>
      </div></div>
    ${lineageBar(p)}
    ${aboutPanel(p)}
    <div class="toggle" style="margin-bottom:14px">${tabs}</div>
    ${body}`;
}
function renamePlasmid(){
  const p = curP(); const n = prompt("Name", p.name); if(n && n.trim()){ p.name = n.trim(); save(); render(); }
}
function deletePlasmid(){
  const p = curP(); if(!confirm('Delete "' + p.name + '" and its inventory entries? This cannot be undone.')) return;
  state.plasmids = state.plasmids.filter(x => x.id !== p.id);
  state.curPlasmid = null; state.pView = "home"; save(); render();
}

function detailMap(p, seq, unit){
  const canCircle = p.type === "dna";
  const toggle = canCircle ? `<div class="toggle">
      <button class="${viewMode==='circular'?'on':''}" onclick="setView('circular')">Circular</button>
      <button class="${viewMode==='linear'?'on':''}" onclick="setView('linear')">Sequence</button></div>` : "";
  const copyWhole = p.type === "dna"
    ? `<button class="ghost" onclick="copySeq('dna',this)">Copy DNA</button>
       <button class="ghost" onclick="copySeq('prot',this)">Copy longest ORF</button>`
    : `<button class="ghost" onclick="copySeq('prot',this)">Copy sequence</button>`;
  const instr = canCircle && viewMode === "circular"
    ? "Click two points on the ring to select a region."
    : "Click a " + (p.type === "protein" ? "residue" : "base") + " to set the start, then another for the end.";
  return `<div class="panel">
    <div class="toolbar" style="justify-content:space-between">
      <span class="stat" id="sel-info">${selInfo(seq)}</span>
      <div>${copyWhole} ${toggle}
        ${p.type === "dna" ? `<button class="ghost" onclick="runAutoAnnotate()">Re-run pre-check</button>` : ""}</div>
    </div>
    <div class="detailgrid">
      <div class="col-left">${componentsPanel(p)}</div>
      <div class="col-mid">
        <label class="plain">${instr}</label>
        ${canCircle && viewMode === "circular" ? renderCircular(seq, p)
          : `<div class="seqwrap" id="seqwrap" onmouseleave="clearHover()">${renderLinear(seq, p)}</div>`}
      </div>
      <div class="col-right">${detailsPanel(p, seq)}</div>
    </div>
  </div>`;
}
function setView(v){ viewMode = v; render(); }
function selInfo(seq){
  if(sel.start === null) return '<span class="muted">Nothing selected.</span>';
  if(sel.end === null) return `Start at <b>${sel.start+1}</b> — hover to preview, click again to set the end.`;
  return `Selected <b>${sel.start+1}–${sel.end+1}</b> · ${sel.end - sel.start + 1} ${curP().type === "protein" ? "aa" : "bp"}`;
}
function componentsPanel(p){
  const items = (p.ann || []).map(a => `<div class="comp" onclick="highlightComponent('${a.id}')"
      ondblclick="event.stopPropagation();editComponent('${a.id}')" title="${esc(a.how||'manual')} — double-click to rename">
      <span class="comp-sw" style="background:${a.color}" onclick="event.stopPropagation();editComponent('${a.id}')"></span>
      <span class="comp-nm">${esc(a.label)}</span>
      <span class="comp-pos">${a.start+1}–${a.end+1}</span>
      <button class="comp-x" style="color:var(--muted)" title="Rename or recolour"
        onclick="event.stopPropagation();editComponent('${a.id}')">✎</button>
      ${!featureKnown(p, a)
        ? `<button class="comp-x" style="color:var(--accent)" title="Teach the pre-check this sequence"
             onclick="event.stopPropagation();teachFromAnnotation('${a.id}')">⊕</button>` : ""}
      <button class="comp-x" onclick="event.stopPropagation();delAnn('${a.id}')">✕</button></div>`).join("")
    || '<div class="muted small">No components yet. Select a region to label one, or run the pre-check.</div>';
  return `<div class="sidecard">
    <div class="lblrow"><h2 style="margin:0">Components</h2><span class="muted small">${(p.ann||[]).length}</span></div>
    ${p.type === "dna" ? `<button class="ghost" style="margin:8px 0;width:100%" onclick="openIdentified()">🔍 Identify features</button>` : ""}
    ${items}</div>`;
}
function highlightComponent(aid){
  const p = curP(), a = p.ann.find(x => x.id === aid); if(!a) return;
  sel = { start:a.start, end:a.end }; showMenu = false; showDetails = true; render();
}
function delAnn(aid){ const p = curP(); p.ann = p.ann.filter(a => a.id !== aid); save(); render(); }
function openIdentified(){ const p = curP(); if(p.type !== "dna"){ alert("Feature detection runs on DNA."); return; } showIdentified = true; render(); }

function identifiedModal(p){
  if(!showIdentified || !p) return "";
  const seq = seqOf(p), circ = p.topology === "circular";
  lastIdentified = [];
  const col = (title, items, note) => {
    const body = items.length ? items.map(it => {
      const idx = lastIdentified.push(it) - 1;
      const added = p.ann.some(a => a.start === it.start && a.end === it.end && a.label === it.name);
      return `<div class="comp" style="cursor:default">
        <span class="comp-nm">${esc(it.name)}</span>
        <span class="comp-pos">${it.start+1}–${it.end+1}</span>
        <button class="comp-x" style="font-size:15px;color:${added?'var(--green)':'var(--accent)'}"
          title="${added?'already added':'add to construct'}" onclick="addIdentifiedByIndex(${idx})">${added?'✓':'＋'}</button></div>`;
    }).join("") : '<div class="muted small">None found.</div>';
    return `<div style="flex:1;min-width:190px"><h3>${title} <span class="muted small">(${items.length})</span></h3>
      ${note ? `<div class="muted small" style="margin-bottom:6px">${note}</div>` : ""}${body}</div>`;
  };
  const proms = detectDNAFeatures(seq, circ, ["promoter"]);
  const els = detectDNAFeatures(seq, circ, ["element","tag","origin"]).concat(detectProteinSignatures(seq, circ));
  const res = detectRestrictionSites(seq, circ);
  const counts = {}; res.forEach(r => counts[r.name] = (counts[r.name]||0) + 1);
  const uniqueRes = res.filter(r => counts[r.name] === 1);
  const ws = detectFromWorkspace(seq, circ, p.id);
  return `<div class="modalbg" onclick="if(event.target===this){showIdentified=false;render()}">
    <div class="modal">
      <div class="lblrow"><h2 style="margin:0">Identified features</h2>
        <button class="ghost" onclick="showIdentified=false;render()">Close</button></div>
      <p class="muted" style="margin:8px 0 14px">Click ＋ to label a feature on the map.</p>
      <div style="display:flex;gap:20px;flex-wrap:wrap">
        ${col("Promoters & regulatory", proms)}
        ${col("Parts, tags & markers", els, "includes six-frame protein signature hits")}
        ${col("Unique cutters", uniqueRes, res.length + " sites total from " + Object.keys(counts).length + " enzymes")}
        ${col("From your workspace", ws, "regions you have labelled on other constructs")}
      </div>
    </div></div>`;
}
function addIdentifiedByIndex(i){
  const it = lastIdentified[i], p = curP(); if(!it || !p) return;
  if(p.ann.some(a => a.start === it.start && a.end === it.end && a.label === it.name)) return;
  p.ann.push({ id:uid(), start:it.start, end:it.end, label:it.name, kind:it.cat || "custom", strand:it.strand || 1,
               how:it.how, color: CAT_COLOR[it.cat] || PALETTE[p.ann.length % PALETTE.length] });
  p.ann.sort((a,b) => a.start - b.start); save(); render();
}

/* right-hand details */
function detailsPanel(p, seq){
  if(!showDetails || sel.start === null || sel.end === null)
    return `<div class="sidecard"><span class="muted small">Select a region and choose “Details” to see stats,
      restriction sites and extension times here.</span></div>`;
  const sub = seq.slice(sel.start, sel.end + 1), n = sub.length;
  const close = `<button class="comp-x" onclick="showDetails=false;render()">✕</button>`;
  if(p.type === "protein"){
    const e = extCoeff(sub);
    return `<div class="sidecard"><div class="lblrow"><h2 style="margin:0">Details</h2>${close}</div>
      <div style="margin-top:8px">
        <span class="stat">Length <b>${n}</b> aa</span><span class="stat">MW <b>${proteinMW(sub)}</b> kDa</span>
        <span class="stat">pI <b>${pI(sub)}</b></span><span class="stat">GRAVY <b>${gravy(sub)}</b></span></div>
      <details class="fold"><summary>A280 / quantification</summary>
        <div class="muted small" style="padding-top:6px">ε(reduced) ${e.red} M⁻¹cm⁻¹ ·
        1 mg/mL ≈ A280 ${(e.red/(proteinMW(sub)*1000)).toFixed(2)}</div></details>
      </div>`;
  }
  const gc = gcPct(sub).toFixed(1);
  const whole = digestMap(seq, p.topology === "circular");
  const inside = {};
  Object.keys(whole).forEach(nme => {
    const hits = whole[nme].filter(s => s.siteStart >= sel.start && s.siteStart <= sel.end);
    if(hits.length) inside[nme] = { hits, total: whole[nme].length };
  });
  const enzHTML = Object.keys(inside).length ? Object.keys(inside).sort().map(nme => {
    const d = inside[nme], uniq = d.total === 1;
    return `<div style="margin:3px 0"><b>${nme}</b> @ ${d.hits.map(h => h.siteStart+1).join(", ")} ·
      <span style="color:${uniq?'var(--green)':'var(--muted)'}">${uniq ? "unique" : d.total + "× in construct"}</span>
      ${ENZ[nme].dam ? `<span class="pill amber" title="Dam methylation">dam</span>` : ""}</div>`;
  }).join("") : '<span class="muted small">No sites in this region.</span>';
  const rows = Object.keys(POLYMERASES).map(k => { const e = POLYMERASES[k];
    return `<tr${k === defaultPolymerase() ? ' style="background:var(--accent-soft)"' : ""}>
      <td>${esc(e.label.split(" / ")[0])}</td>
      <td>${e.proofreading ? "high-fidelity" : "no proofreading"}</td>
      <td><b>${fmtTime(e.sPerKb*n/1000)}</b></td></tr>`; }).join("");
  const orf = longestORF(sub);
  const overl = (p.ann||[]).filter(a => a.start <= sel.end && a.end >= sel.start);
  return `<div class="sidecard"><div class="lblrow"><h2 style="margin:0">Details</h2>${close}</div>
    <div style="margin-top:8px"><span class="stat"><b>${n}</b> bp</span><span class="stat">GC <b>${gc}%</b></span>
      <span class="stat">Tm <b>${tmNN(sub.slice(0,40))}°C</b></span></div>
    ${overl.length ? `<label>Overlaps</label><div class="small">${overl.map(a =>
        `<span class="pill grey" style="margin:2px 2px 0 0">${esc(a.label)}</span>`).join("")}</div>` : ""}
    ${orf.len ? `<details class="fold"><summary>Longest ORF here</summary><div class="muted small" style="padding-top:6px">${orf.len} aa · ${proteinMW(orf.prot)} kDa
      <button class="ghost" style="margin-left:4px" onclick="copyText(longestORF(seqOf(curP()).slice(${sel.start},${sel.end+1})).prot,'Protein')">copy</button></div></details>` : ""}
    <details class="fold"><summary>Restriction sites here <span class="muted small">${Object.keys(inside).length}</span></summary>
      <div style="padding-top:6px">${enzHTML}</div></details>
    <details class="fold"><summary>PCR extension time</summary>
      <table><thead><tr><th>Pol</th><th>Type</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table></details>
    </div>`;
}

/* ---- provenance: what this construct was made from, and what came out of it ---- */
function lineageBar(p){
  const parents = (p.parents || []).filter(x => x.name);
  const children = state.plasmids.filter(c => (c.parents||[]).some(x => x.id === p.id));
  if(!parents.length && !children.length) return "";
  const node = x => x.id && state.plasmids.some(q => q.id === x.id)
    ? `<span class="node" style="cursor:pointer" onclick="openPlasmid('${x.id}')">${esc(x.name)}</span>`
    : `<span class="node muted">${esc(x.name)}</span>`;
  return `<div class="panel tight" style="margin-bottom:14px">
    <div class="lineage">
      ${parents.length ? parents.map(node).join('<span class="arrow">+</span>') + '<span class="arrow">&rarr;</span>' : ""}
      <span class="node" style="border-color:var(--accent);color:var(--accent);font-weight:650">${esc(p.name)}</span>
      ${children.length ? '<span class="arrow">&rarr;</span>' + children.map(c => node({id:c.id,name:c.name})).join('<span class="arrow">,</span>') : ""}
    </div>
  </div>`;
}
