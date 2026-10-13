console.log("\n== profiles and progressive disclosure ==");
{
  state.profile = { id:null, depth:"simple", onboarded:false, added:[] };
  ok("a fresh workspace is not onboarded", !state.profile.onboarded);
  try { render(); ok("the picker renders before a profile is chosen", true); }
  catch(e){ ok("the picker renders", false, e.message); }

  chooseProfile("cloning");
  ok("choosing a profile onboards", state.profile.onboarded && state.profile.id === "cloning");
  ok("it lands on Start", state.view === "start");
  ok("CRISPR is hidden for a cloning profile", !toolVisible("crispr"), visibleTools().join(","));
  ok("Constructs is shown", toolVisible("plasmids"));
  ok("Connect is hidden by default", !toolVisible("connect"));

  showAllTools = true;
  ok("show-all reveals everything", toolVisible("crispr") && toolVisible("connect"));
  showAllTools = false;

  addToolToProfile("crispr");
  ok("a tool can be added to a profile", toolVisible("crispr"));
  ok("adding it navigates there", state.view === "crispr");

  chooseProfile("everything");
  ok("the everything profile shows all tools", ALL_TOOLS.every(toolVisible), visibleTools().length + " tools");

  chooseProfile("crispr");
  ok("crispr profile shows crispr", toolVisible("crispr"));
  ok("crispr profile hides parts", !toolVisible("parts"));

  // every profile must reference only real tools, and always include Start
  let bad = [];
  PROFILES.forEach(pr => {
    if(!pr.tools) return;
    if(!pr.tools.includes("start")) bad.push(pr.id + " has no Start");
    pr.tools.forEach(t => { if(!ALL_TOOLS.includes(t)) bad.push(pr.id + " -> unknown tool " + t); });
  });
  ok("every profile lists only real tools", bad.length === 0, bad.join("; "));
  // every tool must be reachable from at least one profile
  const covered = new Set(); PROFILES.forEach(pr => (pr.tools || ALL_TOOLS).forEach(t => covered.add(t)));
  ok("every tool is reachable from some profile", ALL_TOOLS.every(t => covered.has(t)),
     ALL_TOOLS.filter(t => !covered.has(t)).join(","));

  ok("depth defaults to simple", isSimple());
  setDepth("full"); ok("depth can be switched", !isSimple());
  setDepth("simple");
}

console.log("\n== next actions are state-aware ==");
{
  chooseProfile("cloning");
  const before = state.plasmids;
  state.plasmids = [];
  ok("an empty workspace is told to add a construct", nextActions()[0].t === "Add your first construct",
     nextActions().map(a=>a.t).join(" | "));
  state.plasmids = before;
  state.reagents.enzymes = {};
  ok("an untracked shelf is prompted", nextActions().some(a => /enzymes you actually own/.test(a.t)),
     nextActions().map(a=>a.t).join(" | "));
  presetEnzymes();
  ok("once ticked, the prompt goes away", !nextActions().some(a => /enzymes you actually own/.test(a.t)));
  ok("at most four actions are offered", nextActions().length <= 4, nextActions().length + "");
  chooseProfile("crispr");
  ok("a crispr profile is offered guide design", nextActions().some(a => /guides/.test(a.t)),
     nextActions().map(a=>a.t).join(" | "));
}
console.log("\n" + pass + " passed, " + fail + " failed\n");
