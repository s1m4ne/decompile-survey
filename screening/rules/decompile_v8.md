# Decompilation Survey Screening Rules v8

本ルールは **Title/Abstract だけ**で「include / exclude / uncertain」を判定し、同時に **理由コード（reason code）**で分類するための基準である。

---

## 1. Operational Definition（操作的定義）

本サーベイにおける「デコンパイル（decompilation）」を以下のように定義する：

- **入力**: 低水準表現（バイナリ/機械語/アセンブリ/バイトコード、またはそれら由来の低水準IR）
- **出力**: より高水準のプログラム表現（ソース/擬似コード/AST/高水準IR、または高水準属性）
- **目的**: 復元・可読化・高水準意味回復・逆解析支援（= 単なる分類/検知が主目的ではない）
- **手法**: LLM または ML を手法の中核として用いる（単なる言及は除外）

---

## 2. Output Level（出力レベル）

出力の「レベル」を以下の L1-L4 として扱う（採択条件そのものではなく、判定の一貫性のための補助軸）。

- **L1**: コンパイル可能なソース（またはそれに近い。compile/test を評価または明示）
- **L2**: 擬似コード/構造化コード（非コンパイルでも良いがコード様の表現）
- **L3**: AST/高水準IR/構文木などの高水準表現
- **L4**: 高水準属性のみ（型・識別子・シグネチャ・制御構造など）

---

## 3. Scope Layer（二層スコープ）

### Core（主対象）
L1-L3 を主な成果物として **復元・生成**する研究、または既存デコンパイラ出力を LLM/ML で **改善**する研究。

### Peripheral（周辺対象）
最終成果が L4（属性のみ）でも、デコンパイルに直結する要素技術として扱う。
ただし Peripheral は次の 3 条件をすべて満たす場合のみ採択候補：

1. 入力が低水準表現（binary/asm/bytecode/由来IR）
2. 出力が高水準復元に直接寄与する要素（型/識別子/シグネチャ/制御構造など）
3. 目的が decompilation / source recovery / reverse engineering の改善として明示されている

---

## 4. Decision Flow（判定フロー）

1. まず Exclude Criteria（EC）に該当するか確認し、該当するなら **exclude**
2. EC に該当しない場合、Include Criteria（IC）を満たすなら **include**
3. 必要情報がアブストラクトから取れない場合は **uncertain**（推測で exclude しない）

---

## 5. Include Criteria（採択基準）

以下をすべて満たすこと：

- **IC0**: 低水準入力がある（または明確に由来が書かれている）
- **IC0**: LLM/ML が中核手法として使われている
- **IC0**: 目的が復元/可読化/意味回復である（分類/検知が主目的ではない）

上記を満たした上で、該当するカテゴリに応じて理由コードを付ける。

### IC1: Core Decompilation（`in_core`）
LLM/ML が低水準入力から L1-L3 の高水準表現を直接生成/再構成する。

**典型例**: binary-to-source, assembly-to-pseudocode, bytecode-to-code, decompiler-like code generation

### IC2: Decompiler Enhancement（`in_decompiler_enhancement`）
既存デコンパイラ出力（擬似コード/IR）を入力にし、LLM/ML で可読性・型付け・命名・構造化・コンパイル可能性などを改善する。

**注**: 主貢献が特定の要素（型/命名/制御構造）に集中している場合は、以下のより具体的なコードを **主コード**にする。

### IC3: Type Recovery（`in_type_recovery`）
型回復/型推論/シグネチャ復元（calling convention など含む）が主目的。
（L4 でも Peripheral 条件を満たせば include）

### IC4: Variable/Function Naming（`in_variable_naming`）
変数名/関数名/識別子の復元が主目的。
（L4 でも Peripheral 条件を満たせば include）

### IC5: Control Structure Recovery（`in_control_structure`）
制御構造（if/else/switch/loop 等）の復元・構造化が主目的。
（L4 でも Peripheral 条件を満たせば include）

---

## 6. Exclude Criteria（除外基準）

以下のいずれかに該当する場合は exclude。

### EC1: No ML/LLM（`ex_no_ml`）
ML/LLM を用いていない（ルールベース/静的解析のみ等）。

### EC2: No Low-level Input（`ex_no_lowlevel_input`）
入力が低水準表現でない（ソースのみ等）。

### EC3: No Code Generation / Reconstruction Intent（`ex_no_code_generation`）
復元・生成が主目的でない（分類/検知/類似度/検索/埋め込みのみ等）。

### EC4: Survey/Review（`ex_survey_or_meta`）
サーベイ/レビュー/メタ分析など。

### EC5: Out of Scope（`ex_out_of_scope`）
デコンパイルの範囲外（暗号解析、プロトコルRE、自然言語のみ等）。

---

## 7. Uncertain Criteria（保留基準）

以下の場合は uncertain。

- **UC1**: LLM/ML の使用が不明（`uns_unclear_method`）
- **UC2**: 入力が低水準か不明（`uns_unclear_input`）
- **UC3**: 出力が L1-L4 のどれか不明（`uns_unclear_output`）
- **UC4**: 重要情報不足でフルテキストが必要（`uns_need_fulltext`）

---

## 8. Reason Code Guidelines（コード付与ガイド）

1. `reason_codes` は **主コードを先頭**に置く（先頭が代表コードとして扱われる）
2. 可能なら **最も具体的なコード**を主コードにする（例: 命名なら `in_variable_naming` を主）
3. `reason_codes` は 1-3 個程度（主 1 + 補助 0-2）
4. 各コードに対して、abstract から **根拠引用（evidence）**と、なぜそのコードに該当するかの **説明（explanation）**を必ず書く
5. uncertain の場合は、足りない情報が何かも explanation に書く（例: 入力形式が不明 等）

