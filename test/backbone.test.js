console.log("\n== backbone-arc correctness ==");
{
  const vs = seqOf(p), L = vs.length;
  const ins2 = "ATGAAACGTGAAGATTTACTGGCACAAGCACGTGAAGTT".repeat(2);
  const prs = suggestEnzymePairs(vs, true, ins2, L);
  ok("every pair drops <= half the vector", prs.every(x => x.dropped <= L/2),
     prs.filter(x=>x.dropped>L/2).map(x=>x.e5+"/"+x.e3+":"+x.dropped).join(","));
  let bbBad = 0, sumBad = 0, ordBad = 0;
  prs.forEach(x => {
    const b = buildRestrictionProduct(p, ins2, [], x, true);
    if(b.backboneLen !== L - x.dropped) bbBad++;
    if(b.product.length !== b.backboneLen + b.pieceLen) sumBad++;
    if(b.ann.some(a => a.end < a.start || a.end >= b.product.length)) ordBad++;
    // the backbone must still contain the two cut sites' flanks: rebuilding it from the
    // circle must equal a rotation of the original minus the dropped arc
    const rebuilt = x.cut5 > x.cut3 ? vs.slice(x.cut3, x.cut5) : vs.slice(x.cut3) + vs.slice(0, x.cut5);
    if(b.product.slice(0, b.backboneLen) !== rebuilt) bbBad++;
  });
  ok("backbone length = L - dropped for every pair", bbBad === 0, bbBad + " wrong");
  ok("product = backbone + piece for every pair", sumBad === 0, sumBad + " wrong");
  ok("transferred annotations stay ordered and in range", ordBad === 0, ordBad + " wrong");
  const best = prs[0];
  console.log("  best now: " + best.e5 + "/" + best.e3 + " drops " + best.dropped + " keeps " + (L-best.dropped));
  // vector annotations survive
  const b = buildRestrictionProduct(p, ins2, [], best, true);
  console.log("  carried annotations: " + b.ann.map(a=>a.label).join(" | "));
}
console.log("\n== guide score bounded ==");
{
  const gg = findGuides(seq, "SpCas9");
  ok("scores within 0-100", gg.every(x => x.score >= 0 && x.score <= 100),
     "max " + Math.max(...gg.map(x=>x.score)) + " min " + Math.min(...gg.map(x=>x.score)));
}
console.log("\n" + pass + " passed, " + fail + " failed\n");
