/* ===================== VIEW: inventory (constructs + reagents) ===================== */
let invFilter = "", invTab = "constructs";

function viewInventory(){
  const totalTubes = state.plasmids.reduce((s,p) => s + p.stock.length, 0);
  const notMade = state.plasmids.filter(p => !p.stock.length && p.type === "dna").length;
  const tabs = [["constructs","Constructs"],["enzymes","Enzymes"],["oligos","Oligos & primers"],
                ["cells","Competent cells"],["locations","By location"],["share","Share"]]
    .map(([k,l]) => `<button class="${invTab===k?"on":""}" onclick="invTab='${k}';render()">${l}</button>`).join("");
  let body = "";
  if(invTab === "constructs")      body = invConstructs();
  else if(invTab === "enzymes")    body = invEnzymes();
  else if(invTab === "oligos")     body = invOligos();
  else if(invTab === "cells")      body = invCells();
  else if(invTab === "locations")  body = invLocations();
  else                             body = invShare();
  return `<div class="lblrow" style="align-items:baseline">
    <h1 class="page">Inventory</h1>
    <div class="muted small">${totalTubes} tube${totalTubes===1?"":"s"}${notMade ? ` · <span class="pill amber">${notMade} not made yet</span>` : ""}</div>
  </div>
  <div class="toggle" style="margin-bottom:14px">${tabs}</div>
  ${body}`;
}

/* ---- constructs ---- */
function invConstructs(){
  const q = invFilter.toLowerCase();
  const rows = state.plasmids.filter(p => !q || p.name.toLowerCase().includes(q) ||
      p.tags.join(" ").toLowerCase().includes(q) || (p.stock||[]).some(t => (t.loc||"").toLowerCase().includes(q)));
  const withStock = rows.filter(p => p.stock.length);
  const inSilico = rows.filter(p => !p.stock.length && p.type === "dna");
  return `<div class="panel">
    <div class="lblrow"><h2 style="margin:0">Plasmid tubes</h2>
      <input id="invq" style="max-width:260px" placeholder="filter by name, tag or location…" value="${esc(invFilter)}"
        oninput="invFilter=this.value;render();refocus('invq')"></div>
    ${withStock.length ? withStock.map(p => `
      <div style="margin-top:14px">
        <div class="lblrow"><div><b>${esc(p.name)}</b>
          <span class="muted small"> · ${seqOf(p).length} bp · ${stockTotal(p).toFixed(1)} µg total</span></div>
          <div><button class="ghost" onclick="openPlasmid('${p.id}')">Open</button>
            <button class="ghost" onclick="addStock('${p.id}')">＋ Tube</button></div></div>
        ${stockTable(p)}
      </div>`).join("") : `<div class="empty"><div class="big">🧊</div>No tubes recorded yet.</div>`}
  </div>
  ${inSilico.length ? `<div class="panel">
    <h2>Designed but not made <span class="pill amber">${inSilico.length}</span></h2>
    <p class="muted" style="margin:0 0 8px">These exist only as sequence. Every one of them is a construct the
      planner will refuse to use as a PCR template until it is real.</p>
    <div class="scrollx"><table><thead><tr><th>Construct</th><th>Size</th><th>Made from</th><th></th></tr></thead><tbody>
      ${inSilico.map(p => `<tr><td><b>${esc(p.name)}</b></td><td>${bp(seqOf(p).length)}</td>
        <td class="muted">${(p.parents||[]).map(x => esc(x.name)).join(" + ") || esc(p.source || "—")}</td>
        <td style="text-align:right"><button class="primary" onclick="openMake('${p.id}')">🔨 Make this</button>
          <button class="ghost" onclick="addStock('${p.id}')">Log a tube</button></td></tr>`).join("")}
    </tbody></table></div></div>` : ""}`;
}

/* ---- enzymes ---- */
function invEnzymes(){
  const owned = state.reagents.enzymes;
  const names = Object.keys(ENZ).sort();
  const tracking = tracksEnzymes();
  const grid = names.map(n => {
    const has = !!owned[n], e = owned[n] || {};
    return `<label class="plain enzcell ${has?"has":""}" style="text-transform:none">
      <input type="checkbox" style="width:auto" ${has?"checked":""} onchange="toggleEnzyme('${n}',this.checked)">
      <span class="enznm">${n}</span>
      <span class="enzsite mono">${ENZ[n].s}</span>
      ${has && e.loc ? `<span class="muted small">${esc(e.loc)}</span>` : ""}
      ${has && typeof e.units === "number" ? `<span class="pill ${e.units < 200 ? "amber":"grey"}">${e.units} U</span>` : ""}
    </label>`;
  }).join("");
  return `<div class="panel">
    <div class="lblrow"><h2 style="margin:0">Restriction enzymes on the shelf</h2>
      <div><button class="ghost" onclick="presetEnzymes()">Tick the common set</button>
        <button class="ghost" onclick="clearEnzymes()">Clear all</button></div></div>
    ${tracking
      ? `<div class="note ok">Tracking ${ownedEnzymes().length} enzymes. Design now ranks routes by what
          you own, and tell you the price of the ones you would have to buy.</div>`
      : `<div class="note info">Nothing ticked yet, so cloning routes are ranked as if you own everything.
          Tick what is actually in the −20 &mdash; that single act is what makes the planner useful.</div>`}
    <div class="enzgrid" style="margin-top:14px">${grid}</div>
    ${tracking ? `<div style="margin-top:14px"><button class="ghost" onclick="editEnzymeDetail()">Add units / location to one</button></div>` : ""}
  </div>`;
}
function toggleEnzyme(n, on){
  if(on) state.reagents.enzymes[n] = stampReagent(state.reagents.enzymes[n] || { units:null, loc:"", exp:"", note:"" });
  else delete state.reagents.enzymes[n];
  save(); render();
}
function presetEnzymes(){
  COMMON_ENZYME_SET.forEach(n => { if(ENZ[n]) state.reagents.enzymes[n] = stampReagent(state.reagents.enzymes[n] || { units:null, loc:"", exp:"", note:"" }); });
  save(); render(); toast("Ticked " + COMMON_ENZYME_SET.length + " common enzymes");
}
function clearEnzymes(){ if(!confirm("Untick every enzyme?")) return; state.reagents.enzymes = {}; save(); render(); }
function editEnzymeDetail(){
  const n = prompt("Which enzyme?", ownedEnzymes()[0] || "EcoRI");
  if(!n || !state.reagents.enzymes[n]){ if(n) alert(n + " is not ticked."); return; }
  const e = state.reagents.enzymes[n];
  const u = prompt("Units remaining (blank if you don't count)", e.units == null ? "" : e.units);
  if(u !== null) e.units = u === "" ? null : (parseFloat(u) || 0);
  const l = prompt("Location", e.loc || "-20 enzyme box");
  if(l !== null) e.loc = l;
  stampReagent(e); save(); render();
}

/* ---- oligos ---- */
function invOligos(){
  const os = state.reagents.oligos;
  return `<div class="panel">
    <div class="lblrow"><h2 style="margin:0">Oligos &amp; primers</h2>
      <button class="primary" onclick="addOligo()">＋ Add oligo</button></div>
    <p class="muted" style="margin:0 0 8px">Primers Design writes are checked against this list first.</p>
    ${os.length ? `<div class="scrollx"><table>
      <thead><tr><th>Name</th><th>Sequence</th><th>Len</th><th>Tm</th><th>Conc</th><th>Vol</th><th>Location</th><th>Added by</th><th></th></tr></thead>
      <tbody>${os.map(o => {
        const s = cleanDNA(o.seq);
        return `<tr><td><b>${esc(o.name)}</b>${o.note?`<div class="muted small">${esc(o.note)}</div>`:""}</td>
          <td class="mono" style="word-break:break-all;max-width:280px">${s}</td>
          <td>${s.length}</td><td>${s.length>1?tmNN(s)+" °C":"—"}</td>
          <td>${o.conc?o.conc+" µM":"—"}</td>
          <td>${o.vol!=null?`${o.vol} µL${o.vol<10?' <span class="pill amber">low</span>':""}`:"—"}</td>
          <td class="mono">${esc(o.loc||"—")}</td>
          <td class="muted small">${esc(o.owner||"—")}</td>
          <td><button class="comp-x" onclick="delOligo('${o.id}')">✕</button></td></tr>`;
      }).join("")}</tbody></table></div>`
      : `<div class="empty"><div class="big">🧬</div>No oligos logged.</div>`}
  </div>`;
}
function addOligo(seqPrefill, namePrefill){
  const name = prompt("Oligo name", namePrefill || ("oligo_" + (state.reagents.oligos.length + 1)));
  if(name === null) return;
  const seq = cleanDNA(prompt("Sequence (5'→3')", seqPrefill || "") || "");
  if(!seq){ alert("No valid DNA sequence."); return; }
  const conc = parseFloat(prompt("Concentration (µM)", "100") || "") || null;
  const vol = parseFloat(prompt("Volume (µL)", "200") || "") || null;
  const loc = prompt("Location", "-20 primer box") || "";
  state.reagents.oligos.push(stampReagent({ id:uid(), name, seq, conc, vol, loc, date:today(), note:"" }));
  save(); render(); toast("Oligo saved");
}
function delOligo(id){ state.reagents.oligos = state.reagents.oligos.filter(o => o.id !== id); save(); render(); }

/* ---- competent cells ---- */
function invCells(){
  const cs = state.reagents.cells;
  return `<div class="panel">
    <div class="lblrow"><h2 style="margin:0">Competent cells</h2>
      <button class="primary" onclick="addCells()">＋ Add batch</button></div>
    ${cs.length ? `<div class="scrollx"><table>
      <thead><tr><th>Strain</th><th>Efficiency</th><th>Vials</th><th>Location</th><th>Made</th><th></th></tr></thead>
      <tbody>${cs.map(c => `<tr><td><b>${esc(c.strain)}</b>${c.note?`<div class="muted small">${esc(c.note)}</div>`:""}</td>
        <td>${c.eff ? Number(c.eff).toExponential(1) + " cfu/µg" : "—"}</td>
        <td>${c.vials != null ? `${c.vials}${c.vials<5?' <span class="pill amber">low</span>':""}` : "—"}</td>
        <td class="mono">${esc(c.loc||"—")}</td><td class="muted">${esc(c.date||"")}</td>
        <td><button class="comp-x" onclick="delCells('${c.id}')">✕</button></td></tr>`).join("")}
      </tbody></table></div>`
      : `<div class="empty"><div class="big">🦠</div>No batches logged. The Transformation efficiency calculator in
          Tools gives you the number to record here.</div>`}
  </div>`;
}
function addCells(){
  const strain = prompt("Strain", "DH5α"); if(strain === null) return;
  const eff = parseFloat(prompt("Efficiency (cfu/µg), blank if untitred", "") || "") || null;
  const vials = parseFloat(prompt("Vials remaining", "20") || "") || null;
  const loc = prompt("Location", "-80 rack 2") || "";
  state.reagents.cells.push(stampReagent({ id:uid(), strain, eff, vials, loc, date:today(), note:"" }));
  save(); render();
}
function delCells(id){ state.reagents.cells = state.reagents.cells.filter(c => c.id !== id); save(); render(); }

/* ---- everything, grouped by where it lives ---- */
function invLocations(){
  const boxes = {};
  const put = (loc, html) => { const k = (loc || "unfiled").split("/")[0].trim() || "unfiled";
    (boxes[k] = boxes[k] || []).push(html); };
  state.plasmids.forEach(p => p.stock.forEach(t =>
    put(t.loc, `<div class="comp" style="cursor:pointer" onclick="openPlasmid('${p.id}')">
      <span class="comp-sw" style="background:#cfe8ff"></span>
      <span class="comp-nm">${esc(p.name)} <span class="muted">${esc(t.label||"")}</span></span>
      <span class="comp-pos">${esc((t.loc||"").split("/").slice(1).join("/").trim())}</span></div>`)));
  Object.keys(state.reagents.enzymes).forEach(n => { const e = state.reagents.enzymes[n];
    if(e.loc) put(e.loc, `<div class="comp"><span class="comp-sw" style="background:#fff2b3"></span>
      <span class="comp-nm">${n}</span><span class="comp-pos">enzyme</span></div>`); });
  state.reagents.oligos.forEach(o => put(o.loc, `<div class="comp"><span class="comp-sw" style="background:#d6f5d6"></span>
    <span class="comp-nm">${esc(o.name)}</span><span class="comp-pos">oligo</span></div>`));
  state.reagents.cells.forEach(c => put(c.loc, `<div class="comp"><span class="comp-sw" style="background:#ffd9c2"></span>
    <span class="comp-nm">${esc(c.strain)}</span><span class="comp-pos">cells</span></div>`));
  const keys = Object.keys(boxes).sort();
  if(!keys.length) return `<div class="panel"><div class="empty"><div class="big">📍</div>Nothing has a location yet.</div></div>`;
  return `<div class="panel"><h2>Everything, by where it lives</h2>
    <div class="grid3">${keys.map(k => `<div class="sidecard">
      <h3>${esc(k)} <span class="muted small">${boxes[k].length}</span></h3>${boxes[k].join("")}</div>`).join("")}</div></div>`;
}

/* "Plan cloning" on a construct you have designed but not made: drop it into the
   Design tab as the thing to insert, and pick a backbone you actually have. */
function planFor(pid){
  const target = state.plasmids.find(x => x.id === pid); if(!target) return;
  asm.items = [{ partId:null, name:target.name, kind:"custom", seq:seqOf(target), sourceId:target.id }];
  asm.routes = null; asm.pick = 0;
  if(!asm.backboneId || asm.backboneId === pid){
    const v = state.plasmids.find(x => x.id !== pid && x.type === "dna"
                && x.topology === "circular" && x.stock.length);
    asm.backboneId = v ? v.id : null;
  }
  go("design");
}
