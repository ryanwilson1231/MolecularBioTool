/* ===================== VIEW: tools ===================== */
function viewTools(){
  return `<h1 class="page">Bench calculators</h1>
  <p class="lede">Approximations, not vendor-specific tools.</p>
  <div class="grid2">
    <div class="panel">
      <h3>Mass ↔ moles</h3>
      <label class="plain">Nucleic acid</label>
      <select id="t-type" onchange="tlMassMoles()"><option value="650">dsDNA</option><option value="330">ssDNA / oligo</option><option value="340">RNA</option></select>
      <div class="row"><div><label class="plain">Length (bp / nt)</label><input id="t-len" type="number" oninput="tlMassMoles()" placeholder="1000"></div>
        <div><label class="plain">Mass (ng)</label><input id="t-ng" type="number" oninput="tlMassMoles()" placeholder="100"></div></div>
      <div id="t-mm-res" style="margin-top:10px;font-size:13px"></div>
    </div>
    <div class="panel">
      <h3>Ligation (insert : vector)</h3>
      <div class="row"><div><label class="plain">Vector mass (ng)</label><input id="l-vng" type="number" value="50" oninput="tlLig()"></div>
        <div><label class="plain">Vector length (bp)</label><input id="l-vlen" type="number" oninput="tlLig()" placeholder="5000"></div></div>
      <div class="row"><div><label class="plain">Insert length (bp)</label><input id="l-ilen" type="number" oninput="tlLig()" placeholder="1000"></div>
        <div><label class="plain">Molar ratio insert:vector</label><input id="l-ratio" type="number" value="3" oninput="tlLig()"></div></div>
      <div id="l-res" style="margin-top:10px;font-size:13px"></div>
    </div>
    <div class="panel">
      <h3>Dilution (C₁V₁ = C₂V₂)</h3>
      <div class="row"><div><label class="plain">Stock conc (C₁)</label><input id="d-c1" type="number" oninput="tlDil()"></div>
        <div><label class="plain">Final conc (C₂)</label><input id="d-c2" type="number" oninput="tlDil()"></div></div>
      <label class="plain">Final volume (V₂)</label><input id="d-v2" type="number" oninput="tlDil()">
      <div id="d-res" style="margin-top:10px;font-size:13px"></div>
    </div>
    <div class="panel">
      <h3>Primer Tm (nearest-neighbour)</h3>
      <label class="plain">Primer sequence</label><input id="tm-seq" oninput="tlTm()" placeholder="ACGT…">
      <div class="row"><div><label class="plain">Primer conc (µM)</label><input id="tm-conc" type="number" value="0.25" oninput="tlTm()"></div>
        <div><label class="plain">[Na⁺] (mM)</label><input id="tm-na" type="number" value="50" oninput="tlTm()"></div></div>
      <div id="tm-res" style="margin-top:10px;font-size:13px"></div>
    </div>
    <div class="panel">
      <h3>Agarose percentage</h3>
      <label class="plain">Fragment size you need to resolve (bp)</label><input id="ag-bp" type="number" oninput="tlAgarose()" placeholder="1200">
      <div id="ag-res" style="margin-top:10px;font-size:13px"></div>
      <div class="muted small" style="margin-top:6px">Also gives the gel recipe for a standard 50 mL small gel.</div>
    </div>
    <div class="panel">
      <h3>Antibiotic working dilution</h3>
      <div class="row"><div><label class="plain">Stock (mg/mL)</label><input id="ab-stock" type="number" value="100" oninput="tlAntibiotic()"></div>
        <div><label class="plain">Working (µg/mL)</label><input id="ab-work" type="number" value="100" oninput="tlAntibiotic()"></div></div>
      <label class="plain">Volume of medium (mL)</label><input id="ab-vol" type="number" value="500" oninput="tlAntibiotic()">
      <div id="ab-res" style="margin-top:10px;font-size:13px"></div>
      <div class="muted small" style="margin-top:6px">Common finals: ampicillin 100, kanamycin 50, chloramphenicol 25 (34 in some labs), spectinomycin 50, tetracycline 10 µg/mL.</div>
    </div>
    <div class="panel">
      <h3>Solution prep (molarity → mass)</h3>
      <div class="row"><div><label class="plain">MW (g/mol)</label><input id="s-mw" type="number" oninput="tlSol()" placeholder="58.44"></div>
        <div><label class="plain">Molarity (M)</label><input id="s-m" type="number" oninput="tlSol()" placeholder="0.5"></div></div>
      <label class="plain">Volume (mL)</label><input id="s-v" type="number" oninput="tlSol()" placeholder="100">
      <div id="s-res" style="margin-top:10px;font-size:13px"></div>
    </div>
    <div class="panel">
      <h3>Transformation efficiency</h3>
      <div class="row"><div><label class="plain">Colonies counted</label><input id="te-col" type="number" oninput="tlTE()" placeholder="240"></div>
        <div><label class="plain">DNA used (ng)</label><input id="te-ng" type="number" value="0.1" oninput="tlTE()"></div></div>
      <div class="row"><div><label class="plain">Volume plated (µL)</label><input id="te-plated" type="number" value="100" oninput="tlTE()"></div>
        <div><label class="plain">Total recovery (µL)</label><input id="te-total" type="number" value="1000" oninput="tlTE()"></div></div>
      <div id="te-res" style="margin-top:10px;font-size:13px"></div>
    </div>
  </div>
  <div class="panel" style="margin-top:16px">
    <h2>Default polymerase</h2>
    <p class="muted" style="margin:0 0 10px">Used for extension times, annealing temperatures and the protocols.
      Each vendor's rule for turning a primer Tm into an annealing temperature is different, which is why the same
      primers get a different recommendation depending on what you are running.</p>
    <div class="row" style="max-width:420px">
      <div><label class="plain">Polymerase</label>
        <select onchange="state.lab.polymerase=this.value;save();render()">
          ${Object.keys(POLYMERASES).map(k => `<option value="${k}" ${defaultPolymerase()===k?"selected":""}>${esc(POLYMERASES[k].label)}</option>`).join("")}
        </select></div>
      <div><label class="plain">Target annealing temp (°C)</label>
        <input type="number" min="45" max="72" value="${state.lab.targetTa}"
          oninput="state.lab.targetTa=parseInt(this.value)||60;save()"></div>
    </div>
    <div class="scrollx" style="margin-top:12px"><table>
      <thead><tr><th>Polymerase</th><th>Vendor</th><th>Fidelity</th><th>Extension</th><th>Ta rule</th></tr></thead>
      <tbody>${Object.keys(POLYMERASES).map(k => { const e = POLYMERASES[k];
        return `<tr${k===defaultPolymerase()?' style="background:var(--accent-soft)"':""}>
          <td><b>${esc(e.label)}</b></td><td class="muted">${esc(e.vendor)}</td>
          <td>${e.proofreading ? '<span class="pill green">proofreading</span>' : '<span class="pill amber">A-overhang</span>'}</td>
          <td class="num">${e.sPerKb} s/kb</td>
          <td class="num">Tm ${e.taOffset >= 0 ? "+" : ""}${e.taOffset} °C${e.shortOffset !== undefined ? " (+0 if ≤20 nt)" : ""}</td></tr>`; }).join("")}
      </tbody></table></div>
    <div class="note">These offsets are the vendors' published rules of thumb applied to a SantaLucia
      nearest-neighbour Tm. They are not the vendors' own Tm models — NEB's calculator in particular runs warmer, so
      treat a disagreement of a couple of degrees as normal and gradient if a reaction is marginal.</div>
  </div>
  ${isSimple() ? "" : `<div class="panel" style="margin-top:16px">
    <h2>Planning rates</h2>
    <p class="muted" style="margin:0 0 10px">Used to compare routes. Rough by construction &mdash; put in your own
      institution's numbers and the comparison gets sharper. The defaults sit at the cheap end of advertised
      list prices (synthesis runs roughly $0.07&ndash;0.15/bp depending on vendor and complexity), and academic
      or volume pricing is usually better than list.</p>
    <div class="grid3">
      <div><label class="plain">Currency symbol</label>
        <input value="${esc(state.rates.currency)}" oninput="state.rates.currency=this.value;save()"></div>
      <div><label class="plain">Synthesis, per bp</label>
        <input type="number" step="0.01" value="${state.rates.synthPerBp}" oninput="state.rates.synthPerBp=parseFloat(this.value)||0;save()"></div>
      <div><label class="plain">Cloning into a vector (flat)</label>
        <input type="number" step="1" value="${state.rates.vectorFee}" oninput="state.rates.vectorFee=parseFloat(this.value)||0;save()"></div>
      <div><label class="plain">Oligo, per base</label>
        <input type="number" step="0.01" value="${state.rates.oligoPerBase}" oninput="state.rates.oligoPerBase=parseFloat(this.value)||0;save()"></div>
      <div><label class="plain">Consumables, per reaction</label>
        <input type="number" step="0.1" value="${state.rates.enzymePerRxn}" oninput="state.rates.enzymePerRxn=parseFloat(this.value)||0;save()"></div>
      <div><label class="plain">Sequencing, per read</label>
        <input type="number" step="0.5" value="${state.rates.seqPerRead}" oninput="state.rates.seqPerRead=parseFloat(this.value)||0;save()"></div>
      <div><label class="plain">Days per cloning step</label>
        <input type="number" value="${state.rates.daysPerClone}" oninput="state.rates.daysPerClone=parseFloat(this.value)||0;save()"></div>
      <div><label class="plain">Days waiting on an order</label>
        <input type="number" value="${state.rates.daysPerOrder}" oninput="state.rates.daysPerOrder=parseFloat(this.value)||0;save()"></div>
    </div>
  </div>`}
  <div class="note">Double digest buffer compatibility and NEBuilder-specific assembly rules depend on vendor data that
    cannot be bundled honestly into a static file — check the enzyme datasheet before setting up a double digest.</div>`;
}
function tlMassMoles(){
  const mw = parseFloat(val("t-type")), len = parseFloat(val("t-len")), ng = parseFloat(val("t-ng"));
  const r = document.getElementById("t-mm-res"); if(!r) return;
  if(!len || isNaN(ng)){ r.textContent = ""; return; }
  const pmol = ng*1000/(len*mw);
  r.innerHTML = "= <b>" + pmol.toFixed(3) + " pmol</b> · " + (pmol*6.022e11).toExponential(2) + " molecules · "
    + (len*mw/1e6).toFixed(2) + " MDa per molecule";
}
function tlLig(){
  const vng = parseFloat(val("l-vng")), vlen = parseFloat(val("l-vlen")), ilen = parseFloat(val("l-ilen")), ratio = parseFloat(val("l-ratio"));
  const r = document.getElementById("l-res"); if(!r) return;
  if(!vng || !vlen || !ilen || !ratio){ r.textContent = ""; return; }
  const ing = ratio*(ilen/vlen)*vng;
  r.innerHTML = "Use <b>" + ing.toFixed(1) + " ng</b> of insert for a " + ratio + ":1 molar ratio<br>"
    + '<span class="muted small">' + (vng*1000/(vlen*650)).toFixed(3) + " pmol vector · "
    + (ing*1000/(ilen*650)).toFixed(3) + " pmol insert</span>";
}
function tlDil(){
  const c1 = parseFloat(val("d-c1")), c2 = parseFloat(val("d-c2")), v2 = parseFloat(val("d-v2"));
  const r = document.getElementById("d-res"); if(!r) return;
  if(!c1 || !c2 || !v2){ r.textContent = ""; return; }
  if(c2 > c1){ r.innerHTML = '<span style="color:var(--red)">Final concentration is higher than the stock.</span>'; return; }
  const v1 = c2*v2/c1;
  r.innerHTML = "Take <b>" + v1.toFixed(2) + "</b> of stock and add <b>" + (v2-v1).toFixed(2) + "</b> of diluent"
    + '<br><span class="muted small">' + (c1/c2).toFixed(1) + "-fold dilution</span>";
}
function tlTm(){
  const seq = cleanDNA(val("tm-seq")), conc = parseFloat(val("tm-conc")) || 0.25, na = parseFloat(val("tm-na")) || 50;
  const r = document.getElementById("tm-res"); if(!r) return;
  if(seq.length < 2){ r.textContent = ""; return; }
  const t = tmNN(seq, conc*1e-6, na/1000);
  r.innerHTML = "NN Tm <b>" + t + " °C</b> · Wallace/GC rule " + tmQuick(seq) + " °C<br>"
    + '<span class="muted small">' + seq.length + " nt · GC " + gcPct(seq).toFixed(0) + "% · suggested annealing "
    + (t - 3).toFixed(0) + "-" + t.toFixed(0) + " °C</span>"
    + (primerWarnings(seq).length ? '<div class="note" style="margin-top:8px">⚠ ' + primerWarnings(seq).join("; ") + "</div>" : "");
}
function tlAgarose(){
  const b = parseFloat(val("ag-bp")); const r = document.getElementById("ag-res"); if(!r) return;
  if(!b){ r.textContent = ""; return; }
  const pct = b > 8000 ? 0.5 : b > 4000 ? 0.7 : b > 1500 ? 1.0 : b > 700 ? 1.2 : b > 300 ? 1.5 : b > 100 ? 2.0 : 2.5;
  const range = b > 8000 ? "1-30 kb" : b > 4000 ? "0.8-12 kb" : b > 1500 ? "0.5-7 kb" : b > 700 ? "0.4-6 kb"
    : b > 300 ? "0.2-3 kb" : b > 100 ? "50-800 bp" : "20-500 bp";
  r.innerHTML = "Use a <b>" + pct.toFixed(1) + "%</b> gel · resolving range " + range + "<br>"
    + '<span class="muted small">50 mL gel: ' + (pct*0.5).toFixed(2) + " g agarose in 50 mL 1× TAE</span>";
}
function tlAntibiotic(){
  const stock = parseFloat(val("ab-stock")), work = parseFloat(val("ab-work")), vol = parseFloat(val("ab-vol"));
  const r = document.getElementById("ab-res"); if(!r) return;
  if(!stock || !work || !vol){ r.textContent = ""; return; }
  const ul = (work*vol)/(stock*1000)*1000;
  r.innerHTML = "Add <b>" + ul.toFixed(1) + " µL</b> of stock to " + vol + " mL of medium"
    + '<br><span class="muted small">1:' + Math.round(stock*1000/work) + " dilution — cool agar below 55 °C first</span>";
}
function tlSol(){
  const mw = parseFloat(val("s-mw")), m = parseFloat(val("s-m")), v = parseFloat(val("s-v"));
  const r = document.getElementById("s-res"); if(!r) return;
  if(!mw || !m || !v){ r.textContent = ""; return; }
  const g = mw*m*v/1000;
  r.innerHTML = "Weigh out <b>" + (g >= 1 ? g.toFixed(3) + " g" : (g*1000).toFixed(1) + " mg") + "</b> and make up to " + v + " mL";
}
function tlTE(){
  const col = parseFloat(val("te-col")), ng = parseFloat(val("te-ng")),
        plated = parseFloat(val("te-plated")), total = parseFloat(val("te-total"));
  const r = document.getElementById("te-res"); if(!r) return;
  if(!col || !ng || !plated || !total){ r.textContent = ""; return; }
  const eff = col*(total/plated)/(ng/1000);
  r.innerHTML = "<b>" + eff.toExponential(2) + " cfu/µg</b><br><span class='muted small'>"
    + (eff > 1e8 ? "high-efficiency range — fine for library work"
      : eff > 1e6 ? "normal for home-made chemically competent cells"
      : "low — check the cells, the ligation buffer's ATP, and the heat shock timing") + "</span>";
}

