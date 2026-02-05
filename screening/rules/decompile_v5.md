# Screening Rules (Operational)
# Two-stage screening: Stage-1 (Title/Abstract) -> Stage-2 (Full text)
# Scope mode: LAYERED (Core + Components map)
# Time window: 2017-01-01 .. 2026-12-31
# Publication types: peer-reviewed OR arXiv/preprint with sufficient technical detail

----------------------------------------
[Decision Flow]
----------------------------------------
0) Dedup
   - If duplicate (same DOI/arXiv ID/title+authors), keep the most complete version. -> EX-DUP

1) Time & Document Type
   - If outside time window -> EX-TIME
   - If non-scholarly (blog, tutorial-only, slides-only, patent, marketing) -> EX-NONPUB
   - If no technical method described (opinion/position without method/eval) -> EX-NOMETHOD

2) Domain Relevance (Binary/Low-level input)
   Include candidate if it targets at least one of:
   - native binary / machine code / assembly / executable
   - bytecode (only if the goal is decompilation/source reconstruction from bytecode)
   - decompiler IR (e.g., lifted IR / decompiler intermediate forms)
   Else -> EX-NOBIN

3) ML Relevance
   - If it uses ML/DL/LM/LLM as a core component (training/inference) -> proceed
   - If it is purely rule-based/static analysis without ML -> EX-NOML
   - If unclear from title/abstract -> UNS-ML (Stage-2 check)

4) Task Relevance (Core vs Components vs Out-of-scope)
   4a) Core (E2E / Near-core):
       - The method produces higher-level program representation intended for human-readable reconstruction:
         {source code OR structured pseudocode OR AST/HLIR} from {binary/asm/IR}.
       -> IN-CORE (go to Stage-2 and extract details)

   4b) Components (Partial recovery relevant to decompilation):
       - Focuses on recovering attributes that directly improve decompiled output usability/correctness:
         {variable/identifier names, types, function signatures, structs/fields, constants/enums,
          control-flow structuring, data-flow recovery, API/library call recovery, symbol recovery}.
       -> IN-COMP (map as component; not necessarily compared head-to-head with Core)

   4c) Exclude (Not decompilation-adjacent enough):
       - Tasks mainly about classification/detection without reconstruction intent:
         {malware classification, vulnerability detection, binary similarity search, authorship, clustering}
       -> EX-NORECON
       - Pure disassembly or instruction decoding without higher-level reconstruction -> EX-DISASM
       - Pure deobfuscation/packing/unpacking unless it explicitly evaluates improvement to decompilation outputs -> EX-DEOBF

5) Stage-1 Outcome (Title/Abstract)
   - If meets IN-CORE or IN-COMP with no major uncertainty -> PASS-TA
   - If potentially relevant but key info missing/ambiguous -> UNSURE-TA (go Stage-2)
     Typical Unsure triggers:
       * output representation not specified (source? pseudocode? just embeddings?) -> UNS-OUT
       * input unclear (binary/asm vs source) -> UNS-IN
       * ML usage unclear -> UNS-ML
       * reconstruction intent unclear vs classification -> UNS-INTENT

6) Stage-2 (Full-text) Final Decision
   - If confirmed IN-CORE -> INCLUDE-CORE
   - If confirmed IN-COMP -> INCLUDE-COMP
   - Else -> EX with the most specific reason code above

----------------------------------------
[Include Conditions (IN) with reason codes]
----------------------------------------
IN-CORE:
  - ML/LM-based method that reconstructs higher-level code representation from binary/asm/IR,
    intended as decompilation output (source/pseudocode/AST/HLIR).
IN-COMP:
  - ML/LM-based method for decompilation-relevant partial recovery (names/types/signatures/structs/etc.)
  - The contribution is evaluated or demonstrated in a way tied to decompilation usability/correctness.

----------------------------------------
[Exclude Conditions (EX) with reason codes]
----------------------------------------
EX-DUP      Duplicate record
EX-TIME     Outside time window
EX-NONPUB   Non-scholarly / insufficiently archived
EX-NOMETHOD No technical method (position/opinion only)
EX-NOBIN    Not targeting binary/asm/bytecode/decompiler IR inputs
EX-NOML     No ML/DL/LM component
EX-NORECON  No reconstruction intent (classification/detection only)
EX-DISASM   Disassembly/decoding only, no higher-level recovery
EX-DEOBF    Deobfuscation only, not tied to reconstruction outputs/eval

----------------------------------------
[Notes: "Compilability" handling]
----------------------------------------
- Do NOT use "compilable source" as a universal IN condition.
- Extract it as an attribute for all included papers:
  COMP-YES / COMP-NO / COMP-NOT-CLAIMED
- If you choose Scope Option A for the Core chapter only:
  add a sub-filter for Core comparison set:
    CORE-COMPSET = {papers with COMP-YES OR explicit compile+test evaluation}
  while still keeping other IN-CORE papers in the narrative (as Near-core) or appendix.
