/* ===================== VIEW: point mutation ===================== */
let mutState = { templateId:null, by:"aa", orfKey:null, spec:"", ntPos:"", ntKind:"sub", ntNew:"", ntLen:1,
            host:"ecoli", result:null, error:null };

/* every coding region we could number codons against: real annotations first,
   then anything the ORF finder turns up */
function mutORFs(p){
  if(!p || p.type !== "dna") return [];
  const out = [];
  (p.ann || []).forEach(a => {
    if(a.kind === "orf" || a.kind === "cds" || /\b(orf|cds)\b/i.test(a.label))
      out.push({ key:"ann:" + a.id, label:a.label, start:a.start, end:a.end, strand:a.strand || 1 });
  });
  if(!out.length)
    plausibleORFs(seqOf(p)).forEach((o, i) =>
      out.push({ key:"auto:" + i, label:"ORF " + o.len + " aa (" + (o.strand===1?"+":"−") + ")",
                 start:o.start, end:o.end, strand:o.strand }));
  return out;
}
function mutCurrentORF(p){
  const list = mutORFs(p);
  return list.find(o => o.key === mutState.orfKey) || list[0] || null;
}
function mutReset(){ mutState.result = null; mutState.error = null; }

function viewMutate(){
  const dna = state.plasmids.filter(x => x.type === "dna");
  const p = state.plasmids.find(x => x.id === mutState.templateId);
  const orfs = p ? mutORFs(p) : [];
  const orf = p ? mutCurrentORF(p) : null;
  const protein = orf && p
    ? translate(orf.strand === 1 ? seqOf(p).slice(orf.start, orf.end + 1)
                                 : revComp(seqOf(p).slice(orf.start, orf.end + 1)))
    : "";
  return `<div class="panel">
    <div class="grid2">
      <div>
        <label>Template</label>
        <select onchange="mutState.templateId=this.value;mutState.orfKey=null;mutReset();render()">
          <option value="">— choose a construct —</option>
          ${dna.map(x => `<option value="${x.id}" ${mutState.templateId===x.id?"selected":""}>${esc(x.name)} (${bp(seqOf(x).length)})</option>`).join("")}
        </select>
        ${p && !p.stock.length ? `<div class="note" style="margin-top:8px">${esc(p.name)} has no physical stock
          — you will need the plasmid in hand to use it as a PCR template.</div>` : ""}
      </div>
      <div>
        <label>Describe the change</label>
        <div class="toggle">
          <button class="${mutState.by==='aa'?'on':''}" onclick="mutState.by='aa';mutReset();render()">By amino acid</button>
          <button class="${mutState.by==='nt'?'on':''}" onclick="mutState.by='nt';mutReset();render()">By base</button>
        </div>
      </div>
    </div>

    ${!p ? "" : mutState.by === "aa" ? `
      <div class="grid2" style="margin-top:12px">
        <div>
          <label>Coding region to number against</label>
          ${orfs.length ? `<select onchange="mutState.orfKey=this.value;mutReset();render()">
            ${orfs.map(o => `<option value="${o.key}" ${orf && orf.key===o.key?"selected":""}>${esc(o.label)} · ${o.start+1}–${o.end+1} · ${Math.floor((o.end-o.start+1)/3)} codons</option>`).join("")}
          </select>` : `<div class="note warn">No coding region found. Label an ORF on the map, or switch to
            <b>By base</b>.</div>`}
          ${orf ? `<div class="muted small" style="margin-top:6px">Residue 1 is
            ${esc(protein[0] || "?")} at base ${orf.strand===1 ? orf.start+1 : orf.end+1}${orf.strand===-1?", reading on the reverse strand":""}.</div>` : ""}
        </div>
        <div>
          <label>Mutation</label>
          <input id="mut-spec" value="${esc(mutState.spec)}" placeholder="E123K"
            oninput="mutState.spec=this.value;mutReset()" onkeydown="if(event.key==='Enter')runMutation()">
          <div class="muted small" style="margin-top:6px">One-letter or three-letter codes, with or without the
            original residue: <b>E123K</b>, <b>Glu123Lys</b>, <b>123K</b>, <b>E123*</b> for a stop, <b>E123del</b>
            to remove the codon.</div>
        </div>
      </div>` : `
      <div class="grid3" style="margin-top:12px">
        <div><label>Change</label>
          <select onchange="mutState.ntKind=this.value;mutReset();render()">
            <option value="sub" ${mutState.ntKind==='sub'?'selected':''}>Substitute</option>
            <option value="ins" ${mutState.ntKind==='ins'?'selected':''}>Insert</option>
            <option value="del" ${mutState.ntKind==='del'?'selected':''}>Delete</option>
          </select></div>
        <div><label>${mutState.ntKind==='ins'?'Insert before base':'First base'} (1-based)</label>
          <input type="number" value="${esc(mutState.ntPos)}" oninput="mutState.ntPos=this.value;mutReset()"></div>
        ${mutState.ntKind==='del'
          ? `<div><label>Bases to delete</label>
              <input type="number" value="${mutState.ntLen}" oninput="mutState.ntLen=parseInt(this.value)||1;mutReset()"></div>`
          : `<div><label>New bases</label>
              <input value="${esc(mutState.ntNew)}" placeholder="GCT" oninput="mutState.ntNew=this.value;mutReset()"></div>`}
      </div>`}

    ${p ? `<div class="grid3" style="margin-top:14px">
      <div><label>Polymerase</label>
        <select onchange="state.lab.polymerase=this.value;save();mutReset();if(mutState.spec||mutState.ntPos)runMutation();else render()">
          ${Object.keys(POLYMERASES).map(k => `<option value="${k}" ${defaultPolymerase()===k?"selected":""}>${esc(POLYMERASES[k].label)}${POLYMERASES[k].proofreading?"":" · no proofreading"}</option>`).join("")}
        </select></div>
      <div><label>Target annealing temp</label>
        <div class="row tight">
          <input type="number" min="45" max="72" value="${state.lab.targetTa}"
            oninput="state.lab.targetTa=parseInt(this.value)||60;save();mutReset()"
            onchange="if(mutState.spec||mutState.ntPos)runMutation()">
          <span class="muted small" style="flex:0 0 auto;align-self:center">°C</span>
        </div></div>
      <div style="display:flex;align-items:flex-end">
        <button class="primary" onclick="runMutation()">Design primers</button></div>
    </div>
    <div class="muted small" style="margin-top:8px">${esc(polymerase(defaultPolymerase()).note)}</div>` 
    : `<div class="note info" style="margin-top:12px">Choose a construct to mutate.</div>`}
    ${mutState.error ? `<div class="note warn" style="margin-top:12px">${esc(mutState.error)}</div>` : ""}
    ${howItWorksPanel()}
  </div>
  ${mutState.result ? mutResults(p) : ""}`;
}

function runMutation(){
  const p = state.plasmids.find(x => x.id === mutState.templateId);
  mutState.result = null; mutState.error = null;
  if(!p){ mutState.error = "Choose a construct first."; render(); return; }
  const seq = seqOf(p);
  let edit = null;
  if(mutState.by === "aa"){
    const orf = mutCurrentORF(p);
    if(!orf){ mutState.error = "No coding region to number against. Label an ORF, or switch to By base."; render(); return; }
    const change = parseAAChange(mutState.spec);
    if(!change){ mutState.error = 'Could not read "' + mutState.spec + '". Try something like E123K, 123K or E123del.'; render(); return; }
    edit = aaChangeToEdit(p, orf, change, mutState.host);
    if(edit.error){ mutState.error = edit.error; render(); return; }
  } else {
    const pos = parseInt(mutState.ntPos, 10);
    if(!pos || pos < 1 || pos > seq.length){ mutState.error = "Give a base position between 1 and " + seq.length + "."; render(); return; }
    const a = pos - 1;
    if(mutState.ntKind === "sub"){
      const nw = cleanDNA(mutState.ntNew);
      if(!nw){ mutState.error = "Give the replacement bases."; render(); return; }
      edit = { kind:"sub", a, b:a + nw.length - 1, newSeq:nw,
               note:"replaces " + seq.slice(a, a + nw.length) + " at " + pos + " with " + nw };
      if(edit.b >= seq.length){ mutState.error = "That substitution runs past the end of the sequence."; render(); return; }
    } else if(mutState.ntKind === "ins"){
      const nw = cleanDNA(mutState.ntNew);
      if(!nw){ mutState.error = "Give the bases to insert."; render(); return; }
      edit = { kind:"ins", a, b:a - 1, newSeq:nw, note:"inserts " + nw.length + " bp before base " + pos };
    } else {
      const n = Math.max(1, mutState.ntLen || 1);
      if(a + n > seq.length){ mutState.error = "That deletion runs past the end of the sequence."; render(); return; }
      edit = { kind:"del", a, b:a + n - 1, newSeq:"", note:"deletes " + n + " bp from base " + pos };
    }
  }
  const res = designMutagenesis(p, edit, { host:mutState.host,
    polymerase: defaultPolymerase(), targetTa: state.lab.targetTa });
  if(res.error){ mutState.error = res.error; render(); return; }
  mutState.result = res;
  render();
}

function mutResults(p){
  const r = mutState.result, e = r.edit;
  const seq = seqOf(p);
  const before = cycSub(seq, e.a - 15, 15);
  const after = cycSub(seq, e.b + 1, 15);
  const oldBit = e.b >= e.a ? seq.slice(e.a, e.b + 1) : "";
  const prow = (pr, role) => `<tr>
      <td><b>${esc(pr.name)}</b><div class="muted small">${role}</div></td>
      <td class="mono" style="word-break:break-all;max-width:360px">${pr.tail ? `<span class="muttail">${pr.tail}</span>` : ""}${pr.anneal}</td>
      <td class="num">${pr.len}</td>
      <td class="num">${pr.tm != null ? pr.tm + " °C" : "—"}</td>
      <td class="num">${pr.gc}%</td>
      <td>${pr.reuse ? `<span class="pill green">have it: ${esc(pr.reuse.name)}</span>`
            : `<button class="ghost" onclick="addOligo(${jsq(pr.full)},${jsq(pr.name)})">log as ordered</button>`}</td>
      <td><button class="ghost" onclick="copyText('${pr.full}','Primer')">copy</button></td>
    </tr>
    ${pr.warn.length ? `<tr><td></td><td colspan="6" class="muted small">⚠ ${pr.warn.map(esc).join("; ")}</td></tr>` : ""}`;
  const sc = r.screening;
  return `<div class="panel">
    <div class="lblrow"><h2 style="margin:0">${esc(e.note || "Mutation")}</h2>
      ${r.warnings.length ? `<span class="pill amber">${r.warnings.length} warning${r.warnings.length===1?"":"s"}</span>`
                          : '<span class="pill green">clear</span>'}</div>

    <div class="mutdiff">
      <div><span class="mutlbl">template</span><span class="mono">${before}<b class="mutold">${oldBit || "·"}</b>${after}</span></div>
      <div><span class="mutlbl">product</span><span class="mono">${before}<b class="mutnew">${e.newSeq || "·"}</b>${after}</span></div>
    </div>
    ${e.fromAA ? `<div class="muted small" style="margin-top:8px">Protein: ${esc(e.fromAA)}${e.aaPos} →
      ${e.toAA ? esc(e.toAA) : "deleted"}${e.changes ? " · " + e.changes + " base change" + (e.changes===1?"":"s") +
      ", the fewest that gets there" : ""}</div>` : ""}

    ${r.warnings.length ? `<div class="note warn" style="margin-top:12px">${r.warnings.map(esc).join("<br>")}</div>` : ""}
    ${r.notes.length ? `<div class="note info" style="margin-top:10px">${r.notes.map(esc).join("<br>")}</div>` : ""}

    <h3 style="margin-top:16px">Primers</h3>
    <div class="scrollx"><table>
      <thead><tr><th>Primer</th><th>Sequence (5'→3')</th><th>Len</th><th>Anneal Tm</th><th>GC</th><th>Stock</th><th></th></tr></thead>
      <tbody>${prow(r.fwd, "carries the change")}${prow(r.rev, "back-to-back, matches the template")}</tbody>
    </table></div>
    <div class="muted small" style="margin-top:6px">
      <span class="muttail" style="padding:1px 4px">Orange</span> is the part that does not match the template —
      the change itself plus, for a substitution, ${r.flank5} matching bases on its 5' side so the ligated end is clean.
      Tm is for the annealing portion only, which is what sets the annealing temperature.
    </div>
    <div class="note info" style="margin-top:10px">
      Run at <b>${r.ta} °C</b> with ${esc(polymerase(r.polymerase).label)}.
      The lower of the two annealing Tm values sets this${polymerase(r.polymerase).taOffset
        ? ", plus " + polymerase(r.polymerase).taOffset + " °C for this polymerase" : ""}.
      Each arm was cut to the shortest length that reaches ${Math.round(r.needTm)} °C, which is why the two primers
      are different lengths — a GC-rich side needs fewer bases than an AT-rich one.
      <br>The Tm underneath is a nearest-neighbour calculation, not the vendor's own model; NEB's calculator runs a
      degree or two warmer. If the reaction is thin, gradient from ${r.ta - 4} to ${r.ta + 4} °C before changing anything else.
    </div>

    ${sc ? `<div class="note ok" style="margin-top:10px">
      <b>Screening shortcut.</b> Changing codon ${sc.codonPos} from ${sc.from} to ${sc.to} is silent (still ${sc.aa})
      and creates a <b>${sc.enzyme}</b> site that is unique in the product and absent from the parent. Add it to the
      forward primer and you can tell a correct clone apart with a digest instead of a sequencing read.
      <div style="margin-top:8px"><button class="ghost" onclick="applyScreeningSite()">Add the ${sc.enzyme} site too</button></div>
    </div>` : ""}

    <h3 style="margin-top:16px">Protocol</h3>
    ${protocolList(mutProtocol(p, r))}

    <h3 style="margin-top:16px">Product — ${bp(r.product.length)}
      <span class="muted small">${r.removed ? r.removed + " bp removed" : ""}${r.removed && r.inserted ? ", " : ""}${r.inserted ? r.inserted + " bp added" : ""}</span></h3>
    <div class="muted small" style="margin-bottom:6px">${r.ann.length} components carried across</div>
    <div class="seqbox">${r.product.match(/.{1,60}/g).slice(0,4).join("\n")}${r.product.length > 240 ? "\n… " + (r.product.length - 240) + " more bp" : ""}</div>
    <div style="margin-top:12px">
      <button class="primary" onclick="saveMutant()">Save as a construct</button>
      <button class="ghost" style="margin-left:8px" onclick="copyText(${jsq(r.product)},'Product')">Copy sequence</button>
    </div>
  </div>`;
}
function applyScreeningSite(){
  const r = mutState.result; if(!r || !r.screening) return;
  const p = state.plasmids.find(x => x.id === mutState.templateId); if(!p) return;
  const sc = r.screening;
  // the silent change and the real mutation together, redesigned as one edit
  const seq = seqOf(p);
  const lo = Math.min(r.edit.a, r.edit.a + sc.offset * 3);
  const hi = Math.max(r.edit.b, r.edit.a + sc.offset * 3 + 2);
  let span = seq.slice(lo, hi + 1);
  // rebuild the span from the product-with-site, which already has both changes
  const shift = r.edit.newSeq.length - (r.edit.b - r.edit.a + 1);
  const newSpan = sc.seqWithSite.slice(lo, hi + 1 + shift);
  const edit = { kind:"sub", a:lo, b:hi, newSeq:newSpan, strand:r.edit.strand,
    fromAA:r.edit.fromAA, toAA:r.edit.toAA, aaPos:r.edit.aaPos, changes:r.edit.changes,
    note:(r.edit.note || "mutation") + " + silent " + sc.enzyme + " site" };
  const res = designMutagenesis(p, edit, { host:mutState.host });
  if(res.error){ toast(res.error); return; }
  res.screening = null;
  res.notes.push("Includes the silent " + sc.enzyme + " site at codon " + sc.codonPos + " for screening.");
  mutState.result = res; render();
  toast("Screening site added to the primer");
}
function saveMutant(){
  const r = mutState.result; if(!r) return;
  const p = state.plasmids.find(x => x.id === mutState.templateId); if(!p) return;
  const label = r.edit.fromAA ? r.edit.fromAA + r.edit.aaPos + (r.edit.toAA || "del") : "mut";
  const name = prompt("Name for the mutant", p.name + "-" + label);
  if(!name) return;
  const np = { id:uid(), name, type:"dna", topology:p.topology, uniprot:p.uniprot || "", seq:r.product,
    ann:r.ann, stock:[], inSilico:true, tags:(p.tags||[]).concat(["mutant"]), created:today(),
    notes:(r.edit.note || "") + (p.notes ? "\n\nFrom " + p.name + ": " + p.notes : ""),
    color:p.color || null, source:"site-directed mutagenesis in BetterBench",
    parents:[{ id:p.id, name:p.name, role:"template" }] };
  state.plasmids.push(np);
  state.builds.push({ id:uid(), date:today(), productId:np.id, vector:p.name,
    insert:r.edit.note || "point mutation", route:"mutagenesis" });
  save(); openPlasmid(np.id);
  toast("Saved — in silico until you log a tube");
}

/* The two questions everyone asks the first time they see this method. */
function howItWorksPanel(){
  return `<details class="fold" style="margin-top:14px"><summary>How this works</summary>
    <div class="howbox">
      <p>The two primers point <b>away</b> from each other, with their 5' ends touching. PCR therefore copies the
      <b>whole plasmid</b> as one long linear product, and the ends are joined afterwards.</p>

      <div class="howdiag mono">
<span class="muted">template</span>   ────────────┬──────●──────┬────────────
                    <span class="howrev">◄══ reverse</span>   <span class="howmut">▲</span>    <span class="howfwd">forward ══►</span>
                                 the change
<span class="muted">product </span>   <span class="howfwd">forward ══►</span> ·········· around the plasmid ·········· <span class="howrev">◄══ reverse</span>
                    └─ ligase joins these two ends ─┘
      </div>

      <h3 style="margin-top:14px">Why there is no overlap</h3>
      <p>The older QuikChange method used two fully overlapping primers, both carrying the mutation. Being
      complementary, they anneal to <i>each other</i> as readily as to the template, so you get primer dimer and
      only linear amplification. Back-to-back primers cannot pair with each other, so the reaction amplifies
      exponentially like a normal PCR and gives far more product.</p>

      <h3>Why only the forward primer carries the change</h3>
      <p>Because the primers do not overlap, the mutation site sits inside <b>one primer's footprint only</b> — the
      reverse primer is annealing to a different stretch of DNA entirely. There is nowhere for it to also carry the
      change. And there is no need: every copy made from the forward primer already contains it, and after ligation
      every circle does too.</p>

      <h3>Why the change sits in the middle of that primer</h3>
      <p>Two reasons. The polymerase needs about ten perfectly matched bases at the <b>3' end</b> or it will not
      extend. And a mismatch at the extreme <b>5' end</b> would land exactly on the blunt join, where it ligates
      badly and the edit can be lost. So it goes in the middle, with matching sequence either side.</p>

      <h3>How the mutation takes over</h3>
      <p>In the first cycle the forward primer copies the parent and makes a mutant strand; the reverse primer
      copies the parent and makes a wild-type one. From the second cycle on, the reverse primer has a new kind of
      template available — the strands the forward primer just made — and copying one of those copies the
      mutation with it.</p>
      <div class="howdiag mono">
<span class="muted">cycle 1</span>  parent circle  →  <span class="howfwd">F strand (mutant)</span>  +  <span class="howrev">R strand (wild type)</span>
         <span class="muted">one ragged end each — neither can be ligated</span>

<span class="muted">cycle 2</span>  <span class="howfwd">F strand</span> → R copies it → <span class="howrev">R strand (now mutant)</span>
         <span class="howrev">R strand</span> → F copies it → <span class="howfwd">F strand (mutant)</span>
         <span class="muted">both ends now defined — this is the ligatable product</span>

<span class="muted">cycle n</span>  parent-derived: <b>n</b> copies, linear growth, unligatable
         product-derived: <b>2ⁿ</b> copies, every one carrying the change
      </div>
      <p>The sharper way to see it: a molecule can only close into a circle if <b>both</b> ends are clean, and an end
      is only clean if a primer defined it. Every such molecule has the forward primer at one end — so every
      molecule that can become a plasmid carries the mutation. The wild-type strands from cycle one have a ragged
      3' end from running off the circular template and are simply never ligated.</p>
      <p>Both strands end up carrying the change, so the circle is a proper matched duplex rather than a mismatch
      the cell has to resolve — which is why colonies come back clean rather than mixed.</p>

      <h3>Insertions and deletions</h3>
      <p>An insertion is new sequence with no template to match, so it can only be a 5' tail — and if it is long it
      is split across both primers so neither becomes an ultramer. A deletion needs no mismatch at all: the primers
      simply sit either side of the region and it is never copied.</p>

      <h3>What KLD does</h3>
      <p>Three enzymes in one five-minute step. <b>Kinase</b> adds the 5' phosphates that synthetic primers lack,
      so the ends can be joined. <b>Ligase</b> closes the circle. <b>DpnI</b> cuts only methylated DNA — your
      template came out of a <i>dam+</i> E. coli strain and is methylated, while the PCR product was made in vitro
      and is not, so the parent is destroyed and the mutant survives.</p>
    </div>
  </details>`;
}
