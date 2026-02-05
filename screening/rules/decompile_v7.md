# Decompilation Survey Screening Rules v7

## Scope Definition

本サーベイは「データ駆動（LLM/ML）による逆コンパイル・コード復元」を対象とする。

**対象の定義:**
- 低水準表現（バイナリ/機械語/アセンブリ/バイトコード/低水準IR）から
- 高水準表現（ソースコード/擬似コード/AST/高水準IR/型・変数名等の属性）を
- LLM または機械学習を用いて復元・生成する研究

---

## Include Criteria (採択基準)

以下のいずれかに該当する場合は **include** と判定する。

### IC1: Core Decompilation (`in_core`)
LLM/MLが低水準入力から高水準コードを直接生成する研究。

**入力例:**
- Native binary / machine code
- Assembly code
- Bytecode (JVM, .NET, Python, etc.)
- Low-level IR (LLVM IR低水準形式, Ghidra P-code等)

**出力例:**
- Compilable source code (C/C++/Java/Python等)
- Pseudocode / structured code
- AST / high-level IR

**キーワード:** decompilation, binary-to-source, disassembly-to-code, neural decompiler

### IC2: Decompiler Enhancement (`in_decompiler_enhancement`)
既存デコンパイラの出力をLLM/MLで改善する研究。

**対象:**
- 可読性向上（変数名・関数名の意味付け）
- コンパイル可能性の向上
- コメント・ドキュメント生成
- コードスタイルの正規化

**キーワード:** decompiled code refinement, readability improvement, LLM post-processing

### IC3: Type Recovery (`in_type_recovery`)
デコンパイルされたコードの型を推論・復元する研究。

**対象:**
- 変数の型推論
- 関数シグネチャの復元
- 構造体・クラスの再構築
- ポインタ型の解析

**キーワード:** type inference, type recovery, signature recovery

### IC4: Variable/Function Naming (`in_variable_naming`)
デコンパイルされたコードの識別子名を復元する研究。

**対象:**
- 変数名の予測・復元
- 関数名の予測・復元
- クラス名・メソッド名の復元

**キーワード:** variable name prediction, function naming, identifier recovery

### IC5: Control Structure Recovery (`in_control_structure`)
制御構造を復元・再構成する研究。

**対象:**
- if/else/switch の復元
- ループ構造 (for/while) の復元
- goto除去・構造化
- 例外処理の復元

**キーワード:** control flow structuring, loop recovery, goto elimination

---

## Exclude Criteria (除外基準)

以下のいずれかに該当する場合は **exclude** と判定する。

### EC1: No ML/LLM (`ex_no_ml`)
ML/LLMを使用していない研究。

**除外対象:**
- 純粋にルールベース/パターンマッチングのみ
- 静的解析のみ
- シンボリック実行のみ
- 従来型コンパイラ技術のみ

### EC2: No Low-level Input (`ex_no_lowlevel_input`)
入力が低水準表現でない研究。

**除外対象:**
- ソースコード→ソースコード変換 (transpilation)
- コード要約・説明生成（ソース入力）
- コード補完・生成（ソース入力）
- テスト生成（ソース入力）

### EC3: No Code Generation (`ex_no_code_generation`)
コード生成を行わない研究。

**除外対象:**
- バイナリ類似度計算 (binary similarity)
- マルウェア分類・検出
- 脆弱性検出・分類
- バイナリ埋め込み (embedding) のみ
- コードクローン検出

### EC4: Survey/Review (`ex_survey_or_meta`)
サーベイ・レビュー論文。

**除外対象:**
- Systematic literature review
- Survey paper
- Meta-analysis
- Tutorial / overview

### EC5: Out of Scope (`ex_out_of_scope`)
デコンパイル領域外のトピック。

**除外対象:**
- 暗号解析
- プロトコルリバースエンジニアリング
- ハードウェア記述言語 (HDL)
- 自然言語処理（コード無関係）

---

## Uncertain Criteria (保留基準)

以下の場合は **uncertain** と判定する。

### UC1: Unclear Method (`uns_unclear_method`)
アブストラクトからML/LLMの使用有無が判断できない。

### UC2: Unclear Input (`uns_unclear_input`)
アブストラクトから入力形式が判断できない。

### UC3: Unclear Output (`uns_unclear_output`)
アブストラクトから出力形式が判断できない。

### UC4: Need Full Text (`uns_need_fulltext`)
アブストラクトの情報が不十分で、フルテキスト確認が必要。

---

## Decision Guidelines

1. **Include優先:** 境界ケースでIncludeの可能性があれば、uncertainよりincludeを優先
2. **複数該当:** 複数のInclude基準に該当する場合、全てのreason_codeを記録
3. **Confidence:**
   - Include/Exclude: 0.70〜1.00
   - Uncertain: 0.30〜0.69
4. **Evidence:** アブストラクトから根拠となるフレーズを英語のまま引用
