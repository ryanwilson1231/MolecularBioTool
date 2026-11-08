/* =========================================================================
   LAB CONNECT, LIVE
   Three things people actually want from "connect me to other labs":

     1. who is down the corridor      same institution, same department
     2. who has the same material     the same plasmid at another university
     3. talk to them now              not an email thread over four days

   The first two are matching problems and are done locally: a peer's profile
   card carries hashed sequence signatures, and the comparison happens on your
   machine. Nobody's sequences leave their laptop; a 128-value MinHash sketch
   of canonical 21-mers tells you two constructs are the same without telling
   you what either of them is.

   The third needs a transport. This prototype uses BroadcastChannel, which is
   genuinely real time between tabs of the same browser - open BetterBench
   twice and the two tabs see each other, live, with no server at all. That is
   enough to evaluate whether the interaction is right.

   The message shapes are deliberately transport-shaped rather than
   tab-shaped: hello / presence / bye / share / chat, each with a room, a
   sender and a timestamp. Swapping BroadcastChannel for a WebSocket relay or
   a WebRTC data channel is a change to liveSend and liveOpen and nothing
   else - every handler below stays as it is.
   ========================================================================= */

const LIVE_PROTOCOL = "betterbench.live/1";
const LIVE_BEAT_MS  = 3000;    // how often we announce we are still here
const LIVE_GONE_MS  = 11000;   // no word for this long and a peer is dropped

let liveState = {
  joined:false, room:"", chan:null, beat:null,
  me:null,                 // {id, name, org, dept, sigs:[{name, sig}]}
  peers:{},                // id -> {profile, lastSeen, viewing}
  feed:[],                 // newest first
  draft:"", roomDraft:"", tab:"room",
  inbox:[]                 // constructs offered to us, awaiting accept
};

/* ---------- identity and signatures ---------- */
/* Per TAB, not per workspace. localStorage is shared between tabs of the same
   browser, so an id stored there would make two tabs look like one peer and
   each would filter the other out as its own echo. sessionStorage is scoped to
   the tab, which is exactly the scope a connection has. */
let liveIdCache = null;
function liveId(){
  if(liveIdCache) return liveIdCache;
  try {
    liveIdCache = sessionStorage.getItem("betterbench.liveId");
    if(!liveIdCache){
      liveIdCache = uid() + uid();
      sessionStorage.setItem("betterbench.liveId", liveIdCache);
    }
  } catch(e){ liveIdCache = uid() + uid(); }   // private mode, blocked storage
  return liveIdCache;
}
/* The card a peer sees. Only opted-in constructs contribute, and they
   contribute a sketch and a length, never a sequence. */
function liveProfile(){
  const c = state.connect || {};
  const sigs = state.plasmids
    .filter(p => p.type === "dna" && c.optIn && c.optIn[p.id])
    .map(p => ({ name:p.name, len:seqOf(p).length, sig:minhash(seqOf(p), 21, 128) }));
  return {
    id: liveId(),
    name: c.name || state.lab.me || "someone",
    org:  c.org  || state.lab.labName || "",
    dept: c.dept || "",
    topics: c.topics || "",
    contact: c.contact || "",
    sigs
  };
}
/* Jaccard estimate from two sketches.
   minhash() here is a BOTTOM-K sketch: the smallest n distinct hashes, sorted.
   Comparing those position by position is wrong - inserting a single base
   shifts the sorted order, so two constructs that share 95%% of their k-mers
   score near zero. The set-based estimator is the correct one and the codebase
   already has it. */
function sigSimilarity(a, b){
  if(!a || !b || !a.length || !b.length) return 0;
  return jaccardFromSketch(a, b);
}
/* Why this peer is worth talking to, strongest reason first. */
function peerReasons(peer){
  const me = liveState.me || liveProfile();
  const out = [];
  const sameOrg  = me.org  && peer.org  && me.org.trim().toLowerCase()  === peer.org.trim().toLowerCase();
  const sameDept = me.dept && peer.dept && me.dept.trim().toLowerCase() === peer.dept.trim().toLowerCase();
  if(sameOrg && sameDept)
    out.push({ kind:"corridor", w:100, t:"Same department at " + peer.org,
               why:"You can walk a tube over. No MTA, no shipping, no dry ice." });
  else if(sameOrg)
    out.push({ kind:"org", w:70, t:"Also at " + peer.org,
               why:"Same institution, different group - usually a single email." });

  /* Sketch similarity on its own is not enough to claim two constructs are the
     same one. A 320 bp insertion into a 1 kb plasmid still shares ~91% of its
     21-mers, because the backbone is untouched - calling that "the same
     construct" sends somebody to ask for the wrong tube. So length has to
     agree as well, and the gap between them is reported in bases rather than
     left as a percentage nobody can act on. */
  const SAME_SIM = 0.97, SAME_LEN = 0.02, NEAR_SIM = 0.85, RELATED_SIM = 0.45;
  const best = {};                       // one verdict per pair of constructs
  (me.sigs || []).forEach(mine => (peer.sigs || []).forEach(theirs => {
    const s = sigSimilarity(mine.sig, theirs.sig);
    if(s < RELATED_SIM) return;
    const dLen = Math.abs(theirs.len - mine.len);
    const rLen = dLen / Math.max(mine.len, theirs.len, 1);
    const pct = Math.round(s * 100);
    let r;
    if(s >= SAME_SIM && rLen <= SAME_LEN)
      r = { kind:"same", w:100 + s, t:"Has the same construct as your " + mine.name,
            why:"They call it “" + theirs.name + "”" + (dLen ? ", " + dLen + " bp different in length" : "") +
                 ". Ask them for a tube rather than building it." };
    else if(s >= NEAR_SIM)
      r = { kind:"near", w:60 + s, t:"Has a close relative of your " + mine.name,
            why:"“" + theirs.name + "” is " + bp(theirs.len) + " against your " + bp(mine.len) +
                 " and shares " + pct + "% of its 21-mers - the same backbone with " +
                 (theirs.len > mine.len ? "something extra in it" : "something taken out") + "." };
    else
      r = { kind:"related", w:40 + s, t:"Has something related to your " + mine.name,
            why:"“" + theirs.name + "” shares about " + pct + "% of its 21-mers with yours - " +
                 "usually a shared backbone or a shared insert." };
    const key = mine.name + "\u0000" + theirs.name;
    if(!best[key] || best[key].w < r.w) best[key] = r;
  }));
  Object.keys(best).forEach(k => out.push(best[k]));
  out.sort((a,b) => b.w - a.w);
  return out;
}

/* ---------- transport ----------
   Everything above this line is independent of how bytes move. */
function liveAvailable(){ return typeof BroadcastChannel === "function"; }

function liveOpen(room){
  if(!liveAvailable()) return false;
  liveClose();
  liveState.chan = new BroadcastChannel("betterbench.live." + room);
  liveState.chan.onmessage = ev => liveReceive(ev.data);
  return true;
}
function liveClose(){
  if(liveState.beat){ clearInterval(liveState.beat); liveState.beat = null; }
  if(liveState.chan){ try { liveState.chan.close(); } catch(e){} liveState.chan = null; }
}
function liveSend(type, payload){
  if(!liveState.chan) return;
  try {
    liveState.chan.postMessage({
      v: LIVE_PROTOCOL, type, room: liveState.room,
      from: liveState.me, at: Date.now(), payload: payload || null
    });
  } catch(e){ /* a peer closing mid-post is not an error worth surfacing */ }
}

/* ---------- joining ---------- */
function liveJoin(){
  const room = (liveState.roomDraft || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  if(!room){ toast("Give the room a name - anything you and they agree on"); return; }
  if(!liveAvailable()){ toast("This browser has no BroadcastChannel, so live rooms are unavailable"); return; }
  liveState.me = liveProfile();
  liveState.room = room;
  if(!liveOpen(room)) return;
  liveState.joined = true;
  liveState.peers = {};
  liveNote("you joined " + room);
  liveSend("hello");
  liveState.beat = setInterval(liveTick, LIVE_BEAT_MS);
  save(); render();
}
function liveLeave(){
  if(liveState.joined) liveSend("bye");
  liveClose();
  liveState.joined = false; liveState.peers = {}; liveState.room = "";
  render();
}
function liveTick(){
  if(!liveState.joined) return;
  liveState.me = liveProfile();          // pick up profile edits without rejoining
  liveSend("presence", { viewing: state.view });
  const now = Date.now();
  let dropped = false;
  Object.keys(liveState.peers).forEach(id => {
    if(now - liveState.peers[id].lastSeen > LIVE_GONE_MS){
      liveNote(liveState.peers[id].profile.name + " went offline");
      delete liveState.peers[id]; dropped = true;
    }
  });
  if(dropped || state.view === "live") renderIfLive();
}
function renderIfLive(){ if(state.view === "live") render(); }

function liveNote(text, kind){
  liveState.feed.unshift({ id:uid(), text, kind: kind || "note", at: Date.now() });
  if(liveState.feed.length > 60) liveState.feed.length = 60;
}

/* ---------- receiving ----------
   A message from a peer is data, never instruction. Nothing here applies a
   change to the workspace: a shared construct lands in an inbox and waits for
   you to accept it. */
function liveReceive(msg){
  if(!msg || msg.v !== LIVE_PROTOCOL || !msg.from || msg.room !== liveState.room) return;
  if(msg.from.id === liveId()) return;                 // our own broadcast
  const id = String(msg.from.id || "").slice(0, 32);
  if(!id) return;

  const known = !!liveState.peers[id];
  liveState.peers[id] = {
    profile: msg.from,
    lastSeen: Date.now(),
    viewing: (msg.payload && msg.payload.viewing) || (liveState.peers[id] || {}).viewing || ""
  };

  if(msg.type === "hello"){
    if(!known) liveNote(msg.from.name + " joined", "join");
    liveSend("presence", { viewing: state.view });     // so they learn about us at once
  } else if(msg.type === "bye"){
    liveNote(msg.from.name + " left", "leave");
    delete liveState.peers[id];
  } else if(msg.type === "chat"){
    const text = String((msg.payload && msg.payload.text) || "").slice(0, 400);
    if(text) liveNote(msg.from.name + ": " + text, "chat");
  } else if(msg.type === "share"){
    const c = msg.payload || {};
    const name = String(c.name || "").slice(0, 80);
    const seq = cleanDNA(String(c.seq || ""));
    if(!name || !seq) return;
    if(seq.length > 300000) return;                    // refuse something absurd
    liveState.inbox.unshift({
      id: uid(), from: msg.from.name, name,
      topology: c.topology === "linear" ? "linear" : "circular",
      seq, at: Date.now()
    });
    liveNote(msg.from.name + " offered “" + name + "” (" + bp(seq.length) + ")", "share");
  }
  renderIfLive();
}

/* ---------- actions ---------- */
function liveSay(){
  const t = (liveState.draft || "").trim();
  if(!t) return;
  liveSend("chat", { text: t.slice(0, 400) });
  liveNote("you: " + t, "chat");
  liveState.draft = "";
  render();
}
function liveShare(pid){
  const p = state.plasmids.find(x => x.id === pid);
  if(!p) return;
  liveSend("share", { name:p.name, seq:seqOf(p), topology:p.topology });
  liveNote("you offered “" + p.name + "”", "share");
  render();
}
function liveAccept(inboxId){
  const item = liveState.inbox.find(x => x.id === inboxId);
  if(!item) return;
  const p = {
    id: uid(), name: item.name + " (from " + item.from + ")", type:"dna",
    topology: item.topology, seq: item.seq, ann:[], tags:[], note:"", notes:"",
    color:null, parents:[], source:"received from " + item.from, stock:[], created: today()
  };
  state.plasmids.push(p);
  normalize(state);
  liveState.inbox = liveState.inbox.filter(x => x.id !== inboxId);
  save(); render();
  toast("Added “" + p.name + "”. Run the pre-check on it.");
}
function liveDismiss(inboxId){
  liveState.inbox = liveState.inbox.filter(x => x.id !== inboxId);
  render();
}

/* ---------- view ---------- */
function viewLive(){
  if(!liveState.joined) return liveLobby();
  const peers = Object.keys(liveState.peers).map(k => liveState.peers[k]);
  const tabs = [["room","Who is here"],["share","Share a construct"],["inbox","Inbox"]]
    .map(([k,l]) => `<button class="${liveState.tab===k?"on":""}" onclick="liveState.tab='${k}';render()">${l}${
      k === "inbox" && liveState.inbox.length ? " (" + liveState.inbox.length + ")" : ""}</button>`).join("");

  return `<div class="lblrow">
    <div>
      <h1 class="page" style="margin-bottom:2px">Live room</h1>
      <p class="lede" style="margin:0">
        <span class="livedot"></span> <b>${esc(liveState.room)}</b> &middot;
        ${peers.length} other${peers.length === 1 ? "" : "s"} here &middot; you are
        ${esc((liveState.me && liveState.me.name) || "someone")}</p>
    </div>
    <button class="ghost danger" onclick="liveLeave()">Leave</button>
  </div>
  <div class="toggle" style="margin:12px 0 14px">${tabs}</div>
  ${liveState.tab === "room" ? liveRoomPanel(peers)
    : liveState.tab === "share" ? liveSharePanel(peers) : liveInboxPanel()}
  ${liveFeedPanel()}`;
}

function liveLobby(){
  const c = state.connect || {};
  const sharing = state.plasmids.filter(p => c.optIn && c.optIn[p.id]).length;
  return `<h1 class="page">Live room</h1>
  <p class="lede">A room is just a name you and somebody else agree on. Anyone who types the same name is in
  the same room.</p>

  ${liveAvailable() ? "" : `<div class="note warn">This browser does not support BroadcastChannel, so live
    rooms will not work here.</div>`}

  <div class="panel">
    <h2>Join a room</h2>
    <div class="lblrow" style="align-items:flex-end;gap:10px">
      <div style="flex:1">
        <label class="plain">Room name</label>
        <input id="liveroom" placeholder="smith-lab, or bioe-c175, or anything"
          value="${esc(liveState.roomDraft)}"
          oninput="liveState.roomDraft=this.value" onkeydown="if(event.key==='Enter')liveJoin()">
      </div>
      <button class="primary" onclick="liveJoin()">Join</button>
    </div>
    <div class="note info" style="margin-top:12px">
      <b>To try it right now:</b> open BetterBench in a second browser tab, go to this screen, and join the
      same room name. The two tabs will find each other immediately.
    </div>
  </div>

  <div class="panel">
    <h2>What peers will see about you</h2>
    <div class="grid2">
      <div><label class="plain">Name</label>
        <input value="${esc(c.name || "")}" oninput="state.connect.name=this.value;save()"></div>
      <div><label class="plain">Institution</label>
        <input value="${esc(c.org || "")}" placeholder="UC Berkeley" oninput="state.connect.org=this.value;save()"></div>
      <div><label class="plain">Department</label>
        <input value="${esc(c.dept || "")}" placeholder="Molecular and Cell Biology"
          oninput="state.connect.dept=this.value;save()"></div>
      <div><label class="plain">Contact</label>
        <input value="${esc(c.contact || "")}" oninput="state.connect.contact=this.value;save()"></div>
    </div>
    <div class="note" style="margin-top:12px">
      ${sharing} construct${sharing === 1 ? "" : "s"} opted in. Each contributes a
      <b>128-value hashed sketch</b>, never its sequence &mdash; enough to tell another lab you have the same
      plasmid, not enough for them to learn what it is. Choose which ones in <b>Connect &rsaquo; What you share</b>.
    </div>
  </div>`;
}

function liveRoomPanel(peers){
  if(!peers.length) return `<div class="panel"><div class="empty" style="padding:28px">
    <div class="big">\u{1F4E1}</div>Nobody else here yet.
    <div class="muted small" style="margin-top:6px">Open a second tab and join
      &ldquo;${esc(liveState.room)}&rdquo; to see this work.</div></div></div>`;
  return `<div class="panel"><div style="display:flex;flex-direction:column;gap:10px">
    ${peers.map(pr => {
      const reasons = peerReasons(pr.profile);
      const top = reasons[0];
      return `<div class="peer">
        <div class="peerhead">
          <div>
            <b>${esc(pr.profile.name)}</b>
            ${pr.profile.org ? `<span class="muted"> &middot; ${esc(pr.profile.org)}</span>` : ""}
            ${pr.profile.dept ? `<span class="muted"> &middot; ${esc(pr.profile.dept)}</span>` : ""}
          </div>
          <span class="pill ${top ? (top.kind === "corridor" || top.kind === "same" ? "green"
                                   : top.kind === "near" ? "amber" : "blue") : "grey"}">
            ${top ? esc(top.t) : "no overlap yet"}</span>
        </div>
        ${reasons.length ? `<ul class="reasons">${reasons.slice(0,4).map(r =>
          `<li><b>${esc(r.t)}</b> &mdash; ${esc(r.why)}</li>`).join("")}</ul>` : ""}
        <div class="muted small">
          ${pr.viewing ? "looking at " + esc(pr.viewing) + " &middot; " : ""}
          ${(pr.profile.sigs || []).length} construct${(pr.profile.sigs||[]).length === 1 ? "" : "s"} shared
          ${pr.profile.topics ? ` &middot; interested in ${esc(pr.profile.topics)}` : ""}
          ${pr.profile.contact ? ` &middot; <b>${esc(pr.profile.contact)}</b>` : ""}
        </div>
      </div>`;
    }).join("")}
  </div></div>`;
}

function liveSharePanel(peers){
  const dna = state.plasmids.filter(p => p.type === "dna");
  return `<div class="panel">
    <h2 style="margin-top:0">Send a construct to the room</h2>
    <p class="muted">This sends the full sequence to everyone currently in the room. They have to accept it
    before it goes into their workspace.</p>
    ${peers.length ? "" : `<div class="note warn">Nobody else is here, so this will go nowhere.</div>`}
    ${dna.length ? `<div style="display:flex;flex-direction:column;gap:6px">
      ${dna.map(p => `<div class="comp" style="cursor:default">
        <span class="comp-sw" style="background:${p.stock.length ? "#d6f5d6" : "#ffe0b3"}"></span>
        <span class="comp-nm">${esc(p.name)}</span>
        <span class="comp-pos">${bp(seqOf(p).length)}</span>
        <button class="ghost" onclick="liveShare('${p.id}')">Send</button>
      </div>`).join("")}</div>`
      : `<div class="empty"><div class="big">\u{1F9EC}</div>Nothing to send yet.</div>`}
  </div>`;
}

function liveInboxPanel(){
  if(!liveState.inbox.length) return `<div class="panel"><div class="empty" style="padding:28px">
    <div class="big">\u{1F4E5}</div>Nothing offered to you yet.</div></div>`;
  return `<div class="panel"><div style="display:flex;flex-direction:column;gap:10px">
    ${liveState.inbox.map(it => `<div class="peer">
      <div class="peerhead">
        <div><b>${esc(it.name)}</b> <span class="muted">&middot; ${bp(it.seq.length)} &middot; ${esc(it.topology)}</span></div>
        <span class="muted small">from ${esc(it.from)}</span>
      </div>
      <div class="seqbox" style="max-height:62px;overflow:hidden">${esc(it.seq.slice(0, 180))}&hellip;</div>
      <div class="lblrow" style="margin-top:8px">
        <span class="muted small">Nothing is added until you accept it.</span>
        <span>
          <button class="ghost" onclick="liveDismiss('${it.id}')">Dismiss</button>
          <button class="primary" onclick="liveAccept('${it.id}')">Add to my constructs</button>
        </span>
      </div>
    </div>`).join("")}
  </div></div>`;
}

function liveFeedPanel(){
  return `<div class="panel">
    <div class="lblrow" style="margin-bottom:8px"><h2 style="margin:0">Room feed</h2></div>
    <div class="lblrow" style="gap:8px;align-items:flex-end;margin-bottom:10px">
      <input id="livesay" placeholder="say something to the room…" value="${esc(liveState.draft)}"
        oninput="liveState.draft=this.value" onkeydown="if(event.key==='Enter')liveSay()" style="flex:1">
      <button class="ghost" onclick="liveSay()">Send</button>
    </div>
    ${liveState.feed.length ? `<div class="feed">${liveState.feed.map(f =>
      `<div class="feedrow ${esc(f.kind)}"><span class="feedtime">${new Date(f.at).toLocaleTimeString()}</span>
        <span>${esc(f.text)}</span></div>`).join("")}</div>`
      : `<div class="muted small">Nothing yet.</div>`}
  </div>`;
}
