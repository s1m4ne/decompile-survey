# Screening Rules (Operational) — Decompilation Survey (CORE-ONLY, no L4)
# Two-stage screening: Stage-1 (Title/Abstract) -> Stage-2 (Full text)
# Scope mode: CORE-ONLY (L1–L3 only); L4 (attributes-only) excluded this round
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

4) Task Relevance (CORE-only this round; L1–L3 required)
   4a) CORE (E2E / Near-core accepted):
       - Produces higher-level program representation intended for reconstruction/readability:
         {source code OR structured pseudocode OR AST/HLIR} from {binary/asm/bytecode/derived IR}.
       - Includes also: "decompiler output post-processing" IF input is decompiler pseudocode/IR and
         output is still {source/pseudocode/AST/HLIR} and is explicitly tied to decompilation improvement.
       -> IN-CORE (go to Stage-2 and extract details)

   4b) EXCLUDE (Non-core or L4-only):
       - Attributes-only recovery (L4-only): {types, variable names, function names, signatures/ABI,
         structs/fields, constants/enums, symbol recovery} WITHOUT producing L1–L3 as final output
         -> EX-L4
       - No reconstruction intent (classification/detection only):
         {malware classification, vulnerability detection, binary similarity, clustering, authorship}
         -> EX-NORECON
       - Disassembly/decoding/translation only without higher-level reconstruction -> EX-DISASM
       - Deobfuscation/unpacking only unless it explicitly outputs L1–L3 reconstruction and evaluates it
         -> EX-DEOBF
       - Output is embeddings/features/scores only (no L1–L3 generation) -> EX-NOOUT

   If output representation unclear (L1–L3 vs embeddings vs L4-only) from title/abstract -> UNS-OUT
   If intent unclear (reconstruction vs classification) -> UNS-INTENT

5) Stage-1 Outcome (Title/Abstract)
   - If clearly IN-CORE and no major uncertainty -> PASS-TA
   - If potentially relevant but key info missing/ambiguous -> UNSURE-TA (go Stage-2)
   - If any EX-* triggered with confidence -> EX-* (stop)

6) Stage-2 (Full-text) Final Decision
   - If confirmed IN-CORE -> INCLUDE-CORE
   - If not meeting CORE-only requirements -> EX with the most specific reason code
   - If still not decidable (missing full text / insufficient detail) -> EX-NOMETHOD or UNS-FT (app policy)

----------------------------------------
[Include Conditions (IN) with reason codes]
----------------------------------------
IN-CORE:
  - ML/LM-based method that reconstructs a higher-level representation (L1–L3) from binary/asm/bytecode/derived IR,
    intended as decompilation output or improvement of decompilation output.
  - L1–L3 definition:
      L1 = compilable or near-compilable source (compile/test mentioned or explicit claim)
      L2 = structured pseudocode / decompiler-like code (not necessarily compilable)
      L3 = AST / HLIR / structured IR intended as recoverable higher-level representation

----------------------------------------
[Exclude Conditions (EX) with reason codes]
----------------------------------------
EX-DUP      Duplicate record (keep best version)
EX-TIME     Outside time window
EX-NONPUB   Non-scholarly / insufficiently archived
EX-NOMETHOD No technical method/pipeline described
EX-NOBIN    No binary/asm/bytecode/decompiler-IR (derived) input
EX-NOML     No ML/DL/LM component as a core method
EX-L4       L4-only (attributes-only final output; no L1–L3 produced)
EX-NORECON  No reconstruction intent (classification/detection/search only)
EX-DISASM   Disassembly/decoding only; no higher-level reconstruction
EX-DEOBF    Deobfuscation/unpacking only; not tied to L1–L3 reconstruction outputs/eval
EX-NOOUT    Output is embeddings/features/scores only (no L1–L3 generation)

----------------------------------------
[Uncertainty Codes (Stage-1)]
----------------------------------------
UNS-IN       Low-level input unclear
UNS-ML       ML/LM usage unclear
UNS-OUT      Output type unclear (L1–L3 vs L4-only vs embeddings)
UNS-INTENT   Reconstruction intent unclear vs classification/detection
UNS-TA       Generic unsure (use only if none above fits)

----------------------------------------
[Extraction Tags (for included / pass-to-stage2)]
----------------------------------------
OutputLevel: L1 / L2 / L3 / UNKNOWN
Granularity: G1(blk/insn) / G2(func) / G3(module/file) / G4(program) / UNKNOWN
InputType: binary / machine code / assembly / bytecode / derived IR / UNKNOWN
Method: LLM / Transformer(non-LLM) / seq2seq / GNN / other ML / hybrid / UNKNOWN
Position: direct decompilation / decompiler-output postprocess / lifting-to-IR / UNKNOWN
Compilability (attribute only, not an IN condition): COMP-YES / COMP-NO / COMP-NOT-CLAIMED

----------------------------------------
[Notes: Compilability handling]
----------------------------------------
- Do NOT require compilable source as a universal inclusion condition.
- Always extract it as an attribute (COMP-*).
- (Optional later) define CORE-COMPSET = {INCLUDE-CORE with COMP-YES or explicit compile+test eval}
  for a stricter comparison subset, while keeping other INCLUDE-CORE in narrative.

----------------------------------------
[Stage-2 Clarifications (Full text checks)]
----------------------------------------
- Confirm that final output is L1–L3 (not only L4 or embeddings).
- Confirm that the low-level input truly originates from binary/asm/bytecode (not source-only).
- Confirm ML/LM is essential to the method (not a minor baseline/tool).