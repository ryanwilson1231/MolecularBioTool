/* ===================== renderers ===================== */
function renderLinear(seq, p){
  const per = 60, ann = p.ann || [];
  const bg = i => { for(const a of ann) if(i >= a.start && i <= a.end) return a.color; return null; };
  const inSel = i => sel.start === null ? false : (sel.end === null ? i === sel.start : (i >= sel.start && i <= sel.end));
  let h = "";
  for(let line = 0; line*per < seq.length; line++){
    const sp = line*per;
    h += `<div class="seqline"><span class="pos">${String(sp+1).padStart(6)}</span><span class="bases">`;
    for(let j = sp; j < Math.min(sp+per, seq.length); j++){
      const c = bg(j), cls = "b" + (inSel(j) ? " sel" : "");
      const st = (c && !inSel(j)) ? ` style="background:${c}"` : "";
      h += `<span class="${cls}"${st} onclick="setBase(${j},event)" onmouseover="setHover(${j})">${seq[j]}</span>`;
      if((j+1) % 10 === 0) h += " ";
    }
    h += `</span></div>`;
  }
  return h;
}
function polar(cx, cy, r, deg){ const a = (deg - 90) * Math.PI / 180; return [cx + r*Math.cos(a), cy + r*Math.sin(a)]; }
function arcPath(cx, cy, r, d0, d1){
  const [x0,y0] = polar(cx,cy,r,d0), [x1,y1] = polar(cx,cy,r,d1);
  const large = (((d1-d0) % 360 + 360) % 360) > 180 ? 1 : 0;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
function niceStep(L){
  const raw = L/10, mag = Math.pow(10, Math.floor(Math.log10(raw || 1))), n = raw/mag;
  const s = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return Math.max(1, s*mag);
}
function renderCircular(seq, p){
  const L = seq.length, cx = 230, cy = 230, R = 158;
  let ticks = ""; const step = niceStep(L);
  for(let pos = 0; pos < L; pos += step){
    const deg = pos/L*360;
    const [x1,y1] = polar(cx,cy,R,deg), [x2,y2] = polar(cx,cy,R+6,deg), [tx,ty] = polar(cx,cy,R+16,deg);
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#b8c4d4"/>
      <text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="8.5" fill="#8595a8" text-anchor="middle" dominant-baseline="middle">${pos+1}</text>`;
  }
  // features on up to three concentric lanes so overlapping ones stay readable
  const anns = (p.ann || []).slice().sort((a,b) => a.start - b.start);
  const lanes = [];
  const laneOf = a => {
    for(let i=0;i<3;i++){
      if(!lanes[i]) lanes[i] = [];
      if(!lanes[i].some(b => a.start <= b.end && a.end >= b.start)){ lanes[i].push(a); return i; }
    }
    lanes[0].push(a); return 0;
  };
  let arcs = "", labels = "";
  anns.forEach((a, i) => {
    const lane = laneOf(a), r = R - lane*11;
    const d0 = a.start/L*360, d1 = (a.end+1)/L*360;
    arcs += `<path d="${arcPath(cx,cy,r,d0,d1)}" stroke="${a.color}" stroke-width="8" fill="none" stroke-linecap="butt"
      opacity="0.95"><title>${esc(a.label)} (${a.start+1}-${a.end+1})</title></path>`;
    if((a.end - a.start) / L > 0.012 || anns.length <= 14){
      const mid = (d0 + d1)/2;
      const ring = 34 + (i % 3)*13;
      const [mx,my] = polar(cx,cy,R+ring,mid);
      const [lx,ly] = polar(cx,cy,R+8,mid);
      const anchor = (mid > 180) ? "end" : "start";
      const [ax,ay] = polar(cx,cy,R+ring-3,mid);
      labels += `<line x1="${lx.toFixed(1)}" y1="${ly.toFixed(1)}" x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}" stroke="#cbd5e1"/>
        <text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" font-size="9.5" fill="#37475b" text-anchor="${mid>180?'end':'start'}"
          dominant-baseline="middle">${esc(annLabel(a).length > 22 ? annLabel(a).slice(0,21)+"…" : annLabel(a))}</text>`;
    }
  });
  let selArc = "";
  if(sel.start !== null && sel.end !== null)
    selArc = `<path d="${arcPath(cx,cy,R+4,sel.start/L*360,(sel.end+1)/L*360)}" stroke="#f2b705" stroke-width="12" fill="none" opacity="0.55" stroke-linecap="round"/>`;
  else if(sel.start !== null){
    const [px,py] = polar(cx,cy,R+4,sel.start/L*360);
    selArc = `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="5" fill="#f2b705"/>`;
  }
  return `<svg id="circ" width="100%" height="470" viewBox="0 0 460 460" style="max-width:470px;cursor:crosshair"
      onclick="circleClick(event)" onmousemove="circleHover(event)" onmouseleave="clearHover()">
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#ccd6e2" stroke-width="5"/>
    ${ticks}${arcs}
    <path id="prevArc" d="" stroke="#f2b705" stroke-width="11" fill="none" opacity="0.3" stroke-linecap="round"/>
    ${selArc}${labels}
    <polygon points="${cx-6},${(cy-R-11).toFixed(1)} ${cx+6},${(cy-R-11).toFixed(1)} ${cx},${(cy-R-1).toFixed(1)}" fill="#2f6fed"/>
    <text x="${cx}" y="${cy-8}" font-size="14" fill="#16202b" text-anchor="middle" font-weight="650">${esc(p.name)}</text>
    <text x="${cx}" y="${cy+12}" font-size="11" fill="#66788c" text-anchor="middle">${L} bp · GC ${gcPct(seq).toFixed(1)}%</text>
    <text x="${cx}" y="${cy+30}" font-size="9" fill="#9aa7b5" text-anchor="middle">▲ position 1 · clockwise</text></svg>`;
}
function circleXY(e){
  const svg = document.getElementById("circ"); if(!svg) return null;
  const rect = svg.getBoundingClientRect();
  const x = (e.clientX - rect.left)/rect.width*460 - 230;
  const y = (e.clientY - rect.top)/rect.height*460 - 230;
  return { x, y };
}
function circleIdx(e, L){
  const c = circleXY(e); if(!c) return 0;
  let deg = (Math.atan2(c.y, c.x)*180/Math.PI + 90 + 360) % 360;
  let idx = Math.round(deg/360*L) % L;
  if(idx < 0) idx += L; if(idx >= L) idx = L - 1;
  return idx;
}
function circleClick(e){ const p = curP(); if(!p) return; setBase(circleIdx(e, seqOf(p).length), e); }
function circleHover(e){ const p = curP(); if(!p) return; setHover(circleIdx(e, seqOf(p).length)); }

/* ===================== selection ===================== */
function clearSel(){ sel = { start:null, end:null }; showMenu = false; copySub = false; hoverIdx = null; }
function setBase(i, e){
  hoverIdx = null;
  if(sel.start === null || (sel.start !== null && sel.end !== null)){
    sel = { start:i, end:null }; showMenu = false; copySub = false; showSidebar = false; showDetails = false;
  } else {
    if(i >= sel.start) sel.end = i; else sel = { start:i, end:sel.start };
    menuPos = e ? { x:e.clientX, y:e.clientY } : { x:260, y:260 };
    showMenu = true;
  }
  render();
}
function selecting(){ return sel.start !== null && sel.end === null; }
function setHover(i){ if(!selecting()) return; hoverIdx = i; paintPreview(); }
function clearHover(){ hoverIdx = null; paintPreview(); }
function paintPreview(){
  const p = curP(); if(!p) return; const L = seqOf(p).length;
  if(viewMode === "circular" && p.type === "dna"){
    const el = document.getElementById("prevArc"); if(!el) return;
    if(!selecting() || hoverIdx === null){ el.setAttribute("d",""); return; }
    const a = Math.min(sel.start, hoverIdx), b = Math.max(sel.start, hoverIdx);
    el.setAttribute("d", arcPath(230,230,162, a/L*360, (b+1)/L*360));
  } else {
    const wrap = document.getElementById("seqwrap"); if(!wrap) return;
    const spans = wrap.querySelectorAll(".b");
    let a = -1, b = -1;
    if(selecting() && hoverIdx !== null){ a = Math.min(sel.start, hoverIdx); b = Math.max(sel.start, hoverIdx); }
    spans.forEach((s, idx) => { if(idx >= a && idx <= b && idx !== sel.start) s.classList.add("prev"); else s.classList.remove("prev"); });
  }
}
/* context menu on a finished selection */
function menuHTML(){
  if(!showMenu || sel.start === null || sel.end === null || state.view !== "plasmids" || state.pView !== "detail") return "";
  const p = curP(); if(!p) return "";
  const isDNA = p.type === "dna";
  const items = copySub ? `
    ${isDNA ? `<div class="menuitem" onclick="copyRegion('dna')">Copy DNA</div>
      <div class="menuitem" onclick="copyRegion('rc')">Copy reverse complement</div>` : ""}
    <div class="menuitem" onclick="copyRegion('prot')">Copy ${isDNA ? "translation" : "sequence"}</div>
    <div class="menuitem muted" onclick="copySub=false;render()">‹ Back</div>` : `
    <div class="menuitem" onclick="optLabel()">Label…</div>
    ${(() => { const hit = (p.ann||[]).find(a => a.start === sel.start && a.end === sel.end);
       return hit ? `<div class="menuitem" onclick="editComponent('${hit.id}')">Rename “${esc(hit.label)}”…</div>` : ""; })()}
    <div class="menuitem" onclick="optDetails()">Details</div>
    <div class="menuitem" onclick="optCopy()">Copy…</div>
    ${isDNA ? `<div class="menuitem" onclick="savePartFromSelection()">Save as a part</div>
      <div class="menuitem" onclick="teachFromSelection()">Teach the pre-check this</div>
      <div class="menuitem" onclick="sendToBuild()">Add to a design →</div>
      <div class="menuitem" onclick="sendToCrispr()">Design guides here →</div>
      <div class="menuitem" onclick="sendToProtein()">Get structure →</div>` : ""}
    <div class="menuitem danger" onclick="optDelete()">Remove labels here</div>
    <div class="menuitem muted" onclick="closeMenu()">Close</div>`;
  const x = Math.max(8, Math.min(menuPos.x, window.innerWidth - 200));
  const y = Math.max(8, Math.min(menuPos.y, window.innerHeight - 300));
  return `<div style="position:fixed;left:${x}px;top:${y}px;z-index:1000;background:#fff;border:1px solid var(--line);
    border-radius:9px;box-shadow:0 8px 26px rgba(0,0,0,.16);padding:6px;min-width:172px">${items}</div>`;
}
function closeMenu(){ showMenu = false; copySub = false; render(); }
function optDetails(){ showDetails = true; showMenu = false; render(); }
function optCopy(){ copySub = true; render(); }
function optDelete(){
  const p = curP();
  p.ann = p.ann.filter(a => !(a.start <= sel.end && a.end >= sel.start));
  showMenu = false; clearSel(); save(); render();
}
function copyRegion(kind){
  const p = curP(), region = seqOf(p).slice(sel.start, sel.end + 1);
  const text = kind === "dna" ? region : kind === "rc" ? revComp(region) : (p.type === "protein" ? region : translate(region));
  copyText(text, kind === "dna" ? "DNA" : kind === "rc" ? "Reverse complement" : "Protein");
  showMenu = false; copySub = false; render();
}
function optLabel(){ sidebarEditId = null; sidebarRegion = { start:sel.start, end:sel.end }; labelDraft = ""; showSidebar = true; showMenu = false; render(); }
/* The same panel creates a new component and edits an existing one.
   sidebarEditId is set when editing, null when labelling a fresh selection. */
let sidebarEditId = null;
function editComponent(aid){
  const p = curP(); const a = (p.ann || []).find(x => x.id === aid); if(!a) return;
  sidebarEditId = aid;
  sidebarRegion = { start:a.start, end:a.end };
  labelDraft = a.label;
  labelColor = a.color || PALETTE[0];
  showSidebar = true; showMenu = false;
  render();
}
function sidebarHTML(){
  if(!showSidebar || !sidebarRegion) return "";
  const editing = !!sidebarEditId;
  const p = curP();
  const a = editing ? (p.ann || []).find(x => x.id === sidebarEditId) : null;
  if(editing && !a){ sidebarEditId = null; showSidebar = false; return ""; }
  const sw = PALETTE.map(c => `<span class="swatch ${c===labelColor?'on':''}" style="background:${c}" onclick="pickColor('${c}')"></span>`).join("");
  const seq = seqOf(p);
  return `<div class="sidebar">
    <div class="lblrow"><h2 style="margin:0">${editing ? "Edit component" : "Label region"}</h2>
      <button class="ghost" onclick="sidebarCancel()">Close</button></div>
    <label>Name</label>
    <input id="sb-text" value="${esc(labelDraft)}" oninput="labelDraft=this.value"
      onkeydown="if(event.key==='Enter')sidebarSave()" placeholder="e.g. polyhedrin promoter, ORF, His-tag">
    <label>Colour</label><div>${sw}</div>
    <label>Span</label>
    <div class="row">
      <div><input id="sb-from" type="number" min="1" max="${seq.length}" value="${sidebarRegion.start+1}"
        oninput="sidebarSpan()"></div>
      <div><input id="sb-to" type="number" min="1" max="${seq.length}" value="${sidebarRegion.end+1}"
        oninput="sidebarSpan()"></div>
    </div>
    <div class="muted small" style="margin-top:4px">${sidebarRegion.end - sidebarRegion.start + 1} bp
      ${a && a.how && a.how !== "manual" ? "· found by " + esc(a.how) : ""}</div>
    <div style="margin-top:18px;display:flex;gap:8px;align-items:center">
      <button class="primary" onclick="sidebarSave()">${editing ? "Save" : "Add"}</button>
      <button class="ghost" onclick="sidebarCancel()">Cancel</button>
      ${editing ? `<button class="ghost danger" style="margin-left:auto"
        onclick="var i=sidebarEditId;sidebarCancel();delAnn(i)">Delete</button>` : ""}
    </div>
    ${editing ? `<div class="note info" style="margin-top:14px">Renaming only changes the label on this construct.
      To have the pre-check recognise this sequence everywhere, use
      <b>Teach the pre-check this</b> from the map.</div>` : ""}
  </div>`;
}
function sidebarSpan(){
  const p = curP(); const L = seqOf(p).length;
  let a = (parseInt(val("sb-from"), 10) || 1) - 1;
  let b = (parseInt(val("sb-to"), 10) || 1) - 1;
  a = Math.max(0, Math.min(L - 1, a));
  b = Math.max(a, Math.min(L - 1, b));
  sidebarRegion = { start:a, end:b };
}
function pickColor(c){ labelColor = c; render(); }
function sidebarSave(){
  const p = curP(), t = (labelDraft || "").trim();
  if(!t){ alert("Give the component a name."); return; }
  if(sidebarEditId){
    const a = p.ann.find(x => x.id === sidebarEditId);
    if(a){
      a.label = t; a.color = labelColor;
      a.start = sidebarRegion.start; a.end = sidebarRegion.end;
      if(a.how && a.how !== "manual") a.how = "manual (was: " + a.how + ")";
    }
  } else {
    p.ann.push({ id:uid(), start:sidebarRegion.start, end:sidebarRegion.end, label:t, color:labelColor,
                 kind:"custom", strand:1, how:"manual" });
  }
  p.ann.sort((a,b) => a.start - b.start);
  showSidebar = false; sidebarEditId = null; labelDraft = ""; clearSel(); save(); render();
}
function sidebarCancel(){ showSidebar = false; sidebarEditId = null; labelDraft = ""; render(); }
function copySeq(kind, btn){
  const p = curP();
  const text = kind === "dna" ? seqOf(p) : (p.type === "protein" ? seqOf(p) : longestORF(seqOf(p)).prot);
  navigator.clipboard.writeText(text).then(() => {
    const o = btn.textContent; btn.textContent = "Copied!"; setTimeout(() => btn.textContent = o, 1200);
  }).catch(() => copyText(text));
}
/* hand-offs between modules */
function sendToBuild(){
  const p = curP();
  asm.items.push({ partId:null, name: p.name + " " + (sel.start+1) + "-" + (sel.end+1),
                   kind:"custom", seq: seqOf(p).slice(sel.start, sel.end + 1), sourceId:p.id });
  asm.routes = null; asm.pick = 0;
  if(!asm.backboneId){
    const v = state.plasmids.find(x => x.type === "dna" && x.topology === "circular" && x.stock.length);
    if(v) asm.backboneId = v.id;
  }
  showMenu = false; go("design");
}
function sendToCrispr(){
  const p = curP();
  crisprState.plasmidId = p.id; crisprState.from = sel.start; crisprState.to = sel.end;
  crisprState.guides = null; crisprState.selected = null; showMenu = false; go("crispr");
}
function sendToProtein(){
  const p = curP();
  proteinState.sel = { plasmidId:p.id, start:sel.start, end:sel.end };
  proteinState.orfs = null; showMenu = false; go("protein");
}

/* ===================== detail tab: align ===================== */
function detailAlign(p){
  let res = "";
  if(alnResult && alnResult.error){
    res = `<div class="note warn">${esc(alnResult.error)}</div>`;
  } else if(alnResult){
    res = alignmentReport(p, alnResult);
  }
  return `<div class="panel">
    <h2>Align a read against ${esc(p.name)}</h2>
    <p class="muted" style="margin:0 0 4px">Paste a Sanger read, a nanopore consensus, a primer, or any fragment.
      Both strands are checked, the circular junction is handled, and every difference is listed in construct
      coordinates with the component it lands in.</p>
    <label>Query sequence (FASTA header is ignored)</label>
    <textarea id="aln-q" rows="5" placeholder="paste read here…">${esc(alnQuery)}</textarea>
    <div style="margin-top:12px">
      <button class="primary" onclick="doAlign()">Align</button>
      <button class="ghost" style="margin-left:8px" onclick="alnResult=null;alnQuery='';render()">Clear</button>
    </div>
    ${res}
  </div>`;
}
function doAlign(){
  const p = curP();
  let q = val("aln-q");
  alnQuery = q;
  q = q.split(/\r?\n/).filter(l => !l.startsWith(">")).join("");
  const t0 = performance.now();
  alnResult = alignToPlasmid(p, q);
  if(alnResult) alnResult.ms = Math.round(performance.now() - t0);
  render();
}
function alignmentReport(p, r){
  const seq = seqOf(p);
  const pos = i => ((i % r.refLen) + r.refLen) % r.refLen + 1;
  const diffRows = r.diffs.length ? r.diffs.map(d => {
    const hits = annotationsAt(p, d.pos);
    const label = d.type === "substitution" ? `${d.ref}→${d.qry}`
      : d.type === "deletion" ? `${d.ref} missing from read` : `${d.qry} extra in read`;
    let cons = "";
    if(hits.length){
      const a = hits[0];
      if(a.kind === "orf" || /ORF|CDS/i.test(a.label)){
        const off = d.pos - a.start, codon = Math.floor(off/3) + 1;
        cons = ` · codon ${codon} of “${esc(a.label)}”`;
      } else cons = ` · inside “${esc(a.label)}”`;
    }
    return `<tr><td><b>${pos(d.pos)}</b></td><td>${d.type}</td><td class="mono">${label}</td>
      <td class="muted">${hits.map(h => `<span class="pill grey">${esc(h.label)}</span>`).join(" ")}${cons}</td></tr>`;
  }).join("") : "";
  // blocked alignment view
  const per = 60; let blocks = "";
  for(let i=0; i<r.alnRef.length; i += per){
    const rr = r.alnRef.slice(i, i+per), qq = r.alnQry.slice(i, i+per);
    let refConsumed = 0;
    for(let j=0;j<i;j++) if(r.alnRef[j] !== "-") refConsumed++;
    const startPos = pos(r.refStart + refConsumed);
    let refHTML = "", qryHTML = "", midHTML = "";
    for(let j=0;j<rr.length;j++){
      const a = rr[j], b = qq[j];
      if(a === b){ refHTML += a; qryHTML += b; midHTML += "|"; }
      else if(a === "-" || b === "-"){ refHTML += `<span class="gp">${a}</span>`; qryHTML += `<span class="gp">${b}</span>`; midHTML += " "; }
      else { refHTML += `<span class="mm">${a}</span>`; qryHTML += `<span class="mm">${b}</span>`; midHTML += " "; }
    }
    blocks += `<div><span class="aln-lbl">${startPos}</span>${refHTML}\n<span class="aln-lbl"></span>${midHTML}\n<span class="aln-lbl">read</span>${qryHTML}\n\n</div>`;
  }
  const clean = r.diffs.length === 0;
  return `<div style="margin-top:18px">
    <div class="${clean ? "note ok" : "note"}">
      ${clean ? "✓ Perfect match" : r.diffs.length + " difference" + (r.diffs.length===1?"":"s") + " found"} —
      read aligns to <b>${pos(r.refStart)}–${pos(r.refEnd)}</b> on the
      <b>${r.strand === "+" ? "forward" : "reverse"}</b> strand,
      ${r.identity.toFixed(2)}% identity over ${r.aligned} bp${r.wraps ? ", crossing the origin" : ""}.
      <span class="muted small">(${r.ms} ms)</span>
    </div>
    ${r.diffs.length ? `<div class="panel tight" style="margin-top:12px"><h3>Differences</h3><div class="scrollx">
      <table><thead><tr><th>Position</th><th>Type</th><th>Change</th><th>Context</th></tr></thead>
      <tbody>${diffRows}</tbody></table></div>
      <div class="muted small" style="margin-top:8px">Read positions are given in construct coordinates.
        Sanger reads are unreliable in the first ~30 bases — check those against the trace before believing them.</div>
      </div>` : ""}
    <h3 style="margin-top:14px">Alignment</h3>
    <div class="alnblock">${blocks}</div>
  </div>`;
}

/* ===================== detail tab: features & digest ===================== */
let digestPick = [];
function toggleDigest(n){
  const i = digestPick.indexOf(n);
  if(i === -1){ if(digestPick.length >= 3){ digestPick.shift(); } digestPick.push(n); } else digestPick.splice(i,1);
  render();
}
function detailFeatures(p, seq){
  const circ = p.topology === "circular";
  const map = digestMap(seq, circ);
  const allNames = Object.keys(map).sort();
  const uniq = allNames.filter(n => map[n].length === 1);
  // Simple shows only the enzymes you can actually clone with
  const names = isSimple() ? uniq : allNames;
  const rows = names.map(n => {
    const o = overhangOf(n), sites = map[n];
    return `<tr>
      <td><label class="plain" style="margin:0;display:flex;gap:6px;align-items:center;text-transform:none">
        <input type="checkbox" style="width:auto" ${digestPick.includes(n)?"checked":""} onchange="toggleDigest('${n}')">
        <b>${n}</b></label></td>
      <td class="mono">${ENZ[n].s}</td>
      <td>${sites.length === 1 ? '<span class="pill green">unique</span>' : sites.length + "×"}</td>
      <td class="mono muted">${sites.slice(0,6).map(s => s.cut+1).join(", ")}${sites.length>6?"…":""}</td>
      <td>${ENZ[n].iis ? '<span class="pill blue">type IIS</span>' : o.type === "blunt" ? "blunt" : o.type + " " + o.seq}</td>
      <td>${ENZ[n].dam ? `<span class="pill amber" title="${ENZ[n].dam}">dam</span>` : ""}</td></tr>`;
  }).join("");
  const frags = digestPick.length ? fragments(seq, circ, digestPick) : null;
  const gelRows = frags ? frags.map(f => `<tr><td><b>${bp(f.size)}</b></td>
    <td><div class="bar" style="width:${Math.max(4, Math.min(100, Math.log10(f.size)/Math.log10(seq.length)*100))}%"><i style="width:100%"></i></div></td>
    <td class="muted mono">${f.from !== undefined ? (f.from+1) + "–" + (f.to) : ""}</td></tr>`).join("") : "";
  return `<div class="grid2">
    <div class="panel">
      <h2>Restriction map</h2>
      <p class="muted" style="margin:0 0 8px">${allNames.length} enzymes cut this construct;
        <b>${uniq.length}</b> cut exactly once. Tick up to three to simulate a digest.
        ${isSimple() ? `Showing unique cutters only &mdash;
          <a href="#" onclick="setDepth('full');return false">show all ${allNames.length}</a>.` : ""}</p>
      <div class="scrollx" style="max-height:460px;overflow-y:auto">
        <table><thead><tr><th>Enzyme</th><th>Site</th><th>Cuts</th><th>Cut at</th><th>Ends</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    </div>
    <div>
      <div class="panel">
        <h2>Simulated digest</h2>
        ${digestPick.length ? `<div class="muted" style="margin-bottom:6px">${digestPick.join(" + ")} on
          ${circ ? "circular" : "linear"} ${bp(seq.length)}</div>
          <table><thead><tr><th>Fragment</th><th>Relative size</th><th>Span</th></tr></thead><tbody>${gelRows}</tbody></table>
          ${digestPick.some(n => ENZ[n].dam) ? `<div class="note">One of these is blocked by Dam methylation in a
            standard dam⁺ strain — grow the plasmid in a dam⁻ strain (e.g. JM110) or pick a different enzyme.</div>` : ""}`
          : `<div class="empty"><div class="big">🧫</div>Tick enzymes on the left to see the fragments you would run on a gel.</div>`}
      </div>
      <div class="panel">
        <h2>Composition</h2>
        <span class="stat">Length <b>${seq.length} bp</b></span>
        <span class="stat">GC <b>${gcPct(seq).toFixed(1)}%</b></span>
        <span class="stat">Tm(whole) <b>${tmQuick(seq)}°C</b></span>
        <label>Open reading frames ≥ 80 aa</label>
        ${(() => { const o = findORFs(seq, 80).slice(0,6);
          return o.length ? `<table><thead><tr><th>Span</th><th>Strand</th><th>Length</th><th>MW</th><th></th></tr></thead><tbody>
            ${o.map(x => `<tr><td class="mono">${x.start+1}–${x.end+1}</td><td>${x.strand===1?"+":"−"}</td>
              <td>${x.len} aa</td><td>${proteinMW(x.aa)} kDa</td>
              <td><button class="ghost" onclick="copyText(${jsq(x.aa)},'Protein')">copy</button></td></tr>`).join("")}
            </tbody></table>` : `<div class="muted small">None.</div>`; })()}
      </div>
    </div></div>`;
}

/* ===================== detail tab: physical stock ===================== */
function detailStock(p){
  return `<div class="panel">
    <div class="lblrow"><h2 style="margin:0">Physical stock</h2>
      <button class="primary" onclick="addStock('${p.id}')">＋ Add tube</button></div>
    ${stockTable(p)}
    <div class="note info">A construct with no tubes is marked <b>in silico</b> everywhere else in BetterBench, and
      the Build tab will offer to plan the cloning that would make it real.</div>
  </div>`;
}
function stockTable(p){
  if(!p.stock.length) return `<div class="empty"><div class="big">🧊</div>No physical stock recorded.</div>`;
  return `<div class="scrollx"><table>
    <thead><tr><th>Label</th><th>Type</th><th>Conc.</th><th>Volume</th><th>Total</th><th>Location</th><th>Date</th><th>Notes</th><th></th></tr></thead>
    <tbody>${p.stock.map(t => `<tr>
      <td><b>${esc(t.label||"—")}</b></td><td>${esc(t.kind)}</td>
      <td>${t.conc ? t.conc + " ng/µL" : "—"}</td><td>${t.vol ? t.vol + " µL" : "—"}</td>
      <td>${t.conc && t.vol ? ((t.conc*t.vol)/1000).toFixed(1) + " µg" : "—"}</td>
      <td class="mono">${esc(t.loc||"—")}</td><td class="muted">${esc(t.date||"")}</td>
      <td class="muted">${esc(t.notes||"")}</td>
      <td style="white-space:nowrap"><button class="ghost" onclick="editStock('${p.id}','${t.id}')">edit</button>
        <button class="comp-x" onclick="delStock('${p.id}','${t.id}')">✕</button></td></tr>`).join("")}
    </tbody></table></div>`;
}
let stockForm = null;   // {plasmidId, tubeId|null}
const STOCK_KINDS = ["miniprep","midiprep","maxiprep","glycerol stock","gBlock / synthetic","PCR product","gDNA","other"];
function addStock(pid, tid){ stockForm = { plasmidId:pid, tubeId: tid || null }; render(); }
function editStock(pid, tid){ addStock(pid, tid); }
function stockFormOverlay(){
  if(!stockForm) return "";
  const p = state.plasmids.find(x => x.id === stockForm.plasmidId);
  if(!p) return "";
  const t = stockForm.tubeId ? (p.stock || []).find(x => x.id === stockForm.tubeId) : null;
  const v = t || { label:"", kind:"miniprep", conc:"", vol:"", loc:"", date:today(), notes:"" };
  return `<div class="modalbg" onclick="if(event.target===this){stockForm=null;render()}">
    <div class="modal" style="max-width:560px">
      <div class="lblrow"><h2 style="margin:0">${t ? "Edit tube" : "Add a tube"} &mdash; ${esc(p.name)}</h2>
        <button class="ghost" onclick="stockForm=null;render()">Close</button></div>
      <p class="muted small" style="margin:8px 0 14px">Every field is optional. Fill in what you know now and come
        back to the rest &mdash; a tube with only a location still beats a tube nobody logged.</p>
      <div class="row">
        <div><label>Label</label><input id="sf-label" value="${esc(v.label||"")}" placeholder="clone 3"></div>
        <div><label>Type</label><select id="sf-kind">
          ${STOCK_KINDS.map(k => `<option ${v.kind===k?"selected":""}>${k}</option>`).join("")}
        </select></div>
      </div>
      <div class="row">
        <div><label>Conc. (ng/µL)</label><input id="sf-conc" type="number" step="any" value="${v.conc||""}" placeholder="214"></div>
        <div><label>Volume (µL)</label><input id="sf-vol" type="number" step="any" value="${v.vol||""}" placeholder="50"></div>
        <div><label>Date</label><input id="sf-date" type="date" value="${esc(v.date||today())}"></div>
      </div>
      <label>Location</label>
      <input id="sf-loc" value="${esc(v.loc||"")}" placeholder="-20 box A / A4">
      <div class="muted small" style="margin-top:4px">Anything before the first &ldquo;/&rdquo; is treated as the box,
        which is how the By location view groups things.</div>
      <label>Notes</label>
      <input id="sf-notes" value="${esc(v.notes||"")}" placeholder="seq-verified, low yield, …">
      <div style="margin-top:18px;display:flex;gap:8px;align-items:center">
        <button class="primary" onclick="saveStock()">${t ? "Save" : "Add tube"}</button>
        <button class="ghost" onclick="stockForm=null;render()">Cancel</button>
        ${t ? `<button class="ghost danger" style="margin-left:auto"
                onclick="var i='${t.id}',q='${p.id}';stockForm=null;delStock(q,i)">Delete tube</button>` : ""}
      </div>
    </div></div>`;
}
function saveStock(){
  if(!stockForm) return;
  const p = state.plasmids.find(x => x.id === stockForm.plasmidId); if(!p) return;
  const rec = {
    label: val("sf-label").trim(),
    kind: val("sf-kind") || "miniprep",
    conc: parseFloat(val("sf-conc")) || 0,
    vol: parseFloat(val("sf-vol")) || 0,
    loc: val("sf-loc").trim(),
    date: val("sf-date") || today(),
    notes: val("sf-notes").trim()
  };
  if(stockForm.tubeId){
    const t = p.stock.find(x => x.id === stockForm.tubeId);
    if(t) Object.assign(t, rec);
  } else p.stock.push(Object.assign({ id:uid() }, rec));
  p.inSilico = p.stock.length === 0;
  stockForm = null; save(); render(); toast("Tube saved");
}
function delStock(pid, tid){
  const p = state.plasmids.find(x => x.id === pid); if(!p) return;
  p.stock = p.stock.filter(t => t.id !== tid);
  p.inSilico = p.stock.length === 0; save(); render();
}
