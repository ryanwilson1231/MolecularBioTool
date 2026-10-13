/* ===================== VIEW: CRISPR ===================== */
function viewCrispr(){
  const dna = state.plasmids.filter(p => p.type === "dna");
  const p = state.plasmids.find(x => x.id === crisprState.plasmidId);
  const L = p ? seqOf(p).length : 0;
  return `<h1 class="page">CRISPR design</h1>
  <p class="lede">Scoring is a sequence heuristic, and off-target checking covers
  <b>this workspace only</b> — run the spacer through CRISPOR or CHOPCHOP before ordering.</p>
  <div class="panel">
    <div class="grid3">
      <div><label>Target construct</label>
        <select onchange="crisprState.plasmidId=this.value;crisprState.guides=null;crisprState.from=null;crisprState.to=null;render()">
          <option value="">— choose —</option>
          ${dna.map(x => `<option value="${x.id}" ${crisprState.plasmidId===x.id?"selected":""}>${esc(x.name)}</option>`).join("")}
        </select></div>
      <div><label>Nuclease</label>
        <select onchange="crisprState.sys=this.value;crisprState.guides=null;render()">
          ${Object.keys(CAS_SYSTEMS).map(k => `<option value="${k}" ${crisprState.sys===k?"selected":""}>${CAS_SYSTEMS[k].label}</option>`).join("")}
        </select></div>
      <div><label>Target window (optional)</label>
        <div class="row">
          <input type="number" id="cr-from" placeholder="from" value="${crisprState.from!==null?crisprState.from+1:""}">
          <input type="number" id="cr-to" placeholder="to" value="${crisprState.to!==null?crisprState.to+1:""}">
        </div>
        ${p ? `<div class="muted small" style="margin-top:4px">1–${L}; leave blank for the whole sequence</div>` : ""}
      </div>
    </div>
    ${p ? `<div style="margin-top:14px"><button class="primary" onclick="runGuides()">Find guides</button>
      <button class="ghost" style="margin-left:8px" onclick="crisprState.from=null;crisprState.to=null;crisprState.guides=null;render()">Whole sequence</button></div>` : ""}
  </div>
  ${crisprState.guides ? crisprResults(p) : ""}`;
}
function runGuides(){
  const p = state.plasmids.find(x => x.id === crisprState.plasmidId); if(!p) return;
  const seq = seqOf(p), L = seq.length;
  let a = parseInt(val("cr-from"),10), b = parseInt(val("cr-to"),10);
  if(!isNaN(a) && !isNaN(b)){ crisprState.from = Math.max(0, a-1); crisprState.to = Math.min(L-1, b-1); }
  else { crisprState.from = null; crisprState.to = null; }
  const g = findGuides(seq, crisprState.sys,
    crisprState.from === null ? undefined : crisprState.from,
    crisprState.to === null ? undefined : crisprState.to);
  const top = g.slice(0, 40);
  top.forEach(x => {
    // drop the guide's own on-target hit so only genuine off-targets are reported
    let dropped = false;
    x.off = localOffTargets(x.spacer, crisprState.sys).filter(o => {
      if(!dropped && o.mm === 0 && o.plasmidId === p.id){ dropped = true; return false; }
      return true;
    });
  });
  crisprState.guides = top; crisprState.all = g.length; crisprState.selected = top[0] || null;
  render();
}
function crisprResults(p){
  const gs = crisprState.guides;
  if(!gs.length) return `<div class="panel"><div class="note warn">No PAM sites found in that window.</div></div>`;
  const sel = crisprState.selected;
  return `<div class="panel">
    <div class="lblrow"><h2 style="margin:0">${gs.length} best guides <span class="muted small">of ${crisprState.all} found</span></h2>
      <button class="ghost" onclick="exportGuides()">Export CSV</button></div>
    <div class="scrollx"><table>
      <thead><tr><th>#</th><th>Spacer (5'→3')</th><th>PAM</th><th>Strand</th><th>Cut at</th><th>GC</th><th>Score</th><th>Local off-targets</th><th>Flags</th></tr></thead>
      <tbody>${gs.map((g,i) => `<tr style="cursor:pointer;background:${g===sel?"var(--accent-soft)":"transparent"}" onclick="crisprState.selected=crisprState.guides[${i}];render()">
        <td>${i+1}</td><td class="mono">${g.spacer}</td><td class="mono muted">${g.pam}</td>
        <td>${g.strand===1?"+":"−"}</td><td>${g.cut+1}</td><td>${g.gc}%</td>
        <td><b style="color:${g.score>=90?"var(--green)":g.score>=70?"var(--amber)":"var(--red)"}">${g.score}</b></td>
        <td>${offSummary(g.off)}</td>
        <td class="muted small">${g.warn.length ? "⚠ " + g.warn.length : "—"}</td></tr>`).join("")}
      </tbody></table></div>
    <div class="muted small" style="margin-top:8px">Score is a rule-based heuristic, not a published efficiency model
      (Doench/Rule Set 2, DeepSpCas9 and similar need trained coefficients and a server). Treat it as a filter for
      obviously bad guides, not a ranking you would bet an experiment on.</div>
  </div>
  ${sel ? guideDetail(p, sel) : ""}`;
}
function offSummary(off){
  if(!off || !off.length) return '<span class="pill green">none ≤3 mm</span>';
  const exact = off.filter(o => o.mm === 0).length, near = off.filter(o => o.mm > 0 && o.mm <= 2).length;
  if(exact) return `<span class="pill red">${exact} exact</span>`;
  if(near) return `<span class="pill amber">${near} ≤2 mm</span>`;
  return `<span class="pill grey">${off.length} at 3 mm</span>`;
}
function guideDetail(p, g){
  const oligos = guideOligos(g.spacer);
  const be = baseEditWindow(g);
  const seq = seqOf(p);
  const orfHit = (p.ann||[]).find(a => a.kind === "orf" && g.pamStart >= a.start && g.pamStart <= a.end);
  const silent = orfHit ? silentPamBlock(seq, g.pamStart, orfHit) : null;
  const hdr = designHDR(seq, g.cut, crisprState.hdrEdit, crisprState.armLen);
  const context = seq.slice(Math.max(0,g.start-10), Math.min(seq.length, g.end+14));
  return `<div class="grid2">
    <div class="panel">
      <h2>Guide detail</h2>
      <div class="seqbox" style="max-height:none">${esc(context)}
<span class="muted">${" ".repeat(Math.min(10,g.start))}${"^".repeat(g.spacer.length)}${g.strand===1?" PAM →":" ← PAM"}</span></div>
      <div style="margin-top:10px">
        <span class="stat">Spacer <b class="mono">${g.spacer}</b></span><br>
        <span class="stat">PAM <b class="mono">${g.pam}</b></span>
        <span class="stat">Strand <b>${g.strand===1?"forward":"reverse"}</b></span>
        <span class="stat">Blunt cut after <b>${g.cut+1}</b></span></div>
      ${g.warn.length ? `<div class="note" style="margin-top:10px">${g.warn.map(w => "⚠ " + esc(w)).join("<br>")}</div>` : `<div class="note ok" style="margin-top:10px">No sequence flags.</div>`}
      <label>Cloning oligos</label>
      <table><thead><tr><th>Vector</th><th>Oligo</th><th>Sequence</th><th></th></tr></thead><tbody>
        <tr><td rowspan="2">pX330 / pSpCas9(BB)<br><span class="muted small">BbsI</span></td>
          <td>top</td><td class="mono" style="word-break:break-all">${oligos.bbsI.top}</td>
          <td><button class="ghost" onclick="copyText('${oligos.bbsI.top}','Oligo')">copy</button></td></tr>
        <tr><td>bottom</td><td class="mono" style="word-break:break-all">${oligos.bbsI.bot}</td>
          <td><button class="ghost" onclick="copyText('${oligos.bbsI.bot}','Oligo')">copy</button></td></tr>
        <tr><td rowspan="2">lentiCRISPRv2 / lentiGuide<br><span class="muted small">BsmBI (Esp3I)</span></td>
          <td>top</td><td class="mono" style="word-break:break-all">${oligos.bsmBI.top}</td>
          <td><button class="ghost" onclick="copyText('${oligos.bsmBI.top}','Oligo')">copy</button></td></tr>
        <tr><td>bottom</td><td class="mono" style="word-break:break-all">${oligos.bsmBI.bot}</td>
          <td><button class="ghost" onclick="copyText('${oligos.bsmBI.bot}','Oligo')">copy</button></td></tr>
      </tbody></table>
      <div class="muted small" style="margin-top:6px">${oligos.note}. Anneal 100 µM each in T4 ligase buffer
        (95 °C 5 min, cool 5 °C/min), dilute 1:200, ligate into the BbsI/BsmBI-cut backbone.</div>
      <div style="margin-top:12px">
        <button class="ghost" onclick="annotateGuide()">Add this guide to the map</button>
      </div>
    </div>
    <div>
      <div class="panel">
        <h2>Off-targets in this workspace</h2>
        ${g.off && g.off.length ? `<div class="scrollx"><table>
          <thead><tr><th>Construct</th><th>Mismatches</th><th>In seed (PAM-proximal 12)</th><th>Sequence</th></tr></thead><tbody>
          ${g.off.slice(0,12).map(o => `<tr><td>${esc(o.plasmid)}</td>
            <td><span class="pill ${o.mm===0?"red":o.mm<=2?"amber":"grey"}">${o.mm}</span></td>
            <td>${o.seedMM}</td><td class="mono small">${o.seq}</td></tr>`).join("")}
          </tbody></table></div>` : `<div class="note ok">No site with ≤3 mismatches anywhere in this workspace.</div>`}
        <div class="note info" style="margin-top:10px">This only searches the ${state.plasmids.length} sequences you have
          loaded. It catches the mistake that actually bites in plasmid work — a guide that also cuts your donor or your
          backbone — and says nothing about the genome.</div>
      </div>
      ${isSimple() ? `<div class="panel tight"><span class="muted small">Base-editing windows and the HDR donor
        designer are hidden in Simple. <a href="#" onclick="setDepth('full');return false">Switch to Full</a>
        to see them.</span></div>` : `
      <div class="panel">
        <h2>Base editing windows</h2>
        <div class="muted small">Editing window is roughly positions 4–8 of the protospacer, counting from the PAM-distal end.</div>
        <table><thead><tr><th>Editor</th><th>Window</th><th>Editable bases</th></tr></thead><tbody>
          <tr><td>CBE (C→T)</td><td class="mono">${be.cbeWin}</td>
            <td>${be.cbe.length ? be.cbe.map(x => "C at " + x.pos).join(", ") : '<span class="muted">none</span>'}</td></tr>
          <tr><td>ABE (A→G)</td><td class="mono">${be.abeWin}</td>
            <td>${be.abe.length ? be.abe.map(x => "A at " + x.pos).join(", ") : '<span class="muted">none</span>'}</td></tr>
        </tbody></table>
      </div>
      <div class="panel">
        <h2>HDR donor (ssODN)</h2>
        <div class="row">
          <div><label class="plain">Sequence to insert at the cut</label>
            <input value="${esc(crisprState.hdrEdit)}" placeholder="e.g. a tag, or blank for a silent edit only"
              oninput="crisprState.hdrEdit=cleanDNA(this.value)"></div>
          <div style="max-width:120px"><label class="plain">Arm length</label>
            <input type="number" value="${crisprState.armLen}" oninput="crisprState.armLen=parseInt(this.value)||50"></div>
        </div>
        <div style="margin-top:8px"><button class="ghost" onclick="render()">Update donor</button></div>
        <label>Donor, ${hdr.len} nt</label>
        <div class="seqbox">${hdr.left}<b style="background:var(--sel)">${crisprState.hdrEdit || ""}</b>${hdr.right}</div>
        <div style="margin-top:8px"><button class="ghost" onclick="copyText(${jsq(hdr.donor)},'Donor')">Copy donor</button>
          <button class="ghost" onclick="copyText(${jsq(revComp(hdr.donor))},'Donor (antisense)')">Copy antisense</button></div>
        ${silent ? `<div class="note ok" style="margin-top:10px"><b>PAM block:</b> the PAM sits inside “${esc(orfHit.label)}”.
          Changing codon ${silent.from} → ${silent.to} at position ${silent.codonStart+1} keeps ${silent.aa} but breaks the
          PAM (${silent.newPam}), so Cas9 cannot re-cut the edited allele.</div>`
          : `<div class="note" style="margin-top:10px">Mutate the PAM or the seed in the donor, otherwise Cas9 re-cuts the
            repaired allele. Annotate the ORF on the map and BetterBench will propose a silent change automatically.</div>`}
        <div class="muted small" style="margin-top:8px">Asymmetric donors (~36 nt on the PAM-distal side, ~91 nt on the other)
          are reported to work better for Cas9 ssODN repair than symmetric ones — adjust the arms if your edit is stubborn.</div>
      </div>`}
    </div>
  </div>`;
}
function annotateGuide(){
  const p = state.plasmids.find(x => x.id === crisprState.plasmidId), g = crisprState.selected;
  if(!p || !g) return;
  p.ann.push({ id:uid(), start:g.start, end:g.end, label:"sgRNA " + g.spacer.slice(0,8) + "… (" + (g.strand===1?"+":"−") + ")",
               color:"#f3d6f5", kind:"custom", strand:g.strand, how:"CRISPR design" });
  p.ann.sort((a,b) => a.start - b.start); save(); toast("Guide added to the map");
}
function exportGuides(){
  const rows = [["rank","spacer","pam","strand","start","cut","gc","score","local_off_targets","flags"]];
  crisprState.guides.forEach((g,i) => rows.push([i+1, g.spacer, g.pam, g.strand===1?"+":"-", g.start+1, g.cut+1, g.gc, g.score,
    (g.off||[]).length, g.warn.join(" | ")]));
  download("guides.csv", rows.map(r => r.map(x => '"' + String(x).replace(/"/g,'""') + '"').join(",")).join("\n"), "text/csv");
}

/* ===================== VIEW: protein ===================== */
function viewProtein(){
  const all = state.plasmids;
  const p = state.plasmids.find(x => x.id === (proteinState.sel && proteinState.sel.plasmidId)) || null;
  const orfs = p && p.type === "dna" ? findORFs(seqOf(p), 40).slice(0, 12) : [];
  let aa = "";
  if(p){
    if(p.type === "protein") aa = seqOf(p);
    else if(proteinState.orfPick !== undefined && orfs[proteinState.orfPick]) aa = orfs[proteinState.orfPick].aa;
    else if(proteinState.sel && proteinState.sel.start !== undefined)
      aa = translate(seqOf(p).slice(proteinState.sel.start, proteinState.sel.end + 1)).replace(/\*.*$/,"");
  }
  const e = aa ? extCoeff(aa) : null;
  return `<h1 class="page">Protein</h1>
  <p class="lede">A region, its ORF, and the AlphaFold model for it. ESMFold is experimental and often unreachable.</p>
  <div class="grid2">
    <div class="panel">
      <h2>Source</h2>
      <label>Construct</label>
      <select onchange="proteinState.sel={plasmidId:this.value};proteinState.orfPick=undefined;render()">
        <option value="">— choose —</option>
        ${all.map(x => `<option value="${x.id}" ${p&&p.id===x.id?"selected":""}>${esc(x.name)}${x.type==="protein"?" (protein)":""}</option>`).join("")}
      </select>
      ${p && p.type === "dna" ? `<label>Open reading frame</label>
        ${orfs.length ? `<div style="max-height:200px;overflow:auto">${orfs.map((o,i) => `
          <div class="comp" onclick="proteinState.orfPick=${i};render()"
            style="background:${proteinState.orfPick===i?"var(--accent-soft)":"transparent"}">
            <span class="comp-nm">${o.len} aa · frame ${o.frame > 0 ? "+" : ""}${o.frame}</span>
            <span class="comp-pos">${o.start+1}–${o.end+1}</span></div>`).join("")}</div>`
          : `<div class="muted small">No ORF ≥ 40 aa found.</div>`}` : ""}
      ${aa ? `<label>Translation (${aa.length} aa)</label>
        <div class="seqbox">${aa.match(/.{1,60}/g).join("\n")}</div>
        <div style="margin-top:8px"><button class="ghost" onclick="copyText(${jsq(aa)},'Protein')">Copy</button>
          <button class="ghost" onclick="saveProtein(${jsq(aa)})">Save as a construct</button>
          <button class="ghost" onclick="window.open('https://blast.ncbi.nlm.nih.gov/Blast.cgi?PROGRAM=blastp&PAGE_TYPE=BlastSearch&QUERY='+encodeURIComponent(${jsq(aa)}),'_blank')">BLASTp</button></div>` : ""}
    </div>
    <div class="panel">
      <h2>Properties</h2>
      ${aa ? `<span class="stat">Length <b>${aa.length}</b> aa</span>
        <span class="stat">MW <b>${proteinMW(aa)}</b> kDa</span>
        <span class="stat">pI <b>${pI(aa)}</b></span>
        <span class="stat">GRAVY <b>${gravy(aa)}</b></span>
        <label>A280 / quantification</label>
        <div class="muted small">ε reduced <b>${e.red}</b> M⁻¹cm⁻¹ (${e.W} W, ${e.Y} Y) ·
          with disulphides <b>${e.ox}</b> ·
          A280 of a 1 mg/mL solution ≈ <b>${e.red ? (e.red/(proteinMW(aa)*1000)).toFixed(2) : "0 — no W or Y, quantify another way"}</b></div>
        <label>Composition</label>
        <div class="muted small">${["A","R","N","D","C","E","Q","G","H","I","L","K","M","F","P","S","T","W","Y","V"]
          .map(x => x + " " + ((aa.match(new RegExp(x,"g"))||[]).length)).join(" · ")}</div>`
        : `<div class="empty"><div class="big">🧊</div>Pick a construct and an ORF.</div>`}
    </div>
  </div>
  <div class="panel">
    <div class="lblrow"><h2 style="margin:0">Structure</h2>
      ${aa ? `<button class="primary" onclick="runStructureSearch(${jsq(aa)})">Find a structure</button>` : ""}</div>
    ${aa ? `<p class="muted small" style="margin:8px 0 0">Looks for a solved structure of this exact protein first,
      then a curated model of it, then a close relative &mdash; and only offers a de novo prediction when none of
      those exist.</p>` : `<p class="muted small" style="margin:8px 0 0">Pick a construct and an ORF first.</p>`}
    <details class="fold" style="margin-top:10px"><summary>Or fetch a model by accession</summary>
      <div class="row" style="margin-top:8px">
        <input id="uni-q" value="${esc(p ? p.uniprot || "" : "")}" placeholder="UniProt accession, or a name like “LRRC8A mouse”">
        <button class="ghost" style="flex:0 0 auto" onclick="loadStructure()">Load AlphaFold model</button>
      </div>
    </details>
    <div id="struct-status" class="muted" style="margin-top:10px">${esc(proteinState.foldStatus)}</div>
    <div id="viewer3d" style="height:380px;position:relative;margin-top:10px;border:1px solid var(--line);border-radius:9px;background:#fff"></div>
    <div class="note">Every step here needs the network. Opening this file by double-clicking gives it the origin
      <code>null</code>, which the PDB and AlphaFold both refuse &mdash; serve the folder with
      <code>python -m http.server</code> if the searches fail instantly.</div>
  </div>
  ${structureLadder(aa)}`;
}
function saveProtein(aa){
  const name = prompt("Name", "protein_" + (state.plasmids.length+1)); if(!name) return;
  state.plasmids.push({ id:uid(), name, type:"protein", topology:"linear", uniprot:"", seq:aa, ann:[], stock:[],
    inSilico:true, tags:["translation"], created:today(), source:"translated in BetterBench" });
  save(); toast("Saved"); render();
}
async function loadStructure(){
  const q = val("uni-q").trim();
  const status = document.getElementById("struct-status");
  if(!q){ status.textContent = "Enter a UniProt accession or a protein name."; return; }
  if(typeof $3Dmol === "undefined"){ status.textContent = "The 3D viewer library did not load (needs internet)."; return; }
  try{
    let acc = q;
    const looksAcc = /^[A-Za-z0-9]{6,10}$/.test(q) && /[0-9]/.test(q) && !/\s/.test(q);
    if(!looksAcc){
      status.textContent = 'Resolving "' + q + '" via UniProt…';
      const r = await fetch(`https://rest.uniprot.org/uniprotkb/search?query=${encodeURIComponent(q)}&format=json&size=1&fields=accession`);
      const j = await r.json();
      if(!j.results || !j.results.length) throw new Error('No UniProt match for "' + q + '"');
      acc = j.results[0].primaryAccession;
    }
    status.textContent = "Fetching AlphaFold model for " + acc + "…";
    const ar = await fetch(`https://alphafold.ebi.ac.uk/api/prediction/${encodeURIComponent(acc)}`);
    if(!ar.ok) throw new Error("AlphaFold has no model for " + acc);
    const aj = await ar.json();
    if(!aj.length) throw new Error("No AlphaFold entry for " + acc);
    const url = aj[0].pdbUrl || aj[0].cifUrl, fmt = url.endsWith(".cif") ? "cif" : "pdb";
    const data = await (await fetch(url)).text();
    showStructure(data, fmt);
    const p = state.plasmids.find(x => x.id === (proteinState.sel && proteinState.sel.plasmidId));
    if(p){ p.uniprot = acc; save(); }
    status.innerHTML = 'AlphaFold model <b>' + acc + '</b> · coloured by pLDDT · ' +
      '<a href="https://alphafold.ebi.ac.uk/entry/' + acc + '" target="_blank" rel="noopener">open in AlphaFold DB ▸</a>';
  }catch(e){ status.textContent = "Error: " + e.message + "  (a 'failed to fetch' here usually means the page needs to be served over http)"; }
}
function showStructure(data, fmt, byConfidence){
  const el = document.getElementById("viewer3d"); if(!el) return;
  el.innerHTML = "";
  if(typeof $3Dmol === "undefined"){ el.innerHTML = '<div class="empty">3D viewer library did not load.</div>'; return; }
  const v = $3Dmol.createViewer(el, { backgroundColor:"white" });
  v.addModel(data, fmt);
  if(byConfidence){
    // a predicted model stores pLDDT in the B-factor column, so colour by confidence
    v.setStyle({}, { cartoon:{ colorfunc: atom => {
      const b = atom.b;
      return b > 90 ? "#0053D6" : b > 70 ? "#65CBF3" : b > 50 ? "#FFDB13" : "#FF7D45";
    } } });
  } else {
    // an experimental structure has real B-factors; colouring by them would be misleading
    v.setStyle({}, { cartoon:{ colorscheme:"spectrum" } });
  }
  v.zoomTo(); v.render();
}
async function foldWithESM(aa){
  const status = document.getElementById("struct-status");
  if(!aa){ status.textContent = "Pick an ORF first."; return; }
  if(aa.length > 400){ status.textContent = "ESMFold's public endpoint refuses anything over 400 residues (it answers 413). Trim to a domain and fold that."; return; }
  status.textContent = "Sending " + aa.length + " residues to ESMFold… (this can take 30-60 s and often fails)";
  try{
    const r = await fetch("https://api.esmatlas.com/foldSequence/v1/pdb/", { method:"POST", body: aa });
    if(!r.ok) throw new Error("ESMFold returned " + r.status);
    const pdb = await r.text();
    if(!/^ATOM|^HEADER|^MODEL/m.test(pdb)) throw new Error("unexpected response");
    showStructure(pdb, "pdb");
    status.innerHTML = "ESMFold prediction shown. <b>This is a prediction, not a deposited structure</b> — " +
      "the B-factor column holds pLDDT, so orange regions are low confidence.";
  }catch(e){
    status.textContent = "ESMFold failed: " + e.message + ". The public endpoint is rate-limited and refuses " +
      "file:// origins; serve the folder over http, or use the ESM Metagenomic Atlas or a local ColabFold.";
  }
}

/* ===================== VIEW: protocols ===================== */
const CAT_ORDER = ["Cloning","PCR","Bacteria","DNA prep","Cell culture","Verification"];
function catRank(c){ const i = CAT_ORDER.indexOf(c); return i === -1 ? CAT_ORDER.length : i; }
function toggleCat(c){
  protoState.expanded = protoState.expanded || {};
  protoState.expanded[c] = !protoState.expanded[c];
  render();
}
function viewProtocols(){
  if(protoState.open){
    const p = protocolById(protoState.open);
    if(p) return protocolDetail(p);
  }
  protoState.expanded = protoState.expanded || {};
  const all = PROTOCOLS.concat(state.customProtocols);
  const q = protoState.filter.trim().toLowerCase();
  const shown = all.filter(p => !q || p.name.toLowerCase().includes(q) || p.cat.toLowerCase().includes(q)
                             || p.steps.some(x => x.t.toLowerCase().includes(q)));
  const byCat = {};
  shown.forEach(p => (byCat[p.cat] = byCat[p.cat] || []).push(p));
  const cats = Object.keys(byCat).sort((a,b) => catRank(a) - catRank(b) || a.localeCompare(b));

  const branch = (c) => {
    // a search result opens its own branch; otherwise you decide
    const open = q ? true : !!protoState.expanded[c];
    const items = byCat[c];
    const started = items.filter(p => (state.runs[p.id]||{checked:[]}).checked.some(Boolean)).length;
    return `<div class="tnode">
      <div class="tbranch ${open?"open":""}" onclick="toggleCat('${esc(c).replace(/'/g,"")}')"
           tabindex="0" onkeydown="if(event.key==='Enter')toggleCat('${esc(c).replace(/'/g,"")}')">
        <span class="tcaret">▸</span>
        <span class="tname">${esc(c)}</span>
        <span class="tcount">${items.length}</span>
        ${started ? `<span class="pill blue">${started} in progress</span>` : ""}
      </div>
      ${open ? `<div class="tleaves">${items.map(p => {
        const run = state.runs[p.id] || { checked:[] };
        const done = run.checked.filter(Boolean).length;
        return `<div class="tleaf" onclick="protoState.open='${p.id}';protoState.n=1;render()"
                    tabindex="0" onkeydown="if(event.key==='Enter'){protoState.open='${p.id}';render()}">
          <span class="tleafnm">${esc(p.name)}</span>
          <span class="tmeta">${p.steps.length} steps${p.time?" · "+esc(p.time):""}</span>
          ${p.rx?'<span class="pill grey">table</span>':""}
          ${done ? `<span class="tprog"><span class="bar" style="width:52px"><i style="width:${done/p.steps.length*100}%"></i></span>
             <span class="muted small">${done}/${p.steps.length}</span></span>` : ""}
        </div>`; }).join("")}</div>` : ""}
    </div>`;
  };

  return `<h1 class="page">Protocols</h1>
  <p class="lede">Ticks are saved, so a half-finished protocol is still half-finished tomorrow.</p>
  <div class="panel">
    <div class="lblrow" style="margin-bottom:6px">
      <input id="protoq" placeholder="search protocols and steps…" value="${esc(protoState.filter)}"
        oninput="protoState.filter=this.value;render();refocus('protoq')" style="max-width:300px">
      <div>
        <button class="ghost" onclick="expandAllCats(true)">Expand all</button>
        <button class="ghost" onclick="expandAllCats(false)">Collapse all</button>
        <button class="primary" style="margin-left:6px" onclick="newProtocol()">＋ New</button>
      </div>
    </div>
    ${cats.length ? `<div class="tree">${cats.map(branch).join("")}</div>`
      : `<div class="empty"><div class="big">📋</div>Nothing matches “${esc(protoState.filter)}”.</div>`}
    ${state.customProtocols.length ? `<div class="muted small" style="margin-top:12px">
      Your own protocols are stored with the workspace and included in the export.</div>` : ""}
  </div>`;
}
function expandAllCats(v){
  protoState.expanded = {};
  if(v) PROTOCOLS.concat(state.customProtocols).forEach(p => protoState.expanded[p.cat] = true);
  render();
}
function protocolDetail(p){
  const run = state.runs[p.id] = state.runs[p.id] || { checked:[], note:"", started:null };
  const n = protoState.n || 1;
  const table = p.rx ? `<h3 style="margin-top:16px">${esc(p.rx.label)}</h3>
    <div class="row" style="max-width:340px;align-items:flex-end">
      <div><label class="plain">Number of reactions</label>
        <input type="number" min="1" value="${n}" oninput="protoState.n=Math.max(1,parseInt(this.value)||1);render()"></div>
      <div class="muted small" style="padding-bottom:9px">master mix includes 10% overage</div>
    </div>
    <div class="scrollx"><table><thead><tr><th>Reagent</th><th>1×</th><th>${n}× + 10%</th></tr></thead><tbody>
      ${p.rx.rows.map(r => {
        const v = typeof r.v === "number" ? r.v : null;
        return `<tr><td>${esc(r.r)}</td><td>${r.v} ${esc(r.unit||"")}</td>
          <td><b>${v !== null ? (v*n*1.1).toFixed(1) + " " + (r.unit||"") : "—"}</b></td></tr>`; }).join("")}
    </tbody></table></div>` : "";
  const done = run.checked.filter(Boolean).length;
  return `<div class="toolbar" style="justify-content:space-between;margin-top:0">
      <div><button class="ghost" onclick="protoState.open=null;render()">‹ All protocols</button>
        <b style="margin-left:10px;font-size:15px">${esc(p.name)}</b>
        <span class="muted"> · ${esc(p.cat)} · ${esc(p.time||"")}</span></div>
      <div><span class="muted small">${done}/${p.steps.length} done</span>
        <button class="ghost" onclick="resetRun('${p.id}')">Reset ticks</button>
        <button class="ghost" onclick="copyProtocol('${p.id}')">Copy as text</button></div></div>
  <div class="panel">
    ${p.steps.map((s,i) => `<div class="step ${run.checked[i]?"done":""}">
      <input type="checkbox" ${run.checked[i]?"checked":""} onchange="tickStep('${p.id}',${i},this.checked)">
      <div class="steptext">${esc(s.t)}${s.meta?`<div class="stepmeta">${esc(s.meta)}</div>`:""}</div></div>`).join("")}
    ${table}
    <label>Notes for this run</label>
    <textarea rows="3" oninput="state.runs['${p.id}'].note=this.value;save()" placeholder="what actually happened…">${esc(run.note)}</textarea>
  </div>`;
}
function tickStep(id, i, v){
  const run = state.runs[id] = state.runs[id] || { checked:[], note:"", started:null };
  run.checked[i] = v; if(!run.started) run.started = new Date().toISOString();
  save(); render();
}
function resetRun(id){ state.runs[id] = { checked:[], note:"", started:null }; save(); render(); }
function copyProtocol(id){
  const p = protocolById(id);
  let t = p.name + " (" + p.cat + ", " + (p.time||"") + ")\n\n";
  p.steps.forEach((s,i) => { t += (i+1) + ". " + s.t + (s.meta ? "\n   [" + s.meta + "]" : "") + "\n"; });
  if(p.rx){ t += "\n" + p.rx.label + "\n"; p.rx.rows.forEach(r => { t += "  " + r.r + ": " + r.v + " " + (r.unit||"") + "\n"; }); }
  copyText(t, "Protocol");
}
function newProtocol(){
  const name = prompt("Protocol name"); if(!name) return;
  const cat = prompt("Category", "Custom") || "Custom";
  const raw = prompt("Steps, one per line (you can edit later by re-creating)");
  if(raw === null) return;
  const steps = raw.split(/\n|;/).map(s => s.trim()).filter(Boolean).map(t => ({ t }));
  state.customProtocols.push({ id:"c" + uid(), name, cat, time:"", steps });
  save(); render();
}
function delProtocol(id){
  if(!confirm("Delete this protocol?")) return;
  state.customProtocols = state.customProtocols.filter(p => p.id !== id);
  delete state.runs[id]; save(); render();
}
