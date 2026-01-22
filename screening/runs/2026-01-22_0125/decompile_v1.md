# スクリーニング基準: デコンパイル研究 v1

## 採択条件（すべて満たす）

### 条件1: 機械学習/深層学習を使用している
- neural network, deep learning, machine learning, transformer, LLM, language model 等を使用

### 条件2: デコンパイル/ソースコード復元を扱っている
以下の入出力条件を満たすこと：

**入力**: 以下のいずれか
- binary（バイナリ）
- assembly（アセンブリ）
- decompiler output（デコンパイラ出力）

**出力**: 以下のいずれか
- ソースコード（C/C++/Rust等の高級言語）
- デコンパイル擬似コードの修復・高級化（readability改善を含む）

## 除外条件（いずれか該当で除外）

以下のタスクに該当する場合は除外：
- matching / retrieval（コード検索・類似度マッチング）
- identification（関数識別・バイナリ識別）
- SCA（Software Composition Analysis、ソフトウェア構成分析）
- summarization（コード要約）
- vulnerability detection（脆弱性検出）
- patch detection（パッチ検出）
- verification（検証）
- IR-only（LLVM IR等の中間表現止まりで、高級言語への変換なし）

## 判定の注意点

- タイトルやアブストラクトに "decompile" が含まれていても、上記の除外条件に該当する場合は exclude
- 逆アセンブル（disassembly）のみで、ソースコード復元を行わない場合は exclude
- バイナリ解析ツールの改善でも、最終出力がソースコードでない場合は exclude
