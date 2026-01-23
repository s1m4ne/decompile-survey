了解。「**LLMの使い方（手法）**」で、いまの **40本（境界3本込み / Exclude 3本除外）**をざっくり分類するね。
※タイトル（＋前に見た要旨の雰囲気）ベースなので、本文で入れ替わる可能性はあります。

---

## 1) そのままLLMに翻訳させる系（prompt主体 / 直デコンパイル）

* **LLM4Decompile** (tan_llm4decompile_2024)
* **Interactive End-to-End Decompilation** (feng_interactive_2025)
* **CodeInverter Suite** (liu_codeinverter_2025)
* **WaDec (Wasm)** (she_wadec_2024)
* **Decompiling Smart Contracts with a LLM** (david_decompiling_2025)

**特徴**：特別な中間表現より「LLMに食わせる入力整形＋prompt」で押す。

---

## 2) 小型LLM・専用LLMを作る系（Small/Portable / 学習して持ち運ぶ）

* **SLaDe: Portable Small Language Model Decompiler** (armengol-estape_slade_2024)

**特徴**：大規模汎用LLMではなく、目的特化モデルを（小さく）作る路線。

---

## 3) コンテキスト構築・補助情報で当てに行く系（context augmentation）

* **Self-Constructed Context Decompilation** (feng_self-constructed_2024)
* **ReF Decompile: Relabeling & Function Call Enhanced** (feng_ref_2025)
* **Context-Guided Decompilation (Re-executability)** (wang_context-guided_2025)
* **SK2Decompile: Two-Phase** (tan_sk2decompile_2025)

**特徴**：関数呼び出し関係・ラベル付け・周辺文脈を作って、LLMの推論を安定させる。

---

## 4) 構造（AST/木/IR）を吐かせる・構造化する系（structured output）

* **SALT4Decompile: Abstract Logic Tree** (wang_salt4decompile_2025)
* **StackSight: neurosymbolic CoT decompilation (Wasm)** (fang_stacksight_2024)
* **DiSCo (EVM)** (su_disco_2025) ※“sourceに落とす”というより構造寄りの可能性あり

**特徴**：いきなりC/solidityを出すより、**木構造/IR**を経由して精度と整合性を狙う。

---

## 5) RAG（検索・参照）で“もっともらしさ”ではなく“整合性”を上げる系

* **FidelityGPT: Correcting… with Retrieval Augmented Generation** (zhou_fidelitygpt_2025)

**特徴**：LLM単体の幻覚対策として、検索・参照を組み込む。

---

## 6) 学習・微調整でLLM自体を“デコンパイル向けに鍛える”系（fine-tune / training objective）

* **D-LiFT: code-quality-driven fine-tuning** (zou_d-lift_2025)
* （SLaDeも広義にはここに含めても良い：専用モデルを作るので）

**特徴**：prompt工夫よりも、学習で性能を引き上げる。

---

## 7) “出力の修復/整形”にLLMを使う系（post-edit / refine）

* **Refining Decompiled C Code with LLMs** (wong_refining_2023)
* **Augmenting Smart Contract Decompiler Output… (semantic recovery)** (liao_augmenting_2025)
* （FidelityGPTも「修復」寄りだが、RAG枠に入れて分離）

**特徴**：既存デコンパイラの出力を、LLMで読みやすく/正しくする。

---

## 8) “再コンパイル可能/再実行可能”を主目標にする系（correctness-first）

* **DecLLM: recompilable decompilation** (wong_decllm_2025)
* **Context-Guided Decompilation: re-executability** (wang_context-guided_2025)

**特徴**：可読性より「ビルドできる/動く」を重視。

---

## 9) 対象ドメイン別（LLM適用先が特殊）

### 9-1) スマートコントラクト（EVM / Move）

* david_decompiling_2025, su_disco_2025, chen_suigpt_2025, liao_augmenting_2025

### 9-2) WebAssembly

* she_wadec_2024, fang_stacksight_2024

### 9-3) 境界（“ソース復元”より仕様復元っぽい）

* **Decompiling x86 DNN Executables** (liu_decompiling_2022)
* **NeuroDeX (DNN executables)** (li_neurodex_2025)
* **REMEND (math equations)** (udeshi_remend_2025)

---

### 次やると良い整理（すぐ出せる）

あなたが「NLP枠を入れるか検討」と言ってたので、次は分類をさらに一本化して、

* **LLMを“生成器”として使う**（直デコンパイル/構造化/二段階）
* **LLMを“補助器”として使う**（修復/型/命名/意味回復）
* **LLMを“検証・整合性担保”に使う**（RAG/再実行可能）

の3本立てにまとめ直すこともできます。

「NLP枠（命名・型推定・NMT系）」もこの40に含めたまま、同じ軸で整理する？それとも今回は“LLMデコンパイル本流（2023以降中心）”だけで整理する？
