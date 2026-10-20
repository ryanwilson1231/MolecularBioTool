/* ===================== VIEW: primers ===================== */
let primerState = { mode:"analyse", templateId:null, paste:"", result:null, error:null,
                    fromId:null, fromStart:"", fromEnd:"", intoId:null, intoAt:"", arm:25, design:null };

function viewPrimers(){
  const dna = state.plasmids.filter(x => x.type === "dna");
  return `<h1 class="page">Primers</h1>
  <p class="lede">Paste a primer and it finds its own annealing region &mdash; no trimming the tail off by hand
  to work out where it binds.</p>
  <div class="toggle" style="margin-bottom:14px">
    <button class="${primerState.mode==="analyse"?"on":""}" onclick="primerState.mode='analyse';render()">Check primers</button>
    <button class="${primerState.mode==="design"?"on":""}" onclick="primerState.mode='design';render()">Design Gibson primers</button>
  </div>
  ${primerState.mode === "analyse" ? primerAnalyseView(dna) : primerDesignView(dna)}`;
}

/* ---------------- check ---------------- */
function primerAnalyseView(dna){
  const t = state.plasmids.find(x => x.id === primerState.templateId);
  return `<div class="panel">
    <div class="grid2">
      <div>
        <label>Template they amplify from</label>
        <select onchange="primerState.templateId=this.value;primerState.result=null;render()">
          <option value="">— choose —</option>
          ${dna.map(x => `<option value="${x.id}" ${primerState.templateId===x.id?"selected":""}>${esc(x.name)} (${bp(seqOf(x).length)})</option>`).join("")}
        </select>
        <div class="muted small" style="margin-top:6px">For a Gibson primer this is the thing you PCR,
          not the finished construct. The tail will not match it &mdash; that is the point.</div>
      </div>
      <div>
        <label>Primers</label>
        <textarea rows="5" placeholder="Paste one per line. &#10;Names optional: myPrimer, ACGT...&#10;FASTA works too."
          oninput="primerState.paste=this.value;primerState.result=null">${esc(primerState.paste)}</textarea>
      </div>
    </div>
    <div style="margin-top:12px">
      <button class="primary" onclick="runPrimerCheck()">Check them</button>
      <span class="muted small" style="margin-left:10px">Finds the annealing region, its Tm, and everywhere else it could bind.</span>
    </div>
    ${primerState.error ? `<div class="note warn" style="margin-top:12px">${esc(primerState.error)}</div>` : ""}
  </div>
  ${primerState.result ? primerResults(primerState.result) : ""}`;
}
function runPrimerCheck(){
  primerState.result = null; primerState.error = null;
  const t = state.plasmids.find(x => x.id === primerState.templateId);
  if(!t){ primerState.error = "Choose the template these primers amplify from."; render(); return; }
  const list = parsePrimerPaste(primerState.paste);
  if(!list.length){ primerState.error = "No primers found in that. One sequence per line."; render(); return; }
  primerState.result = analysePrimers(list, t, { polymerase: defaultPolymerase() });
  render();
}
function primerResults(res){
  const t = res.template, L = seqOf(t).length;
  const riskPill = r => r === "exact" ? '<span class="pill red">exact</span>'
    : r === "high" ? '<span class="pill red">high</span>'
    : r === "medium" ? '<span class="pill amber">medium</span>' : '<span class="pill grey">low</span>';

  const rows = res.rows.map((r, i) => {
    if(r.error) return `<div class="panel"><div class="lblrow"><h3 style="margin:0">${esc(r.name)}</h3>
      <span class="pill red">not placed</span></div>
      <div class="mono small" style="word-break:break-all;margin-top:6px">${r.seq}</div>
      <div class="note warn" style="margin-top:8px">${esc(r.error)}</div></div>`;
    const p = r.placed;
    const ts = r.tailSource;
    return `<div class="panel">
      <div class="lblrow">
        <h3 style="margin:0">${esc(r.name)}
          <span class="muted small">${p.strand === 1 ? "forward" : "reverse"} ·
            ${p.start + 1}–${p.end + 1}${p.wraps ? " (crosses the origin)" : ""}</span></h3>
        ${p.isGibson ? '<span class="pill blue">Gibson</span>' : '<span class="pill grey">plain primer</span>'}
      </div>
      <div class="primerline mono">${p.tail ? `<span class="ptail">${p.tail}</span>` : ""}<span class="panneal">${p.anneal}</span></div>
      <div class="primerkey">
        ${p.tail ? `<span><i class="sw ptail"></i>tail, ${p.tail.length} nt${
          ts ? " — homologous to " + esc(ts.plasmid.name) + " at " + (ts.at + 1) : " — matches nothing you have"}</span>` : ""}
        <span><i class="sw panneal"></i>anneals, ${p.anneal.length} nt</span>
      </div>
      <div style="margin-top:10px">
        <span class="stat">Annealing Tm <b>${p.annealTm} °C</b></span>
        <span class="stat">Whole primer <b>${p.fullTm} °C</b></span>
        <span class="stat">GC of anneal <b>${Math.round(p.annealGc)}%</b></span>
        <span class="stat">Length <b>${r.seq.length} nt</b></span>
      </div>
      <div class="muted small" style="margin-top:4px">The annealing Tm is the one that sets your annealing
        temperature. The whole-primer figure only applies once the tail is incorporated, from cycle 3 onward.</div>
      ${p.warn.length ? `<div class="note" style="margin-top:8px">⚠ ${p.warn.map(esc).join("; ")}</div>` : ""}
      ${r.off.length ? `<details class="fold" open><summary>Other places it could bind
          <span class="muted small">${r.off.length}</span></summary>
        <div class="scrollx"><table>
          <thead><tr><th>Position</th><th>Strand</th><th>Mismatches</th><th>3' run</th><th>Identity</th><th>Risk</th></tr></thead>
          <tbody>${r.off.slice(0, 12).map(s => `<tr>
            <td class="num">${s.start + 1}–${s.end + 1}</td>
            <td>${s.strand === 1 ? "+" : "−"}</td>
            <td class="num">${s.mismatches}</td>
            <td class="num">${s.terminal3} nt${s.tm3 ? " · " + s.tm3 + " °C" : ""}</td>
            <td class="num">${Math.round(s.identity * 100)}%</td>
            <td>${riskPill(s.risk)}</td></tr>`).join("")}
          </tbody></table></div>
        <div class="muted small" style="margin-top:6px">A primer extends from its 3' end, so the
          <b>3' run</b> column matters more than the mismatch count — a long perfect run will prime even with a
          badly mismatched 5' end.</div>
      </details>`
        : `<div class="note ok" style="margin-top:10px">Binds in one place only.</div>`}
    </div>`;
  }).join("");

  const amp = res.amplicons;
  return `${rows}
  ${amp.length ? `<div class="panel">
    <h2>Products these primers would make</h2>
    <div class="scrollx"><table>
      <thead><tr><th>Size</th><th>Span</th><th>From</th><th>Mismatches</th><th>Risk</th></tr></thead>
      <tbody>${amp.slice(0, 10).map((a, i) => `<tr${i === 0 ? ' style="background:var(--accent-soft)"' : ""}>
        <td><b>${bp(a.len)}</b>${i === 0 ? ' <span class="pill green">expected</span>' : ""}</td>
        <td class="num">${a.start + 1}–${a.end + 1}</td>
        <td class="muted small">${esc(a.fwd.primer.name)} + ${esc(a.rev.primer.name)}</td>
        <td class="num">${a.mismatches}</td>
        <td>${riskPill(a.risk)}</td></tr>`).join("")}
      </tbody></table></div>
    ${amp.length > 1 ? `<div class="note" style="margin-top:10px">More than one product is possible on this
      template. The extra bands are usually weak, but if a gel comes back messy this is the first thing to check.</div>`
      : `<div class="note ok" style="margin-top:10px">One product only.</div>`}
    ${res.ta ? `<div class="note info" style="margin-top:10px">Run at <b>${res.ta} °C</b> with
      ${esc(polymerase(res.polymerase).label)}, set by the lowest annealing Tm in the set.</div>` : ""}
  </div>` : ""}`;
}

/* ---------------- design ---------------- */
function primerDesignView(dna){
  const from = state.plasmids.find(x => x.id === primerState.fromId);
  const into = state.plasmids.find(x => x.id === primerState.intoId);
  const fromLen = from ? seqOf(from).length : 0;
  return `<div class="panel">
    <div class="grid2">
      <div>
        <label>Amplify from</label>
        <select onchange="primerState.fromId=this.value;primerState.design=null;render()">
          <option value="">— choose —</option>
          ${dna.map(x => `<option value="${x.id}" ${primerState.fromId===x.id?"selected":""}>${esc(x.name)}</option>`).join("")}
        </select>
        ${from ? `<div class="row" style="margin-top:8px">
          <div><label class="plain">From base</label>
            <input type="number" min="1" max="${fromLen}" value="${esc(primerState.fromStart)}"
              oninput="primerState.fromStart=this.value;primerState.design=null"></div>
          <div><label class="plain">To base</label>
            <input type="number" min="1" max="${fromLen}" value="${esc(primerState.fromEnd)}"
              oninput="primerState.fromEnd=this.value;primerState.design=null"></div>
        </div>
        ${(from.ann || []).length ? `<div style="margin-top:6px">
          <select onchange="primerUseAnn(this.value)">
            <option value="">— or pick a labelled region —</option>
            ${from.ann.map((a,i) => `<option value="${i}">${esc(a.label)} (${a.start+1}–${a.end+1})</option>`).join("")}
          </select></div>` : ""}` : ""}
      </div>
      <div>
        <label>Insert into</label>
        <select onchange="primerState.intoId=this.value;primerState.design=null;render()">
          <option value="">— choose —</option>
          ${dna.filter(x => x.topology === "circular").map(x => `<option value="${x.id}" ${primerState.intoId===x.id?"selected":""}>${esc(x.name)}</option>`).join("")}
        </select>
        ${into ? `<div class="row" style="margin-top:8px">
          <div><label class="plain">At base</label>
            <input type="number" min="1" max="${seqOf(into).length}" value="${esc(primerState.intoAt)}"
              oninput="primerState.intoAt=this.value;primerState.design=null"></div>
          <div><label class="plain">Homology arm</label>
            <input type="number" min="15" max="40" value="${primerState.arm}"
              oninput="primerState.arm=parseInt(this.value)||25;primerState.design=null"></div>
        </div>
        ${(into.ann || []).length ? `<div style="margin-top:6px">
          <select onchange="primerState.intoAt=String(parseInt(this.value,10)+1);primerState.design=null;render()">
            <option value="">— or at the start of a labelled region —</option>
            ${into.ann.map(a => `<option value="${a.start}">${esc(a.label)} (${a.start+1})</option>`).join("")}
          </select></div>` : ""}` : ""}
      </div>
    </div>
    <div style="margin-top:14px">
      <button class="primary" onclick="runPrimerDesign()">Design the four primers</button>
      <span class="muted small" style="margin-left:10px">Two to open the vector, two to amplify the insert with arms.</span>
    </div>
    ${primerState.error ? `<div class="note warn" style="margin-top:12px">${esc(primerState.error)}</div>` : ""}
  </div>
  ${primerState.design ? primerDesignResults() : ""}`;
}
function primerUseAnn(i){
  const from = state.plasmids.find(x => x.id === primerState.fromId);
  const a = from && from.ann[parseInt(i, 10)];
  if(!a) return;
  primerState.fromStart = String(a.start + 1); primerState.fromEnd = String(a.end + 1);
  primerState.design = null; render();
}
function runPrimerDesign(){
  primerState.design = null; primerState.error = null;
  const from = state.plasmids.find(x => x.id === primerState.fromId);
  const into = state.plasmids.find(x => x.id === primerState.intoId);
  if(!from || !into){ primerState.error = "Choose what to amplify and what to put it into."; render(); return; }
  const fs = seqOf(from), is = seqOf(into);
  const a = parseInt(primerState.fromStart, 10) - 1, b = parseInt(primerState.fromEnd, 10) - 1;
  const at = parseInt(primerState.intoAt, 10) - 1;
  if(isNaN(a) || isNaN(b) || a < 0 || b >= fs.length || b <= a){
    primerState.error = "Give a valid region to amplify."; render(); return; }
  if(isNaN(at) || at < 0 || at >= is.length){
    primerState.error = "Give a valid position in the vector."; render(); return; }
  const insert = fs.slice(a, b + 1);
  const gap = { pStart:at, pLen:0, tStart:at, tLen:insert.length, pSeq:"", tSeq:insert };
  const target = { id:"tmp", name:into.name + "+insert", type:"dna", topology:"circular",
                   seq: is.slice(0, at) + insert + is.slice(at), ann:[], stock:[] };
  const plan = planReplacement(into, target, gap, { polymerase: defaultPolymerase(),
                                                    targetTa: (state.lab && state.lab.targetTa) || 60 });
  if(!plan){ primerState.error = "Could not find annealing regions around that position."; render(); return; }
  primerState.design = { plan, into, from, insert, at, product: target.seq };
  render();
}
function primerDesignResults(){
  const d = primerState.design, q = d.plan;
  const rows = [
    ["vector-F", q.bbF, "opens the vector, pointing away from the insertion point"],
    ["vector-R", q.bbR, "the other half of the opening"],
    ["insert-F", q.insF, "amplifies the insert, carrying vector homology"],
    ["insert-R", q.insR, "the same at the other end"]
  ].filter(r => r[1]);
  return `<div class="panel">
    <div class="lblrow"><h2 style="margin:0">${esc(d.from.name)} → ${esc(d.into.name)} at ${d.at + 1}</h2>
      <span class="muted small">${bp(d.insert.length)} insert · ${bp(d.product.length)} product</span></div>
    <div class="scrollx"><table>
      <thead><tr><th>Primer</th><th>Sequence (5'→3')</th><th>Len</th><th>Anneal Tm</th><th>Stock</th><th></th></tr></thead>
      <tbody>${rows.map(([n, pr, why]) => `<tr>
        <td><b>${esc(n)}</b><div class="muted small">${esc(why)}</div></td>
        <td class="mono" style="word-break:break-all;max-width:330px">${pr.tail ? `<span class="ptail">${pr.tail}</span>` : ""}<span class="panneal">${pr.anneal}</span></td>
        <td class="num">${pr.len}</td><td class="num">${pr.tm} °C</td>
        <td>${pr.reuse ? `<span class="pill green">have it: ${esc(pr.reuse.name)}</span>`
              : `<button class="ghost" onclick="addOligo(${jsq(pr.full)},${jsq(n)})">log as ordered</button>`}</td>
        <td><button class="ghost" onclick="copyText('${pr.full}','Primer')">copy</button></td></tr>`).join("")}
      </tbody></table></div>
    <div class="primerkey" style="margin-top:8px">
      <span><i class="sw ptail"></i>${q.arm} bp homology arm</span>
      <span><i class="sw panneal"></i>anneals to the template</span>
    </div>
    <div class="note info" style="margin-top:10px">Anneal at <b>${q.ta} °C</b>. DpnI-treat both products before
      assembling, or the parent vector will dominate the transformation.</div>
    <div style="margin-top:12px">
      <button class="ghost" onclick="checkDesignedPrimers()">Check these for off-targets →</button>
      <button class="ghost" style="margin-left:8px" onclick="copyText(${jsq(rows.map(r => r[0] + "," + r[1].full).join("\\n"))},'All four primers')">Copy all four</button>
    </div>
  </div>`;
}
/* hand the designed primers straight to the checker, against the vector */
function checkDesignedPrimers(){
  const d = primerState.design; if(!d) return;
  const q = d.plan;
  primerState.paste = [["vector-F", q.bbF], ["vector-R", q.bbR]]
    .map(([n, pr]) => n + "," + pr.full).join("\n");
  primerState.templateId = d.into.id;
  primerState.mode = "analyse";
  runPrimerCheck();
}
