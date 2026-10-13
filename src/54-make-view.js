/* ===================== VIEW: "how do I make this?" ===================== */
let makeFor = null, makePick = 0, makeCache = null;

function openMake(pid){
  const p = state.plasmids.find(x => x.id === pid); if(!p) return;
  makeFor = pid; makePick = 0;
  makeCache = makePlan(p, { polymerase: defaultPolymerase(),
                            targetTa: (state.lab && state.lab.targetTa) || 60 });
  render();
}
function closeMake(){ makeFor = null; makeCache = null; render(); }

function makeOverlay(){
  if(!makeFor || !makeCache) return "";
  const p = state.plasmids.find(x => x.id === makeFor);
  if(!p) return "";
  const plan = makeCache;
  if(plan.error)
    return modalShell(p, `<div class="note warn">${esc(plan.error)}</div>`);

  const r = plan.routes[makePick] || plan.routes[0];
  const money = c => c == null ? "—" : moneyStr(c);
  const cards = plan.routes.map((x, i) => `
    <div class="routecard ${x === r ? "on" : ""} ${x.blockers.length ? "blocked" : ""}"
         onclick="makePick=${i};render()" tabindex="0" onkeydown="if(event.key==='Enter'){makePick=${i};render()}">
      <div class="lblrow"><b>${esc(x.title)}</b>
        ${x.key === "have" ? '<span class="pill green">done</span>'
          : x.blockers.length ? '<span class="pill amber">blocked</span>' : ""}</div>
      <div class="muted small" style="margin-top:5px">${esc(x.why)}</div>
      ${x.key === "have" ? "" : `<div class="muted small" style="margin-top:7px">
        ${x.effortDays == null ? "effort varies" : "≈ " + x.effortDays + " days"} · ${money(x.cost)}</div>`}
    </div>`).join("");

  return modalShell(p, `
    ${plan.haveIt ? `<div class="note ok">You already have this. ${stockTotal(p).toFixed(1)} µg logged${
      plan.haveIt[0].loc ? " in " + esc(plan.haveIt[0].loc) : ""}.</div>` : ""}
    ${plan.relatives.length ? `<div class="muted small" style="margin:4px 0 12px">
      Closest thing you own: <b>${esc(plan.relatives[0].parent.name)}</b>,
      ${Math.round(plan.relatives[0].diff.identity * 100)}% of this target matched${
        plan.relatives[0].hasStock ? "" : " — though it has never been made"}.</div>`
      : `<div class="note" style="margin-bottom:12px">Nothing in your workspace resembles this, so there is no
         template to build from. Ordering it is the only route.</div>`}
    ${plan.missing ? `<div class="note" style="margin-bottom:12px">
      <b>A cheaper route is one step away.</b> ${esc(plan.missing.route.title)} would cost about
      ${moneyStr(plan.missing.route.cost)}${plan.missing.days > 0 ? " and save " + plan.missing.days + " days" : ""},
      but ${esc(plan.missing.route.blockers.join(" "))}
      ${(plan.missing.route.needs || []).length
        ? `<div style="margin-top:8px">${plan.missing.route.needs.map(n =>
            `<button class="ghost" onclick="openMake('${n.id}')">How to make ${esc(n.name)} →</button>`).join(" ")}</div>` : ""}
    </div>` : ""}
    <div class="routegrid">${cards}</div>
    ${makeRouteDetail(p, r)}
  `);
}
function modalShell(p, body){
  return `<div class="modalbg" onclick="if(event.target===this)closeMake()">
    <div class="modal" style="max-width:860px">
      <div class="lblrow"><h2 style="margin:0">How to make ${esc(p.name)}</h2>
        <button class="ghost" onclick="closeMake()">Close</button></div>
      <p class="muted small" style="margin:6px 0 14px">${bp(seqOf(p).length)} ·
        ${(p.parents || []).length ? "recorded as made from " + p.parents.map(x => esc(x.name)).join(" + ")
          : esc(p.source || "no recorded origin")}</p>
      ${body}
    </div></div>`;
}
function makeRouteDetail(p, r){
  if(!r) return "";
  const blockers = r.blockers.length
    ? `<div class="note warn"><b>You are missing something.</b><br>${r.blockers.map(esc).join("<br>")}</div>` : "";
  let extra = "";

  if(r.key === "mutate" && r.design){
    const d = r.design;
    extra = `<h3 style="margin-top:14px">Primers</h3>
      <div class="scrollx"><table>
        <thead><tr><th>Primer</th><th>Sequence (5'→3')</th><th>Len</th><th>Tm</th><th></th></tr></thead>
        <tbody>${[d.fwd, d.rev].map(x => `<tr><td><b>${esc(x.name)}</b></td>
          <td class="mono" style="word-break:break-all;max-width:330px">${x.tail ? `<span class="muttail">${x.tail}</span>` : ""}${x.anneal}</td>
          <td class="num">${x.len}</td><td class="num">${x.tm} °C</td>
          <td><button class="ghost" onclick="copyText('${x.full}','Primer')">copy</button></td></tr>`).join("")}
        </tbody></table></div>
      <div class="muted small" style="margin-top:6px">Anneal at <b>${d.ta} °C</b> with
        ${esc(polymerase(d.polymerase).label)}.</div>
      ${d.warnings.length ? `<div class="note warn" style="margin-top:8px">${d.warnings.map(esc).join("<br>")}</div>` : ""}
      <div style="margin-top:10px"><button class="ghost" onclick="openMakeInMutate()">Open in Point mutation →</button></div>`;
  }
  if(r.key === "clone" && r.replacement){
    const q = r.replacement;
    const rows = [q.bbF, q.bbR].concat(q.insF ? [q.insF, q.insR] : []);
    extra = `<h3 style="margin-top:14px">Primers</h3>
      <div class="scrollx"><table>
        <thead><tr><th>Primer</th><th>Sequence (5'→3')</th><th>Len</th><th>Tm</th><th></th></tr></thead>
        <tbody>${rows.map(x => `<tr><td><b>${esc(x.name)}</b></td>
          <td class="mono" style="word-break:break-all;max-width:330px">${x.tail ? `<span class="muttail">${x.tail}</span>` : ""}${x.anneal}</td>
          <td class="num">${x.len}</td><td class="num">${x.tm} °C</td>
          <td><button class="ghost" onclick="copyText('${x.full}','Primer')">copy</button></td></tr>`).join("")}
        </tbody></table></div>
      <div class="muted small" style="margin-top:6px">Orange is homology to the backbone, not template.
        Anneal at <b>${q.ta} °C</b>.</div>
      ${q.src.how === "order" ? `<h3 style="margin-top:14px">Fragment to order — ${bp(q.ordered.length)}</h3>
        <div class="seqbox">${q.ordered.match(/.{1,60}/g).slice(0,4).join("\n")}${q.ordered.length > 240 ? "\n… " + (q.ordered.length - 240) + " more bp" : ""}</div>
        <div style="margin-top:8px"><button class="ghost" onclick="copyText(${jsq(q.ordered)},'Fragment')">Copy</button></div>` : ""}`;
  }
  if(r.key === "order" && r.report){
    extra = `<h3 style="margin-top:14px">Synthesis check</h3>
      ${r.report.flags.map(f => `<div class="${f.lvl === "ok" ? "note ok" : "note"}">${esc(f.t)}</div>`).join("")}
      <div style="margin-top:10px"><button class="ghost" onclick="copyText(${jsq(seqOf(p))},'Sequence')">Copy the full sequence</button></div>`;
  }
  if(r.key === "complex" && r.diff){
    extra = `<h3 style="margin-top:14px">What differs</h3>
      <div class="scrollx"><table><thead><tr><th>At</th><th>In ${esc(r.parent.name)}</th><th>In this construct</th></tr></thead>
      <tbody>${r.diff.gaps.slice(0, 12).map(g => `<tr>
        <td class="num">${g.pStart + 1}</td>
        <td class="mono small">${g.pLen ? (g.pLen > 24 ? bp(g.pLen) : esc(g.pSeq)) : "—"}</td>
        <td class="mono small">${g.tLen ? (g.tLen > 24 ? bp(g.tLen) : esc(g.tSeq)) : "—"}</td></tr>`).join("")}
      </tbody></table></div>
      <div style="margin-top:10px"><button class="ghost" onclick="closeMake();go('design')">Build it from parts →</button></div>`;
  }
  return `<div class="panel" style="margin:14px 0 0;box-shadow:none">
    ${blockers}
    ${r.steps && r.steps.length ? protocolList(r.steps) : ""}
    ${extra}
  </div>`;
}
/* hand the winning mutagenesis plan to the full editor */
function openMakeInMutate(){
  const r = makeCache.routes[makePick];
  if(!r || !r.parent || !r.edit) return;
  mutState.templateId = r.parent.id;
  mutState.by = "nt";
  mutState.ntKind = r.edit.kind;
  mutState.ntPos = String(r.edit.a + 1);
  mutState.ntNew = r.edit.newSeq;
  mutState.ntLen = Math.max(1, r.edit.b - r.edit.a + 1);
  mutState.result = null; mutState.error = null;
  asm.mode = "mutate";
  closeMake();
  go("design");
  runMutation();
}
