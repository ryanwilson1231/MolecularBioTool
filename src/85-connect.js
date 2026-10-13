/* ===================== VIEW: connect ===================== */
const SIGNAL_STAGES = ["planning","building","characterising","stuck","shelved"];
let connectTab = "matches";

function sharedParts(){
  const ids = new Set(state.plasmids.filter(p => state.connect.optIn[p.id]).map(p => p.id));
  return state.parts.filter(p => !p.sourceId || ids.has(p.sourceId));
}
function myTags(){
  const t = new Set();
  state.plasmids.filter(p => state.connect.optIn[p.id]).forEach(p => featureTags(p).forEach(x => t.add(x)));
  sharedParts().forEach(p => { t.add(p.name); (p.tags||[]).forEach(x => t.add(x)); });
  state.signals.filter(s => s.share).forEach(s => (s.tags||[]).forEach(x => t.add(x)));
  return [...t].filter(Boolean);
}

function viewConnect(){
  const c = state.connect;
  if(!c.enabled) return connectIntro();
  const tabs = [["matches","Matches"],["signals","What you're working on"],["sharing","What you share"],["crowd","Where the crowd is"]]
    .map(([k,l]) => `<button class="${connectTab===k?"on":""}" onclick="connectTab='${k}';render()">${l}</button>`).join("");
  const shared = state.plasmids.filter(p => c.optIn[p.id]);
  let body = "";
  if(connectTab === "matches")      body = connectMatches(shared);
  else if(connectTab === "signals") body = connectSignals();
  else if(connectTab === "sharing") body = connectSharing();
  else                              body = connectCrowd();
  return `<h1 class="page">Connect</h1>
  <p class="lede">Opt-in matching on what you are building right now, not on what you have published.
  ${shared.length} of ${state.plasmids.length} constructs and ${state.signals.filter(s=>s.share).length} of
  ${state.signals.length} notes are shared.</p>
  <div class="toggle" style="margin-bottom:14px">${tabs}</div>
  ${body}
  <div class="panel">
    <div class="lblrow"><h2 style="margin:0">Profile</h2>
      <button class="ghost danger" onclick="connectOff()">Turn off &amp; clear</button></div>
    <div class="grid2">
      <div><label class="plain">Name (or a pseudonym)</label>
        <input value="${esc(c.name)}" oninput="state.connect.name=this.value;save()"></div>
      <div><label class="plain">Group / institution</label>
        <input value="${esc(c.org)}" oninput="state.connect.org=this.value;save()"></div>
      <div><label class="plain">Contact — shown only after both sides accept</label>
        <input value="${esc(c.contact)}" oninput="state.connect.contact=this.value;save()"></div>
      <div><label class="plain">What you would want to hear about</label>
        <input value="${esc(c.topics)}" placeholder="anything expressing LRRC8 in HEK" oninput="state.connect.topics=this.value;save()"></div>
    </div>
  </div>`;
}
function connectOff(){
  if(!confirm("Turn Connect off and clear the profile? Your signals stay, but stop being shared.")) return;
  state.signals.forEach(s => s.share = false);
  state.connect = { enabled:false, name:"", org:"", contact:"", topics:"", shareMode:"features", optIn:{} };
  save(); render();
}
function connectIntro(){
  return `<h1 class="page">Connect</h1>
  <p class="lede">An opt-in way to find the other groups working on what you are working on — before one of you
  reads about it in a journal.</p>
  <div class="panel">
    <h2>Why this exists</h2>
    <p class="muted" style="line-height:1.65">Labs routinely discover, at publication, that another group spent two
      years on the same question. The information that would have prevented it — “we are building a tagged version of
      this gene” — is not something anyone writes a preprint about. It lives in plasmid maps and in the sentence you
      would say to a colleague at coffee.</p>
    <p class="muted" style="line-height:1.65">The other half of the idea is that the useful connection is often a
      <i>small</i> one. Not “we both study ion channels”, but “you also fought with a construct that has a 40 bp repeat
      and an ORF that is toxic in E. coli”. Those are the matches that save a month, and no platform surfaces them.</p>
    <h2 style="margin-top:18px">How matching works here</h2>
    <ul class="muted" style="line-height:1.7;padding-left:18px">
      <li><b>Feature mode (default):</b> only the <i>names</i> of your parts and annotations leave — “EGFP”,
        “U6 promoter”, “LRRC8A”. No sequence at all.</li>
      <li><b>Sketch mode:</b> adds a MinHash sketch — 128 hashed 21-mers — which supports similarity estimation
        without shipping the sequence. Be clear-eyed: a sketch is a reduction, not encryption. Someone who already
        suspects a specific sequence can test that guess against it.</li>
      <li>Sharing is <b>per construct and per note</b>. Nothing is shared until you tick it.</li>
    </ul>
    <div class="note info">This build has no server. Matching runs against a small demo registry bundled in the file,
      so you can judge the behaviour before deciding whether the idea deserves a backend.</div>
    <div style="margin-top:16px"><button class="primary" onclick="state.connect.enabled=true;save();render()">Turn on Connect</button></div>
  </div>`;
}

/* ---- matches ---- */
function connectMatches(shared){
  const tags = myTags();
  const matches = DEMO_REGISTRY.map(g => Object.assign({ g }, tagOverlap(tags, g.tags)))
    .filter(m => m.inter > 0).sort((a,b) => b.score - a.score || b.inter - a.inter);
  // the sharper signal: a group matching something you are actively working on
  const activeTags = new Set(state.signals.filter(s => s.share && s.stage !== "shelved")
    .flatMap(s => (s.tags||[]).map(t => t.toLowerCase())));
  return `<div class="panel">
    <h2>Groups working on overlapping things</h2>
    ${!shared.length && !activeTags.size
      ? `<div class="empty"><div class="big">🔗</div>Nothing shared yet — tick a construct under
          <b>What you share</b>, or post a note about what you are building.</div>`
      : matches.length ? matches.map(m => {
        const live = m.shared.filter(s => activeTags.has(s));
        return `<div class="matchrow">
          <div style="flex:1">
            <div><b>${esc(m.g.label)}</b>
              <span class="muted small"> · ${esc(m.g.field)} · ${esc(m.g.org)} · ${m.g.members} people · active ${esc(m.g.active)}</span>
              ${live.length ? `<span class="pill red">overlaps live work</span>` : ""}</div>
            <div class="muted small" style="margin-top:3px">shares ${m.inter} item${m.inter===1?"":"s"}:
              ${m.shared.map(s => `<span class="pill ${activeTags.has(s)?"red":"grey"}">${esc(s)}</span>`).join(" ")}</div>
            <div class="bar" style="margin-top:6px;max-width:240px"><i style="width:${Math.round(m.score*100)}%"></i></div>
          </div>
          <button class="ghost" onclick="requestIntro(${jsq(m.g.label)})">Request intro</button>
        </div>`;
      }).join("") : `<div class="muted">No overlap with the demo registry yet. Harvest some parts, or add tags to a note.</div>`}
    <div class="note info" style="margin-top:12px">Matches rank on shared parts, not on field. Group G overlaps with
      Group A on a single gene while working on a completely different question — that is exactly the connection the
      literature-based route misses.</div>
  </div>`;
}
function requestIntro(who){
  alert("In a deployed version this sends " + who + " a request to introduce.\n\n" +
    "Both sides have to accept before contact details are exchanged, and either side can decline without the other " +
    "being told which construct or note matched.");
}

/* ---- signals: the informal, pre-preprint layer ---- */
function connectSignals(){
  const ss = state.signals.slice().sort((a,b) => (b.date||"").localeCompare(a.date||""));
  return `<div class="panel">
    <div class="lblrow"><h2 style="margin:0">What you're working on</h2>
      <button class="primary" onclick="addSignal()">＋ Post a note</button></div>
    <p class="muted" style="margin:0 0 10px">One or two sentences, less formal than a preprint and far less formal
      than a paper — the thing you would say to someone at a poster. A note carries tags, and the tags are what
      match. Nothing is shared unless you tick it.</p>
    ${ss.length ? ss.map(s => `<div class="sidecard" style="margin-bottom:10px">
      <div class="lblrow">
        <div><span class="pill ${s.stage==="stuck"?"red":s.stage==="building"?"blue":s.stage==="shelved"?"grey":"green"}">${esc(s.stage)}</span>
          <span class="muted small" style="margin-left:6px">${esc(s.date)}</span></div>
        <div><label class="plain" style="display:inline-flex;gap:6px;align-items:center;text-transform:none;margin:0">
            <input type="checkbox" style="width:auto" ${s.share?"checked":""} onchange="toggleSignal('${s.id}',this.checked)">
            <span class="small">share</span></label>
          <button class="comp-x" onclick="delSignal('${s.id}')">✕</button></div>
      </div>
      <div style="margin-top:8px;line-height:1.55">${esc(s.text)}</div>
      <div style="margin-top:8px">${(s.tags||[]).map(t => `<span class="pill grey">${esc(t)}</span>`).join(" ")}</div>
    </div>`).join("") : `<div class="empty"><div class="big">📌</div>No notes yet.</div>`}
    <div class="note">A "stuck" note is the most valuable thing on this page and the hardest to post. It is also the
      one most likely to be answered in a day by someone who has already solved it.</div>
  </div>`;
}
function addSignal(){
  const text = prompt("What are you working on? One or two sentences.");
  if(!text) return;
  const stage = prompt("Stage: " + SIGNAL_STAGES.join(" / "), "building");
  const suggested = myTags().slice(0,4).join(", ");
  const tags = (prompt("Tags, comma separated (genes, parts, methods)", suggested) || "")
    .split(",").map(t => t.trim()).filter(Boolean);
  state.signals.push({ id:uid(), text, stage: SIGNAL_STAGES.includes(stage) ? stage : "building",
                       tags, date:today(), share:false });
  save(); render();
}
function toggleSignal(id, v){ const s = state.signals.find(x => x.id === id); if(s){ s.share = v; save(); render(); } }
function delSignal(id){ state.signals = state.signals.filter(s => s.id !== id); save(); render(); }

/* ---- sharing controls ---- */
function connectSharing(){
  const c = state.connect;
  const dnaP = state.plasmids.filter(p => p.type === "dna" && seqOf(p).length > 100);
  const sk = dnaP.map(p => ({ p, s: minhash(seqOf(p), 21, 128) }));
  const pairs = [];
  for(let i=0;i<sk.length;i++) for(let j=i+1;j<sk.length;j++){
    const v = jaccardFromSketch(sk[i].s, sk[j].s);
    if(v > 0.01) pairs.push({ a:sk[i].p, b:sk[j].p, v });
  }
  pairs.sort((x,y) => y.v - x.v);
  return `<div class="panel">
    <h2>Sharing mode</h2>
    <div class="toggle">
      <button class="${c.shareMode==='features'?'on':''}" onclick="state.connect.shareMode='features';save();render()">Names only</button>
      <button class="${c.shareMode==='sketch'?'on':''}" onclick="state.connect.shareMode='sketch';save();render()">Names + sequence sketch</button>
    </div>
    <div class="muted small" style="margin-top:6px">${c.shareMode === "features"
      ? "Only part and annotation labels would leave this browser. Safest, and enough to find most overlaps."
      : "A 128-value MinHash sketch of 21-mers would leave as well. Better matching on unpublished sequence."}</div>
    ${c.shareMode === "sketch" ? `<div class="note">A sketch narrows what a stranger can learn but does not stop a
      targeted guess: anyone who already has a candidate sequence can test it against yours. Use names-only for
      anything genuinely sensitive.</div>` : ""}
  </div>
  <div class="panel">
    <h2>Constructs</h2>
    ${state.plasmids.map(p => `<label class="plain" style="display:flex;gap:9px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line2);text-transform:none">
      <input type="checkbox" style="width:auto" ${c.optIn[p.id]?"checked":""} onchange="state.connect.optIn['${p.id}']=this.checked;save();render()">
      <span style="flex:1"><b>${esc(p.name)}</b>
        <span class="muted small"> · ${featureTags(p).slice(0,5).join(", ") || "no labelled features yet"}</span></span>
      ${c.optIn[p.id] ? `<span class="pill blue">${c.shareMode === "sketch" ? "names + sketch" : "names"}</span>` : ""}
    </label>`).join("")}
  </div>
  <div class="panel">
    <h2>What a sketch actually reveals</h2>
    <p class="muted" style="margin:0 0 8px">Real MinHash over 21-mers, computed here on your own constructs. This is
      the same maths the matching would use — run it to see what a sketch does and does not give away.</p>
    ${pairs.length ? pairs.slice(0,8).map(x => `<div class="matchrow">
      <div style="flex:1"><div class="small">${esc(x.a.name)} ↔ ${esc(x.b.name)}</div>
        <div class="bar" style="margin-top:5px"><i style="width:${Math.round(x.v*100)}%"></i></div></div>
      <b style="font-size:12px">${(x.v*100).toFixed(1)}%</b></div>`).join("")
      : `<div class="muted small">Add a second DNA construct to compare.</div>`}
  </div>`;
}

/* ---- crowding ---- */
function connectCrowd(){
  const fields = {};
  DEMO_REGISTRY.forEach(g => fields[g.field] = (fields[g.field]||0) + g.members);
  const maxF = Math.max(...Object.values(fields));
  // how contested is each thing you work on?
  const tags = myTags();
  const crowding = tags.map(t => {
    const hits = DEMO_REGISTRY.filter(g => g.tags.some(x => x.toLowerCase() === t.toLowerCase()));
    return { t, n: hits.length, people: hits.reduce((s,g) => s + g.members, 0), groups: hits.map(g => g.label) };
  }).filter(x => x.n > 0).sort((a,b) => b.people - a.people);
  return `<div class="grid2">
    <div class="panel">
      <h2>How contested is your work?</h2>
      ${crowding.length ? `<div class="scrollx"><table>
        <thead><tr><th>What you work on</th><th>Groups</th><th>People</th><th>Read</th></tr></thead><tbody>
        ${crowding.map(x => `<tr><td><b>${esc(x.t)}</b></td><td>${x.n}</td><td>${x.people}</td>
          <td><span class="pill ${x.people>=10?"red":x.people>=5?"amber":"green"}">${
            x.people>=10 ? "crowded — expect to be scooped" : x.people>=5 ? "active" : "quiet — nobody is checking your work"
          }</span></td></tr>`).join("")}
        </tbody></table></div>` : `<div class="muted small">Share a construct or tag a note to see this.</div>`}
      <div class="note info" style="margin-top:10px">A quiet row is not automatically good news. It means no one will
        duplicate you, and also that no one will independently confirm you.</div>
    </div>
    <div class="panel">
      <h2>Where the crowd is</h2>
      <p class="muted" style="margin:0 0 10px">Density of the demo registry by area.</p>
      ${Object.keys(fields).sort((a,b) => fields[b]-fields[a]).map(f => `
        <div style="margin-bottom:9px">
          <div class="lblrow" style="font-size:12px"><span>${esc(f)}</span><span class="muted">${fields[f]}</span></div>
          <div class="bar"><i style="width:${fields[f]/maxF*100}%"></i></div></div>`).join("")}
    </div>
  </div>`;
}
