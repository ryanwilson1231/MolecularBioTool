/* =========================================================================
   STRUCTURE LADDER
   Evidence first, prediction last:
     1. an experimental structure of this exact protein
     2. a curated predicted model (AlphaFold) of this exact protein
     3. an experimental structure of a close relative, as a stand-in
     4. only then, fold it de novo
   All four steps hit public APIs from the browser, so all four need network.
   ========================================================================= */

const RCSB_SEARCH = "https://search.rcsb.org/rcsbsearch/v2/query";

function rcsbBody(seq, identity, content, rows){
  return JSON.stringify({
    query: { type:"terminal", service:"sequence",
      parameters:{ evalue_cutoff:0.1, identity_cutoff:identity, sequence_type:"protein", value:seq } },
    request_options: { paginate:{ start:0, rows: rows || 10 },
      results_content_type: content, results_verbosity:"verbose" },
    return_type:"polymer_entity"
  });
}
/* RCSB answers 204 No Content when nothing matches, so this never assumes JSON */
async function rcsbSequenceSearch(seq, identity, content, rows){
  const r = await fetch(RCSB_SEARCH, { method:"POST",
    headers:{ "Content-Type":"application/json" }, body: rcsbBody(seq, identity, content, rows) });
  if(r.status === 204) return [];
  if(!r.ok) throw new Error("RCSB search returned " + r.status);
  const j = await r.json();
  return (j.result_set || []).map(h => {
    let mc = {};
    try { mc = h.services[0].nodes[0].match_context[0] || {}; } catch(e){}
    const qlen = mc.query_length || seq.length;
    return {
      id: h.identifier,
      identity: mc.sequence_identity != null ? mc.sequence_identity : null,
      coverage: mc.alignment_length ? Math.min(1, mc.alignment_length / qlen) : null,
      evalue: mc.evalue, mismatches: mc.mismatches, gaps: mc.gaps_opened,
      alignedLen: mc.alignment_length
    };
  });
}
/* one entry's title / method / resolution, and which protein it is */
async function rcsbEntryInfo(entityId){
  const parts = String(entityId).split("_");
  const out = { entry: parts[0], ent: parts[1] || "1" };
  try {
    const r = await fetch("https://data.rcsb.org/rest/v1/core/entry/" + out.entry);
    if(r.ok){
      const j = await r.json();
      out.title = (j.struct || {}).title;
      out.method = ((j.exptl || [])[0] || {}).method;
      const res = (j.rcsb_entry_info || {}).resolution_combined;
      out.resolution = res && res.length ? res[0] : null;
    }
  } catch(e){}
  try {
    const r = await fetch("https://data.rcsb.org/rest/v1/core/polymer_entity/" + out.entry + "/" + out.ent);
    if(r.ok){
      const j = await r.json();
      out.name = (j.rcsb_polymer_entity || {}).pdbx_description;
      out.uniprot = ((j.rcsb_polymer_entity_container_identifiers || {}).uniprot_ids || [])[0];
      out.organism = (((j.rcsb_entity_source_organism || [])[0]) || {}).ncbi_scientific_name;
    }
  } catch(e){}
  return out;
}
/* AlphaFold entries come back as AF_AF<accession>F<fragment>_<entity> */
function afAccession(id){ const m = String(id).match(/AF_AF([A-Z0-9]+)F\d+/i); return m ? m[1] : null; }

async function runStructureSearch(aa){
  aa = cleanAA(aa || "").replace(/\*/g, "");
  proteinState.search = { running:true, aa, steps:[], results:[], error:null, picked:null };
  render();
  const step = (t, s) => { proteinState.search.steps.push({ t, s }); render(); };
  try {
    if(aa.length < 25) throw new Error("Sequence is only " + aa.length +
      " residues. The structure search needs at least 25 to mean anything.");

    const results = [];
    step("Searching the PDB for this exact sequence", "run");
    const pair = await Promise.all([
      rcsbSequenceSearch(aa, 0.95, ["experimental"], 10).catch(e => ({ err:e.message })),
      rcsbSequenceSearch(aa, 0.95, ["computational"], 4).catch(() => [])
    ]);
    proteinState.search.steps.pop();
    const exact = pair[0], computed = pair[1];
    if(exact && exact.err){
      step("PDB search failed: " + exact.err, "bad");
    } else {
      step(exact.length ? exact.length + " experimental structure" + (exact.length===1?"":"s") + " at 95% identity or better"
                        : "No experimental structure at 95% identity or better", exact.length ? "good" : "none");
      for(const h of exact.slice(0, 6)){
        const info = await rcsbEntryInfo(h.id);
        results.push(Object.assign({ kind:"experimental" }, h, info));
      }
    }
    step(computed.length ? computed.length + " curated model for the same sequence"
                         : "No curated model for this sequence", computed.length ? "good" : "none");
    for(const h of computed.slice(0, 3)){
      const acc = afAccession(h.id);
      results.push(Object.assign({ kind:"predicted", accession:acc,
        title:"AlphaFold model" + (acc ? " " + acc : "") }, h));
    }
    if(!results.length){
      step("Looking for a close relative to stand in", "run");
      const homo = await rcsbSequenceSearch(aa, 0.3, ["experimental"], 8).catch(() => []);
      proteinState.search.steps.pop();
      step(homo.length ? homo.length + " related structure" + (homo.length===1?"":"s") + " between 30% and 95% identity"
                       : "No related structure above 30% identity", homo.length ? "warn" : "none");
      for(const h of homo.slice(0, 5)){
        const info = await rcsbEntryInfo(h.id);
        results.push(Object.assign({ kind:"homolog" }, h, info));
      }
    }
    // rank by evidence class first, then by how much of your sequence is actually covered
    const rank = r => (r.kind === "experimental" ? 2 : r.kind === "predicted" ? 1 : 0) * 10
                    + (r.identity || 0) * (r.coverage || 0) * 5;
    results.sort((a,b) => rank(b) - rank(a));
    proteinState.search.results = results;
    proteinState.search.running = false;
    if(!results.length)
      step("Nothing in the PDB resembles this, so a de novo prediction is what is left", "warn");
    render();
    if(results.length) showCandidate(0);
  } catch(e){
    proteinState.search.running = false;
    proteinState.search.error = e.message;
    render();
  }
}
async function showCandidate(i){
  const S = proteinState.search; if(!S) return;
  const c = (S.results || [])[i]; if(!c) return;
  S.picked = i;
  // render first: a re-render replaces #viewer3d, which would throw the model away
  render();
  const say = h => { const el = document.getElementById("struct-status"); if(el) el.innerHTML = h; };
  try {
    if(c.kind === "predicted"){
      say("Fetching the AlphaFold model for " + esc(c.accession) + "…");
      const r = await fetch("https://alphafold.ebi.ac.uk/api/prediction/" + encodeURIComponent(c.accession));
      if(!r.ok) throw new Error("AlphaFold has no model for " + c.accession);
      const j = await r.json();
      const url = (j[0] || {}).pdbUrl || (j[0] || {}).cifUrl;
      const data = await (await fetch(url)).text();
      showStructure(data, url.endsWith(".cif") ? "cif" : "pdb", true);
      say("AlphaFold model <b>" + esc(c.accession) + "</b>, coloured by pLDDT &middot; " +
        '<a href="https://alphafold.ebi.ac.uk/entry/' + encodeURIComponent(c.accession) +
        '" target="_blank" rel="noopener">AlphaFold DB &#9656;</a>');
    } else {
      say("Fetching " + esc(c.entry) + " from the PDB…");
      const r = await fetch("https://files.rcsb.org/download/" + c.entry + ".pdb");
      if(!r.ok) throw new Error("Could not download " + c.entry);
      showStructure(await r.text(), "pdb", false);
      say("<b>" + esc(c.entry) + "</b> &middot; " + esc(c.method || "experimental") +
        (c.resolution ? " at " + c.resolution + " Å" : "") +
        (c.identity != null ? " &middot; " + Math.round(c.identity*100) + "% identical to your sequence" : "") +
        ' &middot; <a href="https://www.rcsb.org/structure/' + esc(c.entry) +
        '" target="_blank" rel="noopener">RCSB &#9656;</a>');
    }
  } catch(e){ say("Could not load that structure: " + esc(e.message)); }
}
function structureLadder(aa){
  const S = proteinState.search;
  if(!S) return "";
  const icon = s => s === "good" ? '<span class="pill green">found</span>'
    : s === "warn" ? '<span class="pill amber">partial</span>'
    : s === "bad" ? '<span class="pill red">failed</span>'
    : s === "run" ? '<span class="pill blue">…</span>' : '<span class="pill grey">none</span>';
  const rows = (S.results || []).map((c,i) => {
    const pick = i === S.picked;
    const badge = c.kind === "experimental" ? '<span class="pill green">experimental</span>'
      : c.kind === "predicted" ? '<span class="pill blue">predicted</span>'
      : '<span class="pill amber">relative</span>';
    return `<div class="candrow ${pick?"on":""}" onclick="showCandidate(${i})" tabindex="0"
        onkeydown="if(event.key==='Enter')showCandidate(${i})">
      <div style="flex:1;min-width:0">
        <div><b>${esc(c.entry || c.accession || c.id)}</b> ${badge}
          ${c.identity != null ? `<span class="muted small">${Math.round(c.identity*100)}% identity${
            c.coverage != null ? ", covering " + Math.round(c.coverage*100) + "% of your sequence" : ""}</span>` : ""}</div>
        <div class="muted small candsub">${esc(c.name || c.title || "")}${c.organism ? " · " + esc(c.organism) : ""}${
          c.method ? " · " + esc(c.method) + (c.resolution ? " " + c.resolution + " Å" : "") : ""}</div>
      </div>
      <button class="ghost">${pick ? "shown" : "show"}</button>
    </div>`;
  }).join("");
  const nothing = !S.running && !(S.results||[]).length && !S.error;
  return `<div class="panel">
    <div class="lblrow"><h2 style="margin:0">Structure search</h2>
      ${S.running ? '<span class="muted small">searching…</span>'
        : '<button class="ghost" onclick="proteinState.search=null;render()">Clear</button>'}</div>
    <div class="ladder">
      ${(S.steps||[]).map(s => `<div class="lrow">${icon(s.s)}<span>${esc(s.t)}</span></div>`).join("")}
    </div>
    ${S.error ? `<div class="note warn">${esc(S.error)}</div>` : ""}
    ${rows ? `<div style="margin-top:10px">${rows}</div>` : ""}
    ${(S.results||[]).some(c => c.kind === "homolog") ? `<div class="note" style="margin-top:10px">
      These are <b>relatives</b>, not your protein. The fold is usually right; loops, side chains and anything
      near a mutation are not. Check the identity and coverage before you reason from one.</div>` : ""}
    ${nothing ? `<div class="note" style="margin-top:10px">
      Nothing in the PDB matches. Folding it from scratch is what is left — useful, but a prediction.
      <div style="margin-top:8px"><button class="primary" onclick="foldWithESM(${jsq(aa)})">Predict with ESMFold</button></div>
    </div>` : ""}
  </div>`;
}
