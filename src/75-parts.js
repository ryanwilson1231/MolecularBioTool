/* ===================== VIEW: part library ===================== */
const PART_KINDS = ["promoter","cds","tag","linker","marker","origin","terminator","element","custom"];
let partState = { filter:"", kind:"" };
let asm = { backboneId:null, items:[], cut:null, routes:null, pick:0, name:"", mode:"assemble" };
function designModeTabs(){
  return `<div class="toggle" style="margin:0 0 14px">
    <button class="${asm.mode!=="mutate"?"on":""}" onclick="asm.mode='assemble';render()">Build from parts</button>
    <button class="${asm.mode==="mutate"?"on":""}" onclick="asm.mode='mutate';render()">Point mutation</button>
  </div>`;
}

function viewParts(){
  const q = partState.filter.toLowerCase();
  const parts = state.parts.filter(p =>
    (!partState.kind || p.kind === partState.kind) &&
    (!q || p.name.toLowerCase().includes(q) || (p.tags||[]).join(" ").toLowerCase().includes(q)));
  const byKind = {};
  parts.forEach(p => (byKind[p.kind] = byKind[p.kind] || []).push(p));
  return `<h1 class="page">Parts</h1>
  <p class="lede">Parts remember which construct they came from &mdash; that is how Design knows whether it can
  PCR one or has to order it.</p>
  <div class="panel">
    <div class="lblrow">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <input id="partq" style="max-width:220px" placeholder="filter…" value="${esc(partState.filter)}"
          oninput="partState.filter=this.value;render();refocus('partq')">
        <select style="max-width:150px" onchange="partState.kind=this.value;render()">
          <option value="">all kinds</option>
          ${PART_KINDS.map(k => `<option value="${k}" ${partState.kind===k?"selected":""}>${k}</option>`).join("")}
        </select>
      </div>
      <div><button class="ghost" onclick="harvestParts()">Harvest from constructs</button>
        <button class="primary" onclick="addPartManual()">＋ New part</button></div>
    </div>
    ${state.parts.length ? "" : `<div class="note info" style="margin-top:10px">Empty. <b>Harvest from constructs</b>
      turns every label you have already drawn on a map into a reusable part &mdash; the fastest way to fill this.</div>`}
  </div>
  ${featureLibraryPanel()}
  ${Object.keys(byKind).sort().map(k => `<div class="panel">
    <h2>${k} <span class="muted small">${byKind[k].length}</span></h2>
    <div class="scrollx"><table>
      <thead><tr><th>Part</th><th>Length</th><th>Source</th><th>Availability</th><th></th></tr></thead>
      <tbody>${byKind[k].map(p => {
        const s = sourceOf(p);
        const pill = s.how === "pcr" ? `<span class="pill green">${esc(s.label)}</span>`
                   : s.how === "blocked" ? `<span class="pill amber">${esc(s.label)}</span>`
                   : `<span class="pill grey">${esc(s.label)}</span>`;
        return `<tr>
          <td><b>${esc(p.name)}</b>${p.note?`<div class="muted small">${esc(p.note)}</div>`:""}</td>
          <td>${bp(p.seq.length)}</td>
          <td class="muted">${esc(sourceName(p))}</td>
          <td>${pill}</td>
          <td style="text-align:right;white-space:nowrap">
            <button class="ghost" onclick="asmAdd('${p.id}')">Use →</button>
            <button class="ghost" onclick="copyText(${jsq(p.seq)},'Part')">copy</button>
            <button class="comp-x" onclick="delPart('${p.id}')">✕</button></td></tr>`;
      }).join("")}</tbody></table></div>
  </div>`).join("") || (state.parts.length ? `<div class="panel"><div class="empty">Nothing matches that filter.</div></div>` : "")}`;
}
function sourceName(p){
  const s = p.sourceId ? state.plasmids.find(x => x.id === p.sourceId) : null;
  return s ? s.name + (p.sourceSpan ? " " + (p.sourceSpan[0]+1) + "–" + (p.sourceSpan[1]+1) : "") : "pasted";
}
/* Order matters here: "T7 terminator" must not be caught by the T7 promoter rule,
   so the specific words are tested before the promoter-family shorthands. */
function guessKind(label){
  const l = label.toLowerCase();
  if(/terminat|poly ?a signal|polya|bgh pa|sv40 pa/.test(l)) return "terminator";
  if(/promoter|enhancer/.test(l)) return "promoter";
  if(/\btag\b|his|flag|\bha\b|\bmyc\b|strep|\bgst\b|\bmbp\b|sumo|tev|prescission|3c site/.test(l)) return "tag";
  if(/ampr|kanr|neor|\bcmr\b|puro|blastic|hygro|resistance|marker|\bbla\b|lacz/.test(l)) return "marker";
  if(/\bori\b|origin/.test(l)) return "origin";
  if(/\borf\b|\bcds\b|gfp|cherry|cas9|luciferase|\brfp\b|\byfp\b|polymerase|repressor/.test(l)) return "cds";
  if(/linker|spacer|gsgs/.test(l)) return "linker";
  if(/\brbs\b|kozak|ires|wpre|loxp|\bfrt\b|att[bplr]|operator|\b2a\b/.test(l)) return "element";
  if(/\bt7\b|\bt3\b|\bsp6\b|\bu6\b|\bcmv\b|ef1|pgk|\bh1\b/.test(l)) return "promoter";
  return "element";
}
function harvestParts(){
  let n = 0, skipped = 0;
  state.plasmids.forEach(p => {
    if(p.type !== "dna") return;
    const s = seqOf(p);
    (p.ann || []).forEach(a => {
      const seq = s.slice(a.start, a.end + 1);
      if(seq.length < 12){ skipped++; return; }
      if(/^(sgRNA|insert)\b/i.test(a.label)) return;
      if(state.parts.some(x => x.seq === seq)) { skipped++; return; }
      state.parts.push({ id:uid(), name:a.label, kind:guessKind(a.label), seq,
        sourceId:p.id, sourceSpan:[a.start, a.end], tags:p.tags.slice(), note:"" });
      n++;
    });
  });
  save(); render();
  toast(n + " part" + (n===1?"":"s") + " harvested" + (skipped ? ", " + skipped + " already known or too short" : ""));
}
function addPartManual(){
  const name = prompt("Part name"); if(!name) return;
  const seq = cleanDNA(prompt("Sequence") || "");
  if(!seq){ alert("No valid DNA."); return; }
  const kind = prompt("Kind (" + PART_KINDS.join(" / ") + ")", guessKind(name)) || "custom";
  state.parts.push({ id:uid(), name, kind: PART_KINDS.includes(kind) ? kind : "custom", seq,
                     sourceId:null, sourceSpan:null, tags:[], note:"" });
  save(); render();
}
function delPart(id){ state.parts = state.parts.filter(p => p.id !== id); save(); render(); }
/* called from the map's selection menu */
function savePartFromSelection(){
  const p = curP(); if(!p || sel.start === null || sel.end === null) return;
  const name = prompt("Part name", "part " + (sel.start+1) + "-" + (sel.end+1));
  if(!name) return;
  state.parts.push({ id:uid(), name, kind:guessKind(name), seq: seqOf(p).slice(sel.start, sel.end + 1),
                     sourceId:p.id, sourceSpan:[sel.start, sel.end], tags:p.tags.slice(), note:"" });
  showMenu = false; save(); render(); toast("Saved to Parts");
}

/* ===================== VIEW: assemble ===================== */
function asmAdd(partId){
  const p = state.parts.find(x => x.id === partId); if(!p) return;
  asm.items.push({ partId:p.id, name:p.name, kind:p.kind, seq:p.seq, sourceId:p.sourceId });
  asm.routes = null; go("design");
}
function asmRemove(i){ asm.items.splice(i,1); asm.routes = null; render(); }
function asmMove(i, d){
  const j = i + d; if(j < 0 || j >= asm.items.length) return;
  const t = asm.items[i]; asm.items[i] = asm.items[j]; asm.items[j] = t;
  asm.routes = null; render();
}
function asmPaste(){
  const name = prompt("Name for this fragment", "fragment " + (asm.items.length+1)); if(!name) return;
  const seq = cleanDNA(prompt("Sequence") || ""); if(!seq){ alert("No valid DNA."); return; }
  asm.items.push({ partId:null, name, kind:"custom", seq, sourceId:null });
  asm.routes = null; render();
}
function viewDesign(){
  const vectors = state.plasmids.filter(p => p.type === "dna" && p.topology === "circular");
  const vec = state.plasmids.find(p => p.id === asm.backboneId);
  const total = asm.items.reduce((s,i) => s + i.seq.length, 0);
  const libByKind = {};
  state.parts.forEach(p => (libByKind[p.kind] = libByKind[p.kind] || []).push(p));
  if(asm.mode === "mutate") return `<h1 class="page">Design a construct</h1>
    ${designModeTabs()}
    ${viewMutate()}`;
  return `<h1 class="page">Design a construct</h1>
  ${designModeTabs()}
  <p class="lede">List what the finished construct should contain, in order. Routes are priced against what is
  on your shelf.</p>

  <div class="grid2">
    <div class="panel">
      <h2>1 &middot; Backbone</h2>
      <select onchange="asm.backboneId=this.value;asm.routes=null;render()">
        <option value="">— choose a circular construct —</option>
        ${vectors.map(p => `<option value="${p.id}" ${asm.backboneId===p.id?"selected":""}>${esc(p.name)} (${bp(seqOf(p).length)})${p.stock.length?"":" · no stock"}</option>`).join("")}
      </select>
      ${vec ? (vec.stock.length
        ? `<div class="note ok" style="margin-top:8px">${stockTotal(vec).toFixed(1)} µg on hand${vec.stock[0].loc?` in ${esc(vec.stock[0].loc)}`:""}.</div>`
        : `<div class="note" style="margin-top:8px">${esc(vec.name)} has no physical stock — every route below will
            need you to make or order the backbone first.</div>`) : ""}
      ${vec ? `<label>Linearise at</label>
        <select onchange="asm.cut=this.value||null;asm.routes=null;render()">
          <option value="">choose automatically</option>
          ${Object.keys(uniqueCutters(seqOf(vec), true)).sort().map(n =>
            `<option value="${n}" ${asm.cut===n?"selected":""}>${n}${ownsEnzyme(n)?"":" · not on your shelf"}</option>`).join("")}
        </select>` : ""}
    </div>
    <div class="panel">
      <h2>2 &middot; Contents, in order</h2>
      ${asm.items.length ? `<div style="display:flex;flex-direction:column;gap:6px">
        ${asm.items.map((it,i) => {
          const s = sourceOf(it);
          return `<div class="comp" style="cursor:default;background:var(--panel2);border:1px solid var(--line)">
            <span class="comp-sw" style="background:${CAT_COLOR[it.kind]||PALETTE[i%PALETTE.length]}"></span>
            <span class="comp-nm"><b>${esc(it.name)}</b> <span class="muted">${bp(it.seq.length)}</span>
              <span class="pill ${s.how==="pcr"?"green":s.how==="blocked"?"amber":"grey"}">${esc(s.label)}</span></span>
            <button class="ghost" onclick="asmMove(${i},-1)" title="up">↑</button>
            <button class="ghost" onclick="asmMove(${i},1)" title="down">↓</button>
            <button class="comp-x" onclick="asmRemove(${i})">✕</button></div>`;
        }).join("")}</div>
        <div class="muted small" style="margin-top:8px">${asm.items.length} fragments · ${bp(total)} of insert ·
          finished construct ≈ ${vec ? bp(seqOf(vec).length + total) : "—"}</div>`
        : `<div class="empty" style="padding:20px"><div class="big">🧩</div>Nothing added yet.</div>`}
      <div style="margin-top:10px">
        <select onchange="if(this.value){asmAdd(this.value);this.value=''}" style="max-width:230px">
          <option value="">＋ add a part from the library…</option>
          ${Object.keys(libByKind).sort().map(k => `<optgroup label="${k}">${libByKind[k].map(p =>
            `<option value="${p.id}">${esc(p.name)} (${bp(p.seq.length)})</option>`).join("")}</optgroup>`).join("")}
        </select>
        <button class="ghost" onclick="asmPaste()">＋ paste a fragment</button>
        ${state.parts.length ? "" : `<button class="ghost" onclick="harvestParts()">harvest parts first</button>`}
      </div>
    </div>
  </div>
  ${vec && asm.items.length ? `<div class="panel">
    <button class="primary" onclick="asmRun()">Find routes</button>
    <span class="muted small" style="margin-left:10px">
      ${tracksEnzymes() ? "ranked against the " + ownedEnzymes().length + " enzymes on your shelf"
                        : "tick your enzymes in Inventory to rank these by what you own"}</span>
  </div>` : ""}
  ${asm.routes ? asmResults() : ""}`;
}
function asmRun(){
  const vec = state.plasmids.find(p => p.id === asm.backboneId);
  if(!vec || !asm.items.length) return;
  asm.routes = planRoutes(vec, asm.items, asm.cut);
  asm.pick = 0;
  render();
}
function asmResults(){
  const rs = asm.routes;
  if(!rs.length) return `<div class="panel"><div class="note warn">No route found.</div></div>`;
  const r = rs[asm.pick] || rs[0];
  return `<div class="panel">
    <h2>Routes</h2>
    <div class="grid3">${rs.map((x,i) => `
      <div class="sidecard" style="cursor:pointer;border-color:${x===r?"var(--accent)":"var(--line)"}"
           onclick="asm.pick=${i};render()">
        <div class="lblrow"><b>${esc(x.title)}</b>
          ${x.blocked ? '<span class="pill red">blocked</span>'
            : x.warnings.length ? `<span class="pill amber">${x.warnings.length} warning${x.warnings.length>1?"s":""}</span>`
            : '<span class="pill green">clear</span>'}</div>
        <div class="muted small" style="margin-top:6px">${esc(x.why)}</div>
        <div style="margin-top:9px;display:flex;gap:14px;flex-wrap:wrap">
          <span class="stat">≈ <b>${moneyStr(x.cost.money)}</b></span>
          <span class="stat">≈ <b>${x.cost.days}</b> days</span>
        </div>
      </div>`).join("")}</div>
    <div class="muted small" style="margin-top:10px">Costs use the rates in Tools and are indicative only —
      they exist to make the routes comparable, not to quote a budget.</div>
  </div>
  ${asmRouteDetail(r)}`;
}
function asmRouteDetail(r){
  const P = r.plan;
  const modePill = m => m === "pcr" ? '<span class="pill green">PCR</span>'
    : m === "digest" ? '<span class="pill blue">digest</span>'
    : '<span class="pill grey">order</span>';
  const pieceRows = P.units.map(u => `<tr>
      <td><b>${esc(u.label)}</b>${u.rider?' <span class="pill amber">in a primer tail</span>':""}</td>
      <td>${bp(u.len)}</td>
      <td>${u.rider ? '<span class="pill amber">carried</span>' : modePill(u.mode)}</td>
      <td class="muted">${esc(u.rider ? "rides on " + u.hostLabel
        : u.why ? u.why : u.src ? u.src.label : u.isBackbone ? "the backbone" : "")}</td></tr>`).join("");
  const orderBlock = P.orders.length ? `<h3 style="margin-top:16px">Order these ${P.orders.length === 1 ? "sequence" : "sequences"}</h3>
    ${P.orders.map(o => `<div class="sidecard" style="margin-bottom:10px">
      <div class="lblrow"><b>${esc(o.label)}</b><span class="muted small">${bp(o.orderSeq.length)} as ordered · ${bp(o.len)} of payload</span></div>
      ${o.why ? `<div class="muted small" style="margin-top:4px">${esc(o.why)}</div>` : ""}
      ${o.report.flags.map(f => `<div class="${f.lvl==="ok"?"note ok":"note"}" style="margin-top:6px">${esc(f.t)}</div>`).join("")}
      <div class="seqbox" style="margin-top:8px;max-height:130px">${o.orderSeq.match(/.{1,60}/g).join("\n")}</div>
      <div style="margin-top:8px"><button class="ghost" onclick="copyText(${jsq(o.orderSeq)},'Order sequence')">Copy</button>
        <button class="ghost" onclick="downloadFasta(${jsq(o.label)},${jsq(o.orderSeq)})">FASTA</button></div>
    </div>`).join("")}
    <div class="muted small">${P.method === "goldengate"
      ? "Each ordered fragment already carries its " + P.iis + " sites and junction overhangs."
      : P.method === "restriction" ? "The ordered fragment already carries both restriction sites and a TTT spacer."
      : "Each ordered fragment already carries " + P.arm + " bp of homology to its neighbours, so it needs no PCR at all."}</div>` : "";
  const primerRows = P.primers.map(x => [x.f, x.r].map(pr => `<tr>
      <td><b>${esc(pr.name)}</b></td>
      <td class="mono" style="word-break:break-all;max-width:340px"><span class="muted">${pr.tail}</span>${pr.anneal}</td>
      <td>${pr.len}</td><td>${pr.tm} °C</td>
      <td>${pr.reuse ? `<span class="pill green">have it: ${esc(pr.reuse.name)}</span>`
                     : `<button class="ghost" onclick="addOligo(${jsq(pr.full)},${jsq(pr.name)})">log as ordered</button>`}</td>
      <td><button class="ghost" onclick="copyText('${pr.full}','Primer')">copy</button></td></tr>
      ${pr.warn.length ? `<tr><td></td><td colspan="5" class="muted small">⚠ ${pr.warn.join("; ")}</td></tr>` : ""}`).join("")).join("");
  const oh = P.overhangs ? `<h3 style="margin-top:16px">Junction overhangs</h3>
    <div class="scrollx"><table><thead><tr><th>Junction</th><th>Overhang</th><th>Boundary moved</th></tr></thead><tbody>
      ${P.overhangs.map((o,i) => `<tr><td>${i === 0 ? "backbone → " + (r.pieces[1]?esc(r.pieces[1].name):"insert")
          : (r.pieces[i]?esc(r.pieces[i].name):"piece "+i) + " → " + (r.pieces[i+1]?esc(r.pieces[i+1].name):"backbone")}</td>
        <td class="mono"><b>${o.seq}</b>${o.bad?' <span class="pill red">clashes</span>':""}</td>
        <td class="muted">${o.shift ? (o.shift > 0 ? "+" : "") + o.shift + " bp" : "—"}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="muted small" style="margin-top:6px">Overhangs are taken straight from the finished sequence, so the
      assembly is scarless. Where two junctions would have produced the same overhang, the boundary was slid a few
      bases — the product is identical either way.</div>` : "";
  const steps = asmProtocol(r);
  const missing = r.enzymesMissing.length
    ? `<div class="note warn">You do not have ${r.enzymesMissing.join(", ")} on the shelf. Buy it, or pick a
        different route.</div>` : "";
  return `<div class="panel">
    <div class="lblrow"><h2 style="margin:0">${esc(r.title)}</h2>
      <div><span class="muted small">≈ ${moneyStr(r.cost.money)} · ≈ ${r.cost.days} days</span></div></div>
    ${r.warnings.length ? `<div class="note warn">${r.warnings.map(esc).join("<br>")}</div>` : ""}
    ${r.notes && r.notes.length ? `<div class="note info">${r.notes.map(esc).join("<br>")}</div>` : ""}
    ${missing}
    <div class="muted small" style="margin:8px 0">${r.cost.detail.join(" · ")}</div>
    <h3 style="margin-top:14px">How each stretch gets made</h3>
    <div class="scrollx"><table><thead><tr><th>Unit</th><th>Size</th><th>Route</th><th>Detail</th></tr></thead>
      <tbody>${pieceRows}</tbody></table></div>
    ${orderBlock}
    ${P.primers.length ? `<h3 style="margin-top:16px">Primers
      <span class="muted small">${r.newPrimers} to order, ${r.primerCount - r.newPrimers} already in the freezer</span></h3>
      <div class="scrollx"><table><thead><tr><th>Primer</th><th>Sequence (5'→3')</th><th>Len</th><th>Tm</th><th>Stock</th><th></th></tr></thead>
        <tbody>${primerRows}</tbody></table></div>
      <div class="muted small" style="margin-top:6px">Grey is the 5' tail —
        ${P.method === "goldengate" ? "spacer plus " + P.iis + " site plus the junction overhang"
          : P.method === "restriction" ? "TTT spacer plus the restriction site, so the enzyme has room to bind the end of the product"
          : P.arm + " bp of homology to the neighbouring piece"}.
        Set the annealing temperature from the Tm column, which is the annealing portion only.</div>` : ""}
    ${oh}
    <h3 style="margin-top:16px">Protocol</h3>
    ${protocolList(steps)}
    <h3 style="margin-top:16px">Predicted construct — ${bp(P.product.length)}</h3>
    <div class="muted small" style="margin-bottom:6px">GC ${gcPct(P.product).toFixed(1)}% ·
      ${P.ann.length} components carried across</div>
    <div class="seqbox">${P.product.match(/.{1,60}/g).slice(0,5).join("\n")}${P.product.length > 300 ? "\n… " + (P.product.length - 300) + " more bp" : ""}</div>
    <div style="margin-top:12px">
      <button class="primary" onclick="asmSave()">Save as a construct</button>
      <button class="ghost" style="margin-left:8px" onclick="copyText(${jsq(P.product)},'Product')">Copy sequence</button>
      <button class="ghost" style="margin-left:8px" onclick="asmConsume()">Log what this used</button>
    </div>
  </div>`;
}
function asmProtocol(r){
  const P = r.plan, steps = [];
  if(r.key === "restriction"){
    const vec = state.plasmids.find(x => x.id === asm.backboneId) || r.backbonePlasmid;
    return restrictionProtocol({ vec, ins:r.sourced[0].seq, insName:r.sourced[0].name },
                               P.pair, !P.ready, P.built);
  }
  const pcrs = r.pieces.filter(p => (p.source||{}).how === "pcr");
  if(r.cut && (r.pieces[0].source||{}).how === "digest")
    steps.push("Digest 1 µg of " + r.pieces[0].name.replace("backbone", (state.plasmids.find(x=>x.id===asm.backboneId)||{}).name || "the backbone")
      + " with " + r.cut + " (single site), then gel-purify the " + bp(r.pieces[0].seq.length) + " band.");
  if(P.primers.length)
    steps.push("Amplify " + P.primers.length + " piece" + (P.primers.length>1?"s":"") +
      " with the tailed primers above, high-fidelity polymerase. DpnI-treat and column-purify each product.");
  if(r.orders.length)
    steps.push("Order " + r.orders.map(o => o.name + " (" + bp(o.seq.length) + ")").join(", ") + " as synthetic fragment" +
      (r.orders.length>1?"s":"") + "; resuspend to 10 ng/µL on arrival.");
  if(P.method === "goldengate"){
    steps.push("Set up 20 µL: 2 µL 10× T4 ligase buffer, 1 µL " + P.iis + ", 1 µL T4 DNA ligase, ~75 ng of each piece, water to 20 µL.");
    steps.push("Cycle 30× (37 °C 1 min, 16 °C 1 min), then 60 °C 5 min, then 80 °C 10 min.");
  } else {
    steps.push("Assemble 50-100 ng of backbone with a 2-3× molar excess of each insert in 20 µL of 2× HiFi master mix.");
    steps.push("50 °C for " + (r.pieces.length > 3 ? "60" : "15") + " min — " + (r.pieces.length-1) +
      " fragment" + (r.pieces.length-1===1?"":"s") + " into the backbone.");
  }
  steps.push("Transform 2 µL into chemically competent cells" +
    (state.reagents.cells.length ? " (" + state.reagents.cells[0].strain + ", " +
      (state.reagents.cells[0].vials != null ? state.reagents.cells[0].vials + " vials left" : "in stock") + ")" : "") +
    "; plate on the backbone's selection.");
  const screen = pickScreeningDigest(P.product);
  if(screen && ownsEnzyme(screen.names[0]))
    steps.push("Screen by " + screen.names.join(" + ") + " digest — a correct clone gives " +
      screen.sizes.map(bp).join(" + ") + ".");
  steps.push("Sequence across every junction. " + (P.overhangs ? "Golden Gate junctions are scarless, so the read should match the design exactly."
    : "Overlap regions are where assembly errors show up first."));
  return steps;
}
function asmSave(){
  const r = asm.routes[asm.pick], P = r.plan;
  const vec = state.plasmids.find(p => p.id === asm.backboneId);
  const suggested = asm.name || (vec.name + "-" + asm.items.map(i => i.name.replace(/\s+/g,"")).join("-")).slice(0,48);
  const name = prompt("Name for the new construct", suggested);
  if(!name) return;
  const np = { id:uid(), name, type:"dna", topology:"circular", uniprot:"", seq:P.product, ann:P.ann, stock:[],
    inSilico:true, tags:["designed"], created:today(),
    source: r.title + " in BetterBench",
    parents: [{ id:vec.id, name:vec.name, role:"backbone" }].concat(
      asm.items.map(i => ({ id:i.sourceId || null, name:i.name, role:"part" }))) };
  state.plasmids.push(np);
  state.builds.push({ id:uid(), date:today(), productId:np.id, vector:vec.name,
    insert:asm.items.map(i => i.name).join(" + "), route:r.key, cost:r.cost.money, days:r.cost.days });
  save(); openPlasmid(np.id);
  toast("Saved — in silico until you log a tube");
}
function asmConsume(){
  const r = asm.routes[asm.pick];
  const used = consumeForRoute(r);
  if(!used.length){ toast("Nothing tracked to decrement"); return; }
  const lines = used.map(u => u.kind === "enzyme" ? "10 U of " + u.name : "1 µL of " + u.name).join("\n");
  if(!confirm("Take this off the shelf?\n\n" + lines)) return;
  const n = applyConsumption(used);
  render(); toast(n + " record" + (n===1?"":"s") + " updated");
}

function downloadFasta(name, seq){
  const safe = String(name).replace(/[^A-Za-z0-9_.-]/g, "_");
  download(safe + ".fasta", ">" + name + "\n" + (seq.match(/.{1,70}/g) || []).join("\n") + "\n");
}
