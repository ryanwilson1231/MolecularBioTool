/* =========================================================================
   THE SHARED SHELF
   Enzymes, oligos and competent cells belong to the lab, not to one person.
   There is no server here, so this does the part that works without one:
   export the reagent layer on its own, and import someone else's by MERGING
   it into yours instead of overwriting. One person can keep the master shelf
   and everyone else stays in sync by re-importing.

   Merge rules, which are also stated in the UI so nobody is surprised:
     enzymes  - keyed by name
     oligos   - keyed by sequence (an oligo is its sequence)
     cells    - keyed by strain + date made
   Where both sides have the same key, the record with the newer `updated`
   timestamp wins. Nothing is ever deleted by an import.
   ========================================================================= */

function stampReagent(r){ r.updated = new Date().toISOString(); if(!r.owner) r.owner = state.lab.me || ""; return r; }
function oligoKey(o){ return cleanDNA(o.seq || ""); }
function cellKey(c){ return (c.strain || "") + "|" + (c.date || ""); }
/* Strictly newer, compared on the timestamp itself. Object identity is not safe
   here: after one merge the local record can BE the imported object. */
function remoteNewer(mine, theirs){ return (theirs.updated || "") > (mine.updated || ""); }

function shelfSnapshot(){
  return {
    kind: "betterbench-shelf",
    v: 1,
    lab: state.lab.labName || "",
    from: state.lab.me || "",
    exported: new Date().toISOString(),
    enzymes: state.reagents.enzymes,
    oligos: state.reagents.oligos,
    cells: state.reagents.cells
  };
}
function exportShelf(){
  const snap = shelfSnapshot();
  const n = Object.keys(snap.enzymes).length + snap.oligos.length + snap.cells.length;
  if(!n){ alert("Nothing on the shelf to share yet."); return; }
  download("shelf-" + (snap.lab || "lab").replace(/[^A-Za-z0-9_.-]/g,"_") + "-" + today() + ".json",
           JSON.stringify(snap, null, 2), "application/json");
  toast("Shelf exported - " + n + " items");
}
/* Returns what a merge would do, without doing it. */
function planShelfMerge(snap){
  const plan = { added:[], updated:[], kept:[], from: snap.from || "someone", lab: snap.lab || "" };
  Object.keys(snap.enzymes || {}).forEach(name => {
    const mine = state.reagents.enzymes[name], theirs = snap.enzymes[name];
    if(!mine) plan.added.push("enzyme " + name);
    else if(remoteNewer(mine, theirs)) plan.updated.push("enzyme " + name);
    else plan.kept.push("enzyme " + name);
  });
  const mineOligo = {}; state.reagents.oligos.forEach(o => mineOligo[oligoKey(o)] = o);
  (snap.oligos || []).forEach(o => {
    const k = oligoKey(o); if(!k) return;
    if(!mineOligo[k]) plan.added.push("oligo " + (o.name || k.slice(0,12)));
    else if(remoteNewer(mineOligo[k], o)) plan.updated.push("oligo " + (o.name || k.slice(0,12)));
    else plan.kept.push("oligo " + (o.name || k.slice(0,12)));
  });
  const mineCell = {}; state.reagents.cells.forEach(c => mineCell[cellKey(c)] = c);
  (snap.cells || []).forEach(c => {
    const k = cellKey(c);
    if(!mineCell[k]) plan.added.push("cells " + c.strain);
    else if(remoteNewer(mineCell[k], c)) plan.updated.push("cells " + c.strain);
    else plan.kept.push("cells " + c.strain);
  });
  return plan;
}
function applyShelfMerge(snap){
  let added = 0, updated = 0;
  Object.keys(snap.enzymes || {}).forEach(name => {
    const mine = state.reagents.enzymes[name], theirs = snap.enzymes[name];
    if(!mine){ state.reagents.enzymes[name] = Object.assign({}, theirs); added++; }
    else if(remoteNewer(mine, theirs)){ state.reagents.enzymes[name] = Object.assign({}, theirs); updated++; }
  });
  const byKey = {}; state.reagents.oligos.forEach(o => byKey[oligoKey(o)] = o);
  (snap.oligos || []).forEach(o => {
    const k = oligoKey(o); if(!k) return;
    const mine = byKey[k];
    if(!mine){ state.reagents.oligos.push(Object.assign({}, o, { id: o.id || uid() })); added++; }
    else if(remoteNewer(mine, o)){ Object.assign(mine, o, { id: mine.id }); updated++; }
  });
  const cKey = {}; state.reagents.cells.forEach(c => cKey[cellKey(c)] = c);
  (snap.cells || []).forEach(c => {
    const mine = cKey[cellKey(c)];
    if(!mine){ state.reagents.cells.push(Object.assign({}, c, { id: c.id || uid() })); added++; }
    else if(remoteNewer(mine, c)){ Object.assign(mine, c, { id: mine.id }); updated++; }
  });
  state.lab.lastMerge = { from: snap.from || "", lab: snap.lab || "", at: new Date().toISOString(), added, updated };
  save();
  return { added, updated };
}
function importShelfFile(input){
  const f = input.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const snap = JSON.parse(r.result);
      if(snap.kind !== "betterbench-shelf") throw new Error("That is not a shelf file. Use Import in the header for a whole workspace.");
      shelfPending = snap;
      render();
    } catch(e){ alert("Could not read that file: " + e.message); }
  };
  r.readAsText(f); input.value = "";
}
let shelfPending = null;
function shelfMergeOverlay(){
  if(!shelfPending) return "";
  const plan = planShelfMerge(shelfPending);
  const list = (title, arr, cls) => arr.length ? `<div style="margin-bottom:10px">
    <h3 style="font-size:12px">${title} <span class="muted small">(${arr.length})</span></h3>
    <div class="muted small" style="line-height:1.6">${arr.slice(0,25).map(esc).join(", ")}${arr.length>25?", …":""}</div>
  </div>` : "";
  return `<div class="modalbg" onclick="if(event.target===this){shelfPending=null;render()}">
    <div class="modal" style="max-width:600px">
      <div class="lblrow"><h2 style="margin:0">Merge ${esc(plan.lab || "a")} shelf</h2>
        <button class="ghost" onclick="shelfPending=null;render()">Close</button></div>
      <p class="muted" style="margin:8px 0 14px">From <b>${esc(plan.from)}</b>, exported
        ${esc((shelfPending.exported||"").slice(0,10))}. Nothing of yours is deleted &mdash; the only records that
        change are ones where their copy is newer than yours.</p>
      ${list("Will be added", plan.added)}
      ${list("Will be updated (theirs is newer)", plan.updated)}
      ${list("Yours is newer, so it stays", plan.kept)}
      ${!plan.added.length && !plan.updated.length
        ? `<div class="note ok">Your shelf is already up to date with this file.</div>` : ""}
      <div style="margin-top:16px;display:flex;gap:8px">
        <button class="primary" onclick="doShelfMerge()">Merge ${plan.added.length + plan.updated.length} change${plan.added.length+plan.updated.length===1?"":"s"}</button>
        <button class="ghost" onclick="shelfPending=null;render()">Cancel</button>
      </div>
    </div></div>`;
}
function doShelfMerge(){
  const res = applyShelfMerge(shelfPending);
  shelfPending = null; render();
  toast(res.added + " added, " + res.updated + " updated");
}

/* ---- the Share tab ---- */
function invShare(){
  const L = state.lab;
  const nEnz = ownedEnzymes().length, nOligo = state.reagents.oligos.length, nCell = state.reagents.cells.length;
  const lm = L.lastMerge;
  return `<div class="panel">
    <h2>Who you are</h2>
    <p class="muted" style="margin:0 0 10px">Used to stamp the reagents you log, so a shared shelf shows who added what.</p>
    <div class="row">
      <div><label>Your initials</label>
        <input value="${esc(L.me||"")}" placeholder="RW" oninput="state.lab.me=this.value;save()"></div>
      <div><label>Lab name</label>
        <input value="${esc(L.labName||"")}" placeholder="Brohawn lab" oninput="state.lab.labName=this.value;save()"></div>
    </div>
  </div>
  <div class="panel">
    <h2>Share the shelf</h2>
    <p class="muted" style="margin:0 0 10px">Enzymes, oligos and competent cells are shared property in most labs.
      This exports just that layer &mdash; not your constructs, not your notes &mdash; so you can hand it to someone
      else, or keep one master copy everyone re-imports.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="primary" onclick="exportShelf()">Export shelf</button>
      <button class="ghost" onclick="document.getElementById('shelfFile').click()">Import &amp; merge a shelf</button>
      <input type="file" id="shelfFile" accept=".json,application/json" style="display:none" onchange="importShelfFile(this)">
      <span class="muted small">${nEnz} enzymes · ${nOligo} oligos · ${nCell} cell batches</span>
    </div>
    ${lm ? `<div class="note ok" style="margin-top:12px">Last merged from <b>${esc(lm.from||"someone")}</b> on
      ${esc(lm.at.slice(0,10))} &mdash; ${lm.added} added, ${lm.updated} updated.</div>` : ""}
    <div class="note info" style="margin-top:12px"><b>How merging decides.</b>
      Enzymes match on name, oligos on sequence, cells on strain and date. Where both of you have the same item,
      whichever was edited most recently wins. Nothing you have is ever deleted by an import, and you see the full
      list of changes before anything is applied.</div>
    <div class="note" style="margin-top:10px"><b>What this is not.</b> It is a file you pass around, not live sync.
      Two people editing at once will each keep their own newest copy of a conflicting item, and neither will know.
      Real-time sharing needs a server &mdash; see the note below for what that would take.</div>
  </div>
  <div class="panel">
    <h2>Making this genuinely multi-user</h2>
    <p class="muted" style="margin:0 0 10px">Three routes, in increasing order of effort. The data model here is
      already shaped for all three: every reagent carries an owner and a last-edited timestamp, and the merge is
      a pure function you can reuse.</p>
    <div class="scrollx"><table>
      <thead><tr><th>Route</th><th>What you get</th><th>What it costs</th></tr></thead><tbody>
        <tr><td class="lead">A shared file<small>today</small></td>
          <td>One shelf file in a Dropbox/OneDrive/Drive folder. Everyone imports; the shelf owner exports.</td>
          <td>Nothing. Manual, and last-writer-wins on conflicts.</td></tr>
        <tr><td class="lead">A folder the app watches<small>a weekend</small></td>
          <td>File System Access API: pick the shared file once, and the app reads and writes it automatically.
            Feels close to sync for a lab that already shares a drive.</td>
          <td>Chromium-only, and the browser asks permission each session.</td></tr>
        <tr><td class="lead">A real backend<small>the honest answer</small></td>
          <td>Accounts, a lab, live updates, an audit trail of who took the last of the BsaI. Extends naturally to
            consumables and ordering.</td>
          <td>Hosting, auth, a database, and someone to run it. Supabase or PocketBase makes this days, not months.</td></tr>
      </tbody></table></div>
  </div>`;
}
