/* =========================================================================
   BetterBench v3
   1. state + storage
   2. sequence primitives
   3. enzyme / feature libraries
   4. annotation engine
   5. alignment engine
   6. cloning + CRISPR planners
   7. views
   ========================================================================= */

/* ===================== 1. STATE ===================== */
const STORE_KEY = "betterbench.v3";
const LEGACY_KEY = "minibench.v2";
let state = load();

function uid(){ return Math.random().toString(36).slice(2,9); }
function today(){ return new Date().toISOString().slice(0,10); }

function load(){
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch(e){}
  if(!s){
    // one-time migration from the v2 prototype so nothing is lost
    let old = null;
    try { old = JSON.parse(localStorage.getItem(LEGACY_KEY)); } catch(e){}
    if(old && old.plasmids) s = { plasmids: old.plasmids, migrated:true };
  }
  if(!s) s = seed();
  return normalize(s);
}
function save(){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }catch(e){ toast("Could not save - storage full?"); } }

function normalize(s){
  s.v = 3;
  s.plasmids = s.plasmids || [];
  s.view = s.view || "start";
  s.pView = s.pView || "home";
  s.creating = false;
  if(s.curPlasmid === undefined) s.curPlasmid = null;
  s.customProtocols = s.customProtocols || [];
  s.runs = s.runs || {};          // protocolId -> {checked:[], started, note}
  s.builds = s.builds || [];      // saved cloning plans
  s.connect = s.connect || { enabled:false, name:"", org:"", contact:"", topics:"", shareMode:"features", optIn:{} };
  /* --- what is on the shelf, beyond the plasmids themselves --- */
  s.reagents = s.reagents || {};
  s.reagents.enzymes = s.reagents.enzymes || {};   // name -> {units, loc, exp, note}
  s.reagents.oligos  = s.reagents.oligos  || [];   // {id,name,seq,conc,vol,loc,date,note}
  s.reagents.cells   = s.reagents.cells   || [];   // {id,strain,eff,vials,loc,date,note}
  /* --- reusable parts: the vocabulary the planner composes from --- */
  s.parts = s.parts || [];        // {id,name,kind,seq,sourceId,sourceSpan,tags,note}
  /* --- sequences you have taught the pre-check to recognise --- */
  s.features = s.features || [];  // {id,name,kind,seq,note,created}
  /* --- short in-progress notes: the informal half of Connect --- */
  s.signals = s.signals || [];    // {id,text,stage,tags,date,share}
  /* --- rough costings; every lab's differ, so they are editable in Tools --- */
  s.rates = s.rates || { currency:"$", synthPerBp:0.09, vectorFee:35, oligoPerBase:0.25, enzymePerRxn:2.50,
                         seqPerRead:5, daysPerClone:4, daysPerOrder:8 };
  if(s.rates.vectorFee === undefined) s.rates.vectorFee = 35;
  /* --- which tools this person needs; set by the picker on first run --- */
  s.profile = s.profile || { id:null, depth:"simple", onboarded:false, added:[] };
  /* --- who you are, for stamping shared reagents --- */
  s.lab = s.lab || { me:"", labName:"", lastMerge:null };
  if(!s.lab.polymerase) s.lab.polymerase = "Q5";
  if(!s.lab.targetTa) s.lab.targetTa = 60;
  if(s.profile.added === undefined) s.profile.added = [];
  if(!s.profile.depth) s.profile.depth = "simple";
  s.plasmids.forEach(p => {
    p.type = p.type || "dna";
    p.topology = p.topology || "circular";
    p.ann = p.ann || [];
    p.ann.forEach(a => { a.kind = a.kind || "custom"; a.strand = a.strand || 1;
      // a label is a string or it is nothing; an imported file with a missing one
      // used to take the whole map down with it
      if(typeof a.label !== "string") a.label = a.label == null ? "" : String(a.label); });
    p.uniprot = p.uniprot || "";
    p.stock = p.stock || [];
    p.tags = p.tags || [];
    p.created = p.created || today();
    p.source = p.source || "";
    p.parents = p.parents || [];   // {id, name, role} - provenance
    if(p.notes === undefined) p.notes = "";
    if(p.color === undefined) p.color = null;
    if(p.inSilico === undefined) p.inSilico = p.stock.length === 0;
  });
  return s;
}
/* ---- shelf helpers, used by the planner and the Build tab ---- */
const COMMON_ENZYME_SET = ["EcoRI","BamHI","HindIII","XhoI","SalI","NotI","NdeI","XbaI","SpeI","NheI",
  "BglII","PstI","SacI","KpnI","SmaI","XmaI","NcoI","EcoRV","AgeI","ClaI","PvuII","BsaI","BbsI","BsmBI"];
function ownedEnzymes(){ return Object.keys((state.reagents && state.reagents.enzymes) || {}); }
function tracksEnzymes(){ return ownedEnzymes().length > 0; }
function ownsEnzyme(n){ return !tracksEnzymes() || !!state.reagents.enzymes[n]; }
function enzymeStock(n){ return (state.reagents.enzymes || {})[n] || null; }
/* an oligo already in the freezer whose 3' end matches a designed primer */
function findMatchingOligo(seq){
  const s = cleanDNA(seq); if(s.length < 15) return null;
  const tail = s.slice(-18);
  return (state.reagents.oligos || []).find(o => {
    const os = cleanDNA(o.seq);
    return os.length >= 15 && (os.slice(-18) === tail || os === s);
  }) || null;
}
/* An annotation label as a string, whatever is actually stored on it. */
function annLabel(a){ return a && typeof a.label === "string" ? a.label : (a && a.label != null ? String(a.label) : ""); }
function money(n){ const c = (state.rates && state.rates.currency) || "$";
  return c + (n >= 100 ? Math.round(n) : Math.round(n*100)/100); }

function seed(){
  // A small, honest demo construct: T7 promoter + Kozak + ATG + FLAG + linker + EGFP N-term + stop,
  // dropped into a fragment carrying a few real restriction sites.
  const ex =
    "GAATTCTAATACGACTCACTATAGGGAGACCACAACGGTTTCCCTCTAGAAATAATTTTGTTTAACTTTAAGAAGGAGATATACAT" +
    "ATGGACTACAAGGACGACGATGACAAGGGTAGCGGTAGCGGTAGCGGTAGC" +
    "ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAGGAGCGCACCATCTTCTTCAAGGACGACGGCAACTACAAGACCCGCGCCGAGGTGAAGTTCGAGGGCGACACCCTGGTGAACCGCATCGAGCTGAAGGGCATCGACTTCAAGGAGGACGGCAACATCCTGGGGCACAAGCTGGAGTACAACTACAACAGCCACAACGTCTATATCATGGCCGACAAGCAGAAGAACGGCATCAAGGTGAACTTCAAGATCCGCCACAACATCGAGGACGGCAGCGTGCAGCTCGCCGACCACTACCAGCAGAACACCCCCATCGGCGACGGCCCCGTGCTGCTGCCCGACAACCACTACCTGAGCACCCAGTCCGCCCTGAGCAAAGACCCCAACGAGAAGCGCGATCACATGGTCCTGCTGGAGTTCGTGACCGCCGCCGGGATCACTCTCGGCATGGACGAGCTGTACAAGTAA" +
    "CTCGAGCACCACCACCACCACCACTGAGATCCGGCTGCTAACAAAGCCCGAAAGGAAGCTGAGTTGGCTGCTGCCACCGCTGAGCAATAACTAGCATAACCCCTTGGGGCCTCTAAACGGGTCTTGAGGGGTTTTTTGGGATCCAAGCTT";
  return {
    v:3, view:"plasmids", pView:"home", curPlasmid:null, plasmids:[{
      id: uid(), name:"pDemo-FLAG-EGFP", type:"dna", topology:"circular", uniprot:"", seq: ex,
      ann: [], stock:[{id:uid(), kind:"miniprep", label:"clone 3", conc:214, vol:45, loc:"-20 box A / A4", date:today(), notes:"seq-verified"}],
      inSilico:false, tags:["demo"], created:today(), source:"built-in example"
    }]
  };
}

/* ===================== 2. SEQUENCE PRIMITIVES ===================== */
function cleanDNA(s){ return (s||"").toUpperCase().replace(/[^ACGTN]/g,""); }
function cleanAA(s){ return (s||"").toUpperCase().replace(/[^ACDEFGHIKLMNPQRSTVWYX*]/g,""); }
function seqOf(p){ return p ? (p.type==="protein" ? cleanAA(p.seq) : cleanDNA(p.seq)) : ""; }
const COMP = {A:"T",T:"A",C:"G",G:"C",N:"N"};
function revComp(s){ let o=""; for(let i=s.length-1;i>=0;i--) o += COMP[s[i]] || "N"; return o; }
function gcPct(s){ if(!s.length) return 0; return (s.match(/[GC]/g)||[]).length / s.length * 100; }

const CODONS={TTT:"F",TTC:"F",TTA:"L",TTG:"L",CTT:"L",CTC:"L",CTA:"L",CTG:"L",ATT:"I",ATC:"I",ATA:"I",ATG:"M",
GTT:"V",GTC:"V",GTA:"V",GTG:"V",TCT:"S",TCC:"S",TCA:"S",TCG:"S",CCT:"P",CCC:"P",CCA:"P",CCG:"P",ACT:"T",ACC:"T",
ACA:"T",ACG:"T",GCT:"A",GCC:"A",GCA:"A",GCG:"A",TAT:"Y",TAC:"Y",TAA:"*",TAG:"*",CAT:"H",CAC:"H",CAA:"Q",CAG:"Q",
AAT:"N",AAC:"N",AAA:"K",AAG:"K",GAT:"D",GAC:"D",GAA:"E",GAG:"E",TGT:"C",TGC:"C",TGA:"*",TGG:"W",CGT:"R",CGC:"R",
CGA:"R",CGG:"R",AGT:"S",AGC:"S",AGA:"R",AGG:"R",GGT:"G",GGC:"G",GGA:"G",GGG:"G"};
function translate(s){ let p=""; for(let i=0;i+3<=s.length;i+=3) p += CODONS[s.substr(i,3)] || "X"; return p; }

/* E. coli-leaning codon table for back-translation of ordered fragments */
const BACK_ECOLI={A:"GCG",R:"CGT",N:"AAC",D:"GAT",C:"TGC",E:"GAA",Q:"CAG",G:"GGC",H:"CAT",I:"ATT",L:"CTG",K:"AAA",
M:"ATG",F:"TTT",P:"CCG",S:"AGC",T:"ACC",W:"TGG",Y:"TAT",V:"GTG","*":"TAA",X:"NNN"};
const BACK_HUMAN={A:"GCC",R:"AGA",N:"AAC",D:"GAC",C:"TGC",E:"GAG",Q:"CAG",G:"GGC",H:"CAC",I:"ATC",L:"CTG",K:"AAG",
M:"ATG",F:"TTC",P:"CCC",S:"AGC",T:"ACC",W:"TGG",Y:"TAC",V:"GTG","*":"TGA",X:"NNN"};
function backTranslate(aa, host){ const t = host==="human"?BACK_HUMAN:BACK_ECOLI; let o=""; for(const c of aa) o += t[c]||"NNN"; return o; }

/* Tm: quick Wallace/GC rule and nearest-neighbour (SantaLucia 1998 unified + salt correction) */
function tmQuick(s){ const n=s.length; if(!n) return null; const gc=(s.match(/[GC]/g)||[]).length;
  if(n<14) return 2*(n-gc)+4*gc; return Math.round((64.9+41*(gc-16.4)/n)*10)/10; }
const NN={AA:[-7.9,-22.2],TT:[-7.9,-22.2],AT:[-7.2,-20.4],TA:[-7.2,-21.3],CA:[-8.5,-22.7],TG:[-8.5,-22.7],
GT:[-8.4,-22.4],AC:[-8.4,-22.4],CT:[-7.8,-21.0],AG:[-7.8,-21.0],GA:[-8.2,-22.2],TC:[-8.2,-22.2],
CG:[-10.6,-27.2],GC:[-9.8,-24.4],GG:[-8.0,-19.9],CC:[-8.0,-19.9]};
function tmNN(seq, Ct, Na){
  seq = cleanDNA(seq); if(seq.length < 2) return null;
  Ct = Ct || 0.25e-6; Na = Na || 0.05;
  let dH=0, dS=0;
  [seq[0], seq[seq.length-1]].forEach(e => { if(e==="G"||e==="C"){ dH+=0.1; dS+=-2.8; } else { dH+=2.3; dS+=4.1; } });
  for(let i=0;i<seq.length-1;i++){ const nn=NN[seq.substr(i,2)]; if(nn){ dH+=nn[0]; dS+=nn[1]; } }
  const R=1.987, dSs = dS + 0.368*(seq.length-1)*Math.log(Na);
  return Math.round(((dH*1000)/(dSs + R*Math.log(Ct/4)) - 273.15)*10)/10;
}

/* protein stats */
const AAW={A:71.08,R:156.19,N:114.10,D:115.09,C:103.14,E:129.12,Q:128.13,G:57.05,H:137.14,I:113.16,L:113.16,
K:128.17,M:131.19,F:147.18,P:97.12,S:87.08,T:101.10,W:186.21,Y:163.18,V:99.13,X:110,"*":0};
function proteinMW(s){ let m=0; for(const a of s) m += AAW[a]||0; return s.length ? Math.round((m+18.02)/100)/10 : 0; }
/* Extinction coefficient at 280 nm (Pace 1995): 5500*W + 1490*Y + 125*C(cystine, reduced form ignored) */
function extCoeff(s){ const W=(s.match(/W/g)||[]).length, Y=(s.match(/Y/g)||[]).length, C=(s.match(/C/g)||[]).length;
  return { red: 5500*W + 1490*Y, ox: 5500*W + 1490*Y + 125*Math.floor(C/2), W, Y, C }; }
/* Isoelectric point by bisection on net charge (EMBOSS pK set) */
const PKA={ Cterm:3.65, Nterm:8.2, D:3.9, E:4.07, C:8.5, Y:10.46, H:6.04, K:10.54, R:12.48 };
function netCharge(s, pH){
  const n = c => (s.match(new RegExp(c,"g"))||[]).length;
  let ch = 1/(1+Math.pow(10, pH-PKA.Nterm)) - 1/(1+Math.pow(10, PKA.Cterm-pH));
  ch += n("K")/(1+Math.pow(10, pH-PKA.K)) + n("R")/(1+Math.pow(10, pH-PKA.R)) + n("H")/(1+Math.pow(10, pH-PKA.H));
  ch -= n("D")/(1+Math.pow(10, PKA.D-pH)) + n("E")/(1+Math.pow(10, PKA.E-pH))
      + n("C")/(1+Math.pow(10, PKA.C-pH)) + n("Y")/(1+Math.pow(10, PKA.Y-pH));
  return ch;
}
function pI(s){ let lo=0, hi=14; for(let i=0;i<80;i++){ const mid=(lo+hi)/2; if(netCharge(s,mid) > 0) lo=mid; else hi=mid; }
  return Math.round(((lo+hi)/2)*100)/100; }
/* GRAVY (Kyte-Doolittle) */
const KD={A:1.8,R:-4.5,N:-3.5,D:-3.5,C:2.5,Q:-3.5,E:-3.5,G:-0.4,H:-3.2,I:4.5,L:3.8,K:-3.9,M:1.9,F:2.8,P:-1.6,
S:-0.8,T:-0.7,W:-0.9,Y:-1.3,V:4.2,X:0,"*":0};
function gravy(s){ if(!s.length) return 0; let t=0; for(const a of s) t += (KD[a]||0); return Math.round(t/s.length*1000)/1000; }

/* ORFs across 6 frames */
function findORFs(seq, minAA){
  minAA = minAA || 50; const out=[];
  [[1,seq],[-1,revComp(seq)]].forEach(([strand, ss]) => {
    for(let f=0; f<3; f++){
      let i=f;
      while(i+3 <= ss.length){
        if(ss.substr(i,3) === "ATG"){
          let j=i, prot="", stopped=false;
          while(j+3 <= ss.length){
            const aa = CODONS[ss.substr(j,3)] || "X";
            if(aa === "*"){ stopped=true; j+=3; break; }
            prot += aa; j += 3;
          }
          if(prot.length >= minAA){
            let start, end; // convert to forward-strand 0-based inclusive coords
            if(strand === 1){ start=i; end=j-1; }
            else { end = seq.length-1-i; start = seq.length - j; }
            out.push({ start, end, strand, frame:(strand===1? (i%3)+1 : -((i%3)+1)), aa:prot, len:prot.length, stopped });
          }
          i = j;
        } else i += 3;
      }
    }
  });
  out.sort((a,b) => b.len - a.len);
  return out;
}
function longestORF(seq){ const o = findORFs(seq, 1); return o.length ? {len:o[0].len, prot:o[0].aa, orf:o[0]} : {len:0, prot:""}; }
