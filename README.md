# BetterBench

An offline, account-free molecular biology workspace. One HTML file, opened by
double-clicking, with everything stored in your browser.

## Using it

Open **`betterbench.html`**. That is the whole app.

Three features reach the network — the UniProt lookup, the AlphaFold model download,
and the optional ESMFold prediction. If those fail with *"failed to fetch"* on a
double-clicked file, serve the folder instead:

```bash
python -m http.server
```

then open <http://localhost:8000/betterbench.html>.

Everything else — maps, alignment, cloning design, CRISPR, inventory, protocols —
works with no network at all.

> **Back up your work.** The workspace lives in `localStorage`, which is destroyed if
> you clear site data. Use **Export** in the header regularly; it writes a JSON file
> that **Import** restores.

## Editing it

`betterbench.html` is **generated**. Edit the modules in `src/` and rebuild:

```bash
node src/build.mjs
```

Modules are concatenated in filename order, so the number prefix is the load order:

| File | What lives there |
| --- | --- |
| `00-head.html` | markup shell and all CSS |
| `10-state.js` | storage, migration, shelf helpers, the profile |
| `20-enzymes.js` | enzyme table, feature libraries, annotation, alignment |
| `30-cloning.js` | primer design, enzyme-pair search, restriction products |
| `32-primers.js` | splits a primer into tail and anneal, off-target sites, products |
| `35-planner.js` | assembly, Golden Gate overhangs, route costing, protocols |
| `37-mutagenesis.js` | point mutation: codon choice, back-to-back primers, KLD |
| `39-makeplan.js` | diffs a target against what you own and picks a route to it |
| `40-shell.js` | navigation, router, shared UI state |
| `45-onboarding.js` | profiles, the first-run picker, the Start screen |
| `50-constructs.js` | construct gallery, create, detail, provenance |
| `52-features.js` | your own sequences, taught to the pre-check |
| `54-make-view.js` | the "how do I make this?" panel |
| `55-render.js` | map renderers, selection, alignment report |
| `65-reagents.js` | inventory: tubes, enzymes, oligos, cells, locations |
| `67-shelf.js` | shared-shelf export, import and merge |
| `70-crispr.js` | guides, protein, protocols |
| `72-structure.js` | PDB / AlphaFold / homolog / de-novo structure ladder |
| `75-parts.js` | part library and the Design planner |
| `77-mutate-view.js` | the point-mutation screen |
| `80-tools.js` | calculators and planning rates |
| `82-primers-view.js` | the Primers screen |
| `85-connect.js` | opt-in matching |
| `99-init.js` | first render |

The build refuses to run if a module contains `</script`, which would break the
single-file output.

## Tests

```bash
node test/run.mjs
```

507 assertions, no dependencies. They run the real modules against a stubbed DOM and
check the biology rather than the rendering — enzyme overhangs and compatibility,
alignment against mutated, reverse-strand and origin-spanning reads, guide and PAM
geometry, that Golden Gate overhangs actually reassemble into the intended product,
that annotations carried across a cloning join still point at the same bases, and
that route ranking prefers what is on your shelf, that a profile hides the right tools, that six-frame ORF
noise is filtered down to plausible genes, and — the important one — that mutagenesis primers, run through a
simulated PCR and ligation, rebuild the intended plasmid byte for byte.

Add assertions to the files in `test/`; `run.mjs` picks them up in the order listed
inside it.

## Profiles

On first run the app asks what you work on and hides the tools you do not need. A
profile never deletes anything: **Show all tools** in the sidebar reveals the rest,
and clicking a hidden tool on the Start screen adds it permanently to your profile.

The **Simple / Full** switch below it is a second, finer dial. Simple hides the
base-editing and HDR panels in CRISPR, the non-unique cutters in the restriction map,
and the planning-rate editor in Tools. Full shows everything.

Profiles live in `45-onboarding.js`. Adding one is a single entry in `PROFILES` with
a list of tool ids; the test suite checks that every profile lists only real tools and
that every tool is reachable from at least one profile.

## Point mutation

**Design → Point mutation** designs back-to-back primers for whole-plasmid PCR followed by
KLD, the same approach as NEB's Q5 kit. Say `E123K` against a labelled ORF and it picks the
codon needing the fewest base changes, places the change inside the forward primer with
matching sequence either side, sizes both annealing arms by nearest-neighbour Tm, and writes
the protocol. Substitutions, insertions (split across both primers when long) and deletions
all work, including on reverse-strand ORFs and across the origin.

Where it goes beyond NEBaseChanger: you give it an amino acid change rather than working out
the nucleotides, it checks the residue you named is actually there, and it looks for a silent
codon change nearby that would create a unique restriction site — so a correct clone can be
told apart with a digest instead of a sequencing read.

Primers are sized **to a target annealing temperature**, not to a fixed Tm each. You pick the
polymerase and the Ta you want; each arm is then cut to the shortest length that reaches the Tm
that polymerase needs for it, which is why the two primers usually come out different lengths —
a GC-rich side needs fewer bases than an AT-rich one. This is what NEBaseChanger does, and why
its reverse primers are often shorter and cooler than a naive matched-Tm design.

Each vendor's rule for turning a Tm into a Ta is different (`POLYMERASES` in `30-cloning.js`):
Phusion +3 °C above 20 nt, Taq −5 °C, Q5 +1 °C, and so on. The Tm underneath is SantaLucia
nearest-neighbour, **not** the vendor's own model — NEB's calculator runs a degree or two warmer,
and the interface says so.

Non-proofreading polymerases are refused for this workflow: Taq leaves a 3′ A overhang, so the
product cannot be blunt-ligated and KLD will fail.

Primer pairs are also checked for 3′ complementarity and the arm lengths adjusted to break a
dimer where the sequence allows it. Where it does not — a direct repeat in the template — the
pair is reported honestly rather than silently shipped.

## Primers

**Primers → Check primers** takes pasted primers and works out their own anatomy. A Gibson
primer is a 5′ homology tail welded to a 3′ annealing region, and only the annealing part has
anything to do with the template you amplify from — so it finds the longest 3′-anchored match
and calls everything 5′ of that the tail. No trimming by hand to find out where a primer binds
or what its real Tm is.

It reports the **annealing Tm** separately from the whole-primer Tm, because only the first one
sets your annealing temperature; the tail does not participate until cycle 3. It also traces the
tail back to whichever construct it is homologous to, which turns a blob of bases into a fact.

Then it looks for **everywhere else the primer could bind**. A polymerase extends from the 3′
end, so sites are seeded on the 3′-terminal 10 bases and scored on the length of the perfectly
matched 3′ run rather than on total mismatches — a long perfect 3′ anchor primes even with a
badly mismatched 5′ end, which is both how a Gibson tail works on purpose and how a spurious
band happens by accident. Pairs of sites facing each other are enumerated as **predicted
products**, so a duplicated region shows up as two bands before you run the gel.

Paste format is forgiving: bare sequences, `name,SEQ`, tab-separated, or FASTA.

**Primers → Design Gibson primers** is the fast path for the common job: amplify this region,
put it there, get the four primers with homology arms. One click hands them to the checker.

## Make this

Every DNA construct has a **Make** button — on its page, on its card in the gallery, and in the
*designed but not made* list. It diffs the target against everything else in the workspace,
finds the closest relative, and reads the route off the differences:

| What the diff shows | Route offered |
| --- | --- |
| no differences | you already have it, and where |
| one gap under 30 bp | point mutation, with the primers designed |
| one larger gap | inverse-PCR the backbone, supply the insert, assemble |
| several gaps | too many steps to edit — build it from parts instead |
| no close relative | order the whole plasmid |

Routes are costed and ranked, and anything blocked drops below anything that is not. The useful
part is the blocking: if the cheapest route needs a construct you have designed but never made,
it says so, quantifies what it would save, and offers a **Make** button for *that* construct —
so a chain of dependencies can be walked back to something you actually own.

The diff is anchor chaining rather than full dynamic programming: exact k-mer matches are
extended, chained with a gap cost, overlaps trimmed, and indels left-normalised so a position is
reported where a person would name it. The gap cost matters — without it a repeated sequence
(a tag appearing twice) offers a chain that skips a kilobase to pick up a few extra matched
bases, and the diff comes out nonsense.

## Editing components

Every component on a construct can be renamed, recoloured or have its span corrected:
double-click it in the list, click its colour swatch, use the pencil, or select the region
and pick *Rename* from the menu. An auto-found annotation that you edit is re-marked
`manual (was: exact motif)` so you can tell which labels you have vouched for.

## Teaching it your own sequences

The pre-check only knows common parts out of the box. **Parts → Feature library**, the panel
at the bottom of the pre-check, and *Teach the pre-check this* in the map's selection menu all
add a sequence to `state.features`. Anything in there is matched on both strands of every
construct from then on, with the kind and name you chose.

## Known limits

These are deliberate, and the interface says so where it matters:

- **Annotation is seed matching**, not a database search. It finds common tags,
  promoters, markers and ORFs, plus anything you have labelled on another construct.
  It will miss a truncated marker. `pLannotate` does this properly.
- **Guide scoring is a rule-based heuristic**, not Doench Rule Set 2 or DeepSpCas9.
  Off-target search covers *your workspace only* — run spacers through CRISPOR or
  CHOPCHOP before ordering.
- **GenBank import keeps only the sequence.** The FEATURES table is discarded, so
  importing an annotated map currently loses its annotations. This is the top item
  on the list to fix.
- **Costs are indicative.** Edit the rates in Tools to match your institution.
- **Alignment is pairwise and capped at 4 kb** per query, and cannot read `.ab1`
  traces.
- **The structure search needs the network.** It queries RCSB, AlphaFold DB and
  (last) ESMFold live, with no caching. Opening the file by double-clicking gives the
  page the origin `null`, which those APIs reject — serve it over http. ESMFold caps
  at 400 residues and is rate-limited.
- **The shared shelf is a file, not sync.** Exporting and merging keeps a lab roughly
  aligned, but two people editing at once will each keep their own newest copy of a
  conflicting record. Live sharing needs a backend.
