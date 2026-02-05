# Screening Rules (Operational) — Decompilation Survey (LAYERED: Core + Components)
# Two-stage screening: Stage-1 (Title/Abstract) -> Stage-2 (Full text)
# Scope mode: LAYERED (IN-CORE + IN-COMP)
# Time window: 2017-01-01 .. 2026-12-31
# Publication types: peer-reviewed OR arXiv/preprint with sufficient technical detail

----------------------------------------
[Decision Flow]
----------------------------------------
0) Dedup
   - If duplicate (same DOI/arXiv ID OR identical title+authors OR clear versioning),
     keep the most complete version (journal > conf > arXiv; or newest with more detail). -> EX-DUP

1) Time & Document Type
   - If outside time window -> EX-TIME
   - If non-scholarly (blog, slides-only, tutorial-only, patent, marketing) -> EX-NONPUB
   - If no technical method described (position/opinion only; no concrete pipeline/model) -> EX-NOMETHOD

2) Domain Relevance (Binary/Low-level input required)
   Include candidate if it targets at least one of:
   - native binary / executable / machine code / assembly
   - bytecode ONLY if the goal is decompilation/source reconstruction from bytecode
   - decompiler output / lifted IR ONLY if explicitly derived from binary/asm/bytecode
   Else -> EX-NOBIN
   If unclear from title/abstract -> UNS-IN (Stage-2 check)

3) ML Relevance (ML/DL/LM must be core)
   - If ML/DL/LM/LLM is a core component (training or inference; not just evaluation tooling) -> proceed
   - If purely rule-based/static analysis only -> EX-NOML
   - If unclear from title/abstract -> UNS-ML (Stage-2 check)

4) Task Relevance (Core vs Components vs Out-of-scope)
   4a) CORE (E2E / Near-core):
       - Produces higher-level program representation intended for human-readable reconstruction:
         {source code OR structured pseudocode OR AST/HLIR} from {binary/asm/bytecode/derived IR}.
       - Includes "decompiler output post-processing" IF input is decompiler pseudocode/IR and
         output is still {source/pseudocode/AST/HLIR} and is explicitly tied to decompilation improvement.
       -> IN-CORE (go to Stage-2)

   4b) COMPONENTS (Partial recovery relevant to decompilation):
       - Focuses on recovering attributes that directly improve decompiled output usability/correctness:
         {variable/identifier/function names, types, function signatures/ABI/calling convention,
          structs/fields, constants/enums, control-flow structuring, data-flow recovery,
          API/library call recovery, symbol recovery, stack variable recovery}.
       - Must be explicitly framed as helping decompilation/source recovery/readability OR
         evaluated in a way tied to decompiled output correctness/usability (e.g., improvement on decompiler output,
         enabling retyping, improved structured pseudocode, improved recompilation feasibility).
       -> IN-COMP (go to Stage-2)

   4c) EXCLUDE (Not decompilation-adjacent enough):
       - Tasks mainly about classification/detection/search without reconstruction intent:
         {malware classification, vulnerability detection, binary similarity search, authorship, clustering}
         -> EX-NORECON
       - Pure disassembly / instruction decoding / lifting as an end in itself without reconstruction intent -> EX-DISASM
       - Deobfuscation/packing/unpacking unless it explicitly evaluates improvement to reconstruction outputs -> EX-DEOBF
       - Output is embeddings/features/scores only, not used to generate L1–L4 outputs -> EX-NOOUT

   If unclear from title/abstract:
     - output type unclear (source/pseudocode/AST vs attributes-only vs embeddings) -> UNS-OUT
     - intent unclear (reconstruction vs classification/detection) -> UNS-INTENT
     - component link to decompilation unclear (why it matters to reconstruction) -> UNS-LINK

5) Stage-1 Outcome (Title/Abstract)
   - If clearly IN-CORE or IN-COMP and no major uncertainty -> PASS-TA
   - If potentially relevant but key info missing/ambiguous -> UNSURE-TA (go Stage-2)
   - If any EX-* triggered with confidence -> EX-* (stop)

6) Stage-2 (Full-text) Final Decision
   - If confirmed IN-CORE -> INCLUDE-CORE
   - Else if confirmed IN-COMP -> INCLUDE-COMP
   - Else -> EX with the most specific reason code above
   - If full text unavailable or still insufficient technical detail -> EX-NOMETHOD (or UNS-FT per app policy)

----------------------------------------
[Include Conditions (IN) with reason codes]
----------------------------------------
IN-CORE:
  - ML/LM-based method that reconstructs higher-level code representation from binary/asm/bytecode/derived IR,
    intended as decompilation output (source/pseudocode/AST/HLIR).

IN-COMP:
  - ML/LM-based method for decompilation-relevant partial recovery (names/types/signatures/structs/etc.)
  - The contribution is explicitly tied to decompilation/source recovery/readability OR evaluated via
    impact on reconstruction outputs/usability/correctness.

----------------------------------------
[Exclude Conditions (EX) with reason codes]
----------------------------------------
EX-DUP      Duplicate record (keep best version)
EX-TIME     Outside time window
EX-NONPUB   Non-scholarly / insufficiently archived
EX-NOMETHOD No technical method/pipeline described
EX-NOBIN    No binary/asm/bytecode/decompiler-IR (derived) input
EX-NOML     No ML/DL/LM component as a core method
EX-NORECON  No reconstruction intent (classification/detection/search only)
EX-DISASM   Disassembly/decoding/lifting only; no higher-level recovery intent
EX-DEOBF    Deobfuscation/unpacking only; not tied to reconstruction outputs/eval
EX-NOOUT    Output is embeddings/features/scores only (no L1–L4 recovery outputs)

----------------------------------------
[Uncertainty Codes (Stage-1)]
----------------------------------------
UNS-IN       Low-level input unclear
UNS-ML       ML/LM usage unclear
UNS-OUT      Output type unclear (L1–L4 vs embeddings)
UNS-INTENT   Reconstruction intent unclear vs classification/detection
UNS-LINK     For components: link to decompilation improvement unclear
UNS-TA       Generic unsure (use only if none above fits)
UNS-FT       Full-text insufficient/Unavailable (if your app supports this)

----------------------------------------
[Extraction Tags (for PASS-TA / included papers)]
----------------------------------------
OutputLevel (final/main output):
  L1 = compilable or near-compilable source (compile/test mentioned or explicit claim)
  L2 = structured pseudocode / decompiler-like code
  L3 = AST / HLIR / structured IR intended as recoverable higher-level representation
  L4 = attributes-only recovery (types/names/signatures/structs/etc.)
  UNKNOWN

Granularity:
  G1(blk/insn) / G2(func) / G3(module/file) / G4(program) / UNKNOWN

InputType:
  binary / machine code / assembly / bytecode / derived IR / UNKNOWN

Method:
  LLM / Transformer(non-LLM) / seq2seq / GNN / other ML / hybrid / UNKNOWN

Position:
  direct decompilation / decompiler-output postprocess / component-recovery / lifting-to-IR / UNKNOWN

Compilability (attribute only; not an IN condition):
  COMP-YES / COMP-NO / COMP-NOT-CLAIMED

----------------------------------------
[Notes: Compilability handling]
----------------------------------------
- Do NOT use "compilable source" as a universal inclusion condition.
- Extract it for all INCLUDED papers as COMP-*.
- Optional strict subset for CORE comparison:
  CORE-COMPSET = {INCLUDE-CORE with COMP-YES OR explicit compile+test evaluation}
  while still keeping other INCLUDE-CORE papers in narrative/appendix.

----------------------------------------
[Stage-2 Clarifications (Full text checks)]
----------------------------------------
- Confirm the low-level input truly originates from binary/asm/bytecode (not source-only).
- Confirm ML/LM is essential (not a minor baseline/tool).
- For IN-COMP, confirm explicit linkage to decompilation/source recovery OR evaluation tied to reconstruction usability/correctness.
- If a paper contains both CORE and COMPONENT contributions, classify as INCLUDE-CORE and add component tags in extraction.