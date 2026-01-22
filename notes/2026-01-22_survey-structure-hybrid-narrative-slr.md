了解。今までの議論（**論文集合を分けて扱う：Narrative set / LLM set / 任意のContextual set**）を前提に、**重厚すぎないハイブリッド型**として全体構成を作り直します。

---

# 全体構成（ハイブリッド：歴史ナラティブ＋最新準SLR）

## Abstract

* 目的（歴史の系譜整理＋2017–2026のLLM-based体系化）
* 方法（Narrative：引用追跡／Semi-SLR：DB検索＋重複排除＋段階スクリーニング）
* コーパス規模（LLM set採択数）と主な発見（taxonomy・評価の課題）
* 結論（課題とロードマップ）

---

## 1. Introduction

1.1 背景：decompilationの難しさとLLM導入の意義
1.2 スコープと貢献（「歴史＝文脈化」「最新＝体系化」の二本立て）
1.3 Research Questions（例）

* RQ1：LLM-based decompilationは何を対象にしているか（入力・出力・粒度）
* RQ2：手法はどう分類できるか（taxonomy）
* RQ3：評価・再現性はどうなっているか／比較困難点は何か
* RQ4：歴史的課題と照らしてLLMで何が変わったか
  1.4 論文構成

---

## 2. Scope, Definitions, and Paper Sets（“論文の扱い”を先に固定）

2.1 タスク境界の定義（decompilationと周辺タスクの線引き）
2.2 本論で扱う入力・出力の整理（binary/asm/IR/bytecode × source/pseudocode/IR）
2.3 論文集合の分割と目的（重要）

* **Narrative set（歴史章用）**：系譜と評価変遷を説明する代表論文（引用追跡中心）
* **LLM set（準SLR主集合）**：2017–2026のLLM-based decompilation（DB検索＋スクリーニング）
* **Contextual set（任意）**：pre-LLM learning系の比較対象（別枠で最小限）
  2.4 二重計上しないルール（統計・件数はLLM setのみ等）

---

## 3. Historical Evolution & Evaluation Shifts（歴史パート：ナラティブの主章）

> ここが「歴史パート」。網羅ではなく、系譜と評価指標の変遷を“論点駆動”で示す。

3.1 何が失われ、何が難しいのか（最適化・情報欠落・難読化）
3.2 技術の系譜（タイムライン中心：解析→learning→LLM前夜）
3.3 代表的アプローチの論点整理（構造化・型復元・IR/lifting・補助解析など）
3.4 評価の変遷（正解定義、指標、ベンチ、条件差の問題）
3.5 LLM章へつながる未解決課題（「なぜLLMに期待が集まるか」）

（図の候補：技術×評価のタイムライン、タスク境界の表）

---

## 4. Method: Semi-SLR for LLM-based Decompilation (2017–2026)

4.1 Protocol（準SLRとして採用する要素／採用しない要素）
4.2 情報源（IEEE/ACM/WoS/arXiv/SpringerLink＋主要会議サイト補完）
4.3 Search strategy

* 主検索（decompil*軸）
* 補助検索（binary-to-source / reconstruction / lifting 等＋LLM語彙でノイズ抑制）
* 検索範囲（Title+Abstract）、検索日、フィルタ
  4.4 Screening
* Stage0 全インポート → Stage1 重複排除 → Stage2 タイトル/要旨 → 必要時のみ全文補助
* 除外理由カテゴリ（LLM不使用、decompilation外、理解支援のみ等）
  4.5 Inclusion/Exclusion（LLM-basedの境界を表で明示）
  4.6 Data extraction（比較表の列定義：入力/出力/モデル/補助情報/データ/指標/資産…）
  4.7 Reporting checklist（報告の有無チェック：比較困難性の説明に使う）
  4.8 Synthesis / Taxonomy construction（分類軸の作り方：パイロット→改訂）

---

## 5. Results I: Study Selection & Corpus Overview（LLM set）

5.1 件数推移（PRISMA風フロー：全件→重複→Stage2→採択）
5.2 除外理由の内訳（カテゴリ別件数）
5.3 採択論文の俯瞰（年次、媒体、入力/出力、対象言語、タスク粒度）

---

## 6. Results II: Taxonomy and Comparative Analysis（LLM setの本編）

6.1 Task & Scope mapping（入力×出力×粒度のマップ）
6.2 Approach taxonomy（例：prompt/反復、解析統合、RAG/tool、verification、fine-tuning等）
6.3 Data and supervision（データ生成・合成、弱教師、学習設定の傾向）
6.4 Evaluation practices（データセット、指標、ベースライン、条件差）
6.5 Reproducibility（コード/データ/モデル/環境・再現手順の公開状況）

（表の候補：主要比較表／図の候補：バブル・ヒートマップ）

---

## 7. Discussion: What Changed with LLMs?（歴史章と接続）

7.1 歴史的課題（3章）に対してLLMが改善した点／残る点（RQ4）
7.2 成功条件と失敗モード（どの前提で効くか、どこで崩れるか）
7.3 比較不能性の原因整理 → 標準化の方向性（評価・ベンチ・条件）
7.4 研究ギャップとロードマップ（ベンチ整備、意味同等性評価、運用要件、検証）

---

## 8. Limitations / Threats to Validity

* 検索・DBの偏り、キーワード限界、gray、会議サイト補完の限界
* スクリーニングの主観（運用ルールで緩和した点）
* 評価不統一による横比較の限界
* 歴史パート（Narrative set）の代表性と停止条件の限界

---

## 9. Conclusion

* 歴史（系譜＋評価変遷）と、準SLR（LLM taxonomy＋比較困難点）を統合して総括
* 最重要メッセージと次の一手

---

## Appendix（推奨：軽量に透明性を担保）

A. DB別クエリ・検索日・ヒット件数ログ
B. 除外理由カテゴリ定義
C. 抽出フォーム（比較表の列定義）
D. 採択論文一覧（LLM set）
E. 追加図表（拡張比較表、マッピング）
F. （任意）Contextual set一覧（入れる場合のみ）

---

この構成だと、**歴史パートは第3章として明確に独立**しつつ、**件数推移や比較表で“論文をどう扱ったか”はLLM set側に閉じて**、二重計上や過剰な重厚さを避けられます。
