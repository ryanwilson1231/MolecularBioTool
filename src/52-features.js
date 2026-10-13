/* =========================================================================
   YOUR FEATURE LIBRARY
   The built-in motif list only knows common parts. Anything your lab actually
   uses - a polyhedrin promoter, a house linker, a strain-specific marker -
   goes here, and the pre-check finds it on every construct from then on.
   ========================================================================= */

const FEATURE_KINDS = ["promoter","terminator","tag","marker","origin","element","reporter","cds","custom"];

function addFeature(name, seq, kind, note){
  const s = cleanDNA(seq);
  if(!name || !s) return null;
  if(s.length < 8) return { error: "Too short to search for reliably - 8 bases is the floor, and under about 15 you will get chance hits." };
  const dup = (state.features || []).find(f => cleanDNA(f.seq) === s);
  if(dup) return { error: "You already have that sequence, saved as “" + dup.name + "”." };
  const f = { id:uid(), name:name.trim(), kind: FEATURE_KINDS.includes(kind) ? kind : guessKind(name),
              seq:s, note:note || "", created:today() };
  state.features.push(f); save();
  return { feature:f };
}
function delFeature(id){
  state.features = (state.features || []).filter(f => f.id !== id);
  save(); render();
}
/* from the pre-check panel */
function addFeatureFromPanel(){
  const name = val("nf-name").trim(), seq = val("nf-seq"), kind = val("nf-kind");
  if(!name){ toast("Give it a name"); return; }
  const r = addFeature(name, seq, kind);
  if(!r){ toast("Needs a name and a sequence"); return; }
  if(r.error){ alert(r.error); return; }
  // re-run so the new feature shows up immediately in the list they are looking at
  const p = curP();
  if(p && pendingAuto) runAutoAnnotate();
  else render();
  toast("Added “" + r.feature.name + "” - the pre-check will find it from now on");
}
/* from a selection on the map */
function teachFromSelection(){
  const p = curP(); if(!p || sel.start === null || sel.end === null) return;
  const seq = seqOf(p).slice(sel.start, sel.end + 1);
  const hit = (p.ann || []).find(a => a.start === sel.start && a.end === sel.end);
  const name = prompt("What is this? The pre-check will label it with this name on every construct.",
                      hit ? hit.label : "");
  if(!name) return;
  const r = addFeature(name, seq, hit ? hit.kind : null);
  if(r && r.error){ alert(r.error); return; }
  showMenu = false; render();
  toast("Added to your feature library");
}
/* promote an existing annotation straight from the components list */
function teachFromAnnotation(aid){
  const p = curP(); if(!p) return;
  const a = (p.ann || []).find(x => x.id === aid); if(!a) return;
  const r = addFeature(a.label, seqOf(p).slice(a.start, a.end + 1), a.kind);
  if(!r){ toast("Could not add that"); return; }
  if(r.error){ toast(r.error); return; }
  render();
  toast("“" + a.label + "” will now be found automatically");
}
function featureKnown(p, a){
  const s = seqOf(p).slice(a.start, a.end + 1);
  return (state.features || []).some(f => cleanDNA(f.seq) === s);
}

/* ---- the panel inside the pre-check modal ---- */
function featureTeachPanel(){
  const list = state.features || [];
  return `<details class="fold" style="margin-top:14px">
    <summary>Your feature library <span class="muted small">${list.length}</span></summary>
    <div style="padding-top:8px">
      <p class="muted small" style="margin:0 0 10px;line-height:1.55">
        Missing something the pre-check should know? Paste it once and it will be labelled on every construct from
        now on. Both strands are searched, and the match has to be exact.</p>
      <div class="row">
        <div><label class="plain">Name</label>
          <input id="nf-name" placeholder="polyhedrin promoter"></div>
        <div style="max-width:150px"><label class="plain">Kind</label>
          <select id="nf-kind">${FEATURE_KINDS.map(k => `<option value="${k}">${k}</option>`).join("")}</select></div>
      </div>
      <label class="plain">Sequence</label>
      <textarea id="nf-seq" rows="2" placeholder="paste the sequence…"></textarea>
      <div style="margin-top:8px"><button class="primary" onclick="addFeatureFromPanel()">Add and re-check</button></div>
      ${list.length ? `<div style="margin-top:12px">${list.map(f => `<div class="comp">
          <span class="comp-sw" style="background:${CAT_COLOR[f.kind] || "#cfe8ff"}"></span>
          <span class="comp-nm">${esc(f.name)} <span class="muted small">${f.kind} · ${f.seq.length} bp</span></span>
          <button class="comp-x" onclick="delFeature('${f.id}')">✕</button></div>`).join("")}</div>` : ""}
    </div>
  </details>`;
}

/* ---- the fuller editor, on the Parts page ---- */
function featureLibraryPanel(){
  const list = state.features || [];
  return `<div class="panel">
    <div class="lblrow"><h2 style="margin:0">Feature library <span class="muted small">${list.length}</span></h2>
      <button class="primary" onclick="newFeaturePrompt()">＋ Teach a sequence</button></div>
    <p class="muted" style="margin:0 0 10px">What the pre-check looks for, on top of the built-in motifs. Anything
      here is found on every construct you upload.</p>
    ${list.length ? `<div class="scrollx"><table>
      <thead><tr><th>Name</th><th>Kind</th><th>Length</th><th>Sequence</th><th>Added</th><th></th></tr></thead>
      <tbody>${list.map(f => `<tr>
        <td><b>${esc(f.name)}</b>${f.note?`<div class="muted small">${esc(f.note)}</div>`:""}</td>
        <td><span class="pill grey">${esc(f.kind)}</span></td>
        <td class="num">${f.seq.length} bp</td>
        <td class="mono small" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.seq}</td>
        <td class="muted small">${esc(f.created||"")}</td>
        <td style="white-space:nowrap"><button class="ghost" onclick="copyText(${jsq(f.seq)},'Feature')">copy</button>
          <button class="comp-x" onclick="delFeature('${f.id}')">✕</button></td></tr>`).join("")}
      </tbody></table></div>`
      : `<div class="empty"><div class="big">🏷️</div>Empty. The quickest way to fill it: open a construct, select a
          region you have already labelled, and choose <b>Teach the pre-check this</b>.</div>`}
    ${state.parts.length ? `<div style="margin-top:12px">
      <button class="ghost" onclick="teachAllParts()">Teach it every part in the library (${state.parts.length})</button>
      <span class="muted small" style="margin-left:8px">parts become searchable features too</span></div>` : ""}
  </div>`;
}
function newFeaturePrompt(){
  const name = prompt("Name — what should the pre-check call it?");
  if(!name) return;
  const seq = prompt("Sequence");
  if(!seq) return;
  const kind = prompt("Kind (" + FEATURE_KINDS.join(" / ") + ")", guessKind(name)) || "custom";
  const r = addFeature(name, seq, kind);
  if(!r){ alert("Needs a name and a sequence."); return; }
  if(r.error){ alert(r.error); return; }
  render();
}
function teachAllParts(){
  let n = 0, skipped = 0;
  state.parts.forEach(p => {
    const r = addFeature(p.name, p.seq, p.kind);
    if(r && r.feature) n++; else skipped++;
  });
  render();
  toast(n + " added" + (skipped ? ", " + skipped + " already known or too short" : ""));
}
