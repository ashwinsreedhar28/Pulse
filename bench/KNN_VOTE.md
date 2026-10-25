# Supervised baselines on the 271 gold set: sampling-stratum prior and kNN history vote

2026-10-25. Exploratory. Two rows that VALUECHAIN_EVAL.md lacked: a leave-one-out prior on the fixture's sampling stratum, and a labelled-history kNN vote (classification as retrieval, after XERJ's `benchmarks/decisions-as-retrieval`). Script `bench/knn_vote.py`; per-article predictions, confidences and inputs in `bench/knn_vote.json`. Audited independently twice (Claude, then Codex gpt-6-astra, Oct 25); all numbers below reproduce from gold.json + articles_300.json + quality.csv.

What this is not: a frozen evaluation. k = 10 and the 1/(rank+1) weights were set before the run, but arm, decoder, threshold, primary metric and the 4/5 merge were not pre-registered, and the LOO is retrospective (BM25/TF-IDF statistics include the query document; 1,326 of 2,710 BM25 neighbour positions postdate their query; near-duplicate stories — e.g. two Celanese Q2 earnings summaries — remain in each other's neighbourhoods). Treat it as a diagnostic of the existing table, not a new result.

## Headline (n = 271 unless noted; Haiku 265 parsed)

| row | exact | MAE | alert recall | precision | 4/5-merged exact | merged MAE |
|---|---|---|---|---|---|---|
| majority class (always 4) | 48% | 0.87 | 100% (148/148) | 55% (123 false) | – | – |
| **sampling-stratum prior, LOO mode** | **61%** | **0.51** | 89% (132/148) | 82% (28 false) | 67% | 0.45 |
| Jev + links (argmax) | 52% | 0.55 | 82% (122/148) | 98% (2 false) | 65% | 0.41 |
| Sonnet + links | 40% | 0.67 | 89% (131/148) | 98% (2 false) | 64% | 0.43 |
| Haiku + links (265) | 41% | 0.66 | 84% (120/143) | 98% (3 false) | 65% (prior on same 265: 68%) | 0.42 |
| kNN BM25, headline + summary, argmax | 51% | 0.72 | 88% (130/148) | 69% (59 false) | – | – |
| kNN TF-IDF, headline + summary, weighted mean | 54% | 0.62 | 81% (120/148) | 75% (41 false) | – | – |

The prior: for each article, the modal gold score of the other 270 in the same fixture stratum (finance:1 → 2, finance:3 → 4, finance:5 → 4, cp → 3; no stratum is near a tie). finance:1/3/5 are Pulse's stored keyword score, which at the fixture's commit (`src/main/services/urgencyScorer.ts`) is computed from title + summary — the same text the models saw, not a fuller article body; the sampler reproduces all 240 numeric strata from fixture text alone. cp is the sampler's counterparty-only bucket, not a keyword score, so this is a *sampling-stratum* prior. Strata were hidden from the labeling UI and the prompts; no gold-to-stratum dependency found (shared upstream: the value-chain graph both selects cp articles and supplies the links labelers saw).

## Reading

1. **The prior beats every model on 5-level exact and MAE and loses badly on precision.** 61% / 0.51 vs Jev's 52% / 0.55; 28 false alarms vs 2. The 4/5 merge closes most of the exact gap (67% vs 65%) and flips MAE (0.45 vs 0.41); it is a post hoc sensitivity analysis and says nothing about the act-now tier.
2. **The comparison is not like for like: the prior is supervised on the labeler's scale, the model scores are not.** A post hoc diagnostic (not a baseline): map each Jev score to the LOO median gold label for that score and Jev reaches 65% exact / MAE 0.36 with its 122 true / 2 false alerts unchanged. The uncalibrated keyword scorer by itself (keyword score as the prediction) is 14% exact / MAE 1.17 / recall 51% / precision 95%. "Free" here means no inference call, not no supervision.
3. **Where the 5-level disagreement sits.** Jev + links vs gold: 22 gold-4 → 5 (Sonnet 61, Haiku 57; gold has 18 fives), 33 gold-2 → 1 (Sonnet 39, Haiku 32), 29 gold-3 → 1/2 (Sonnet 35, Haiku 28). A disagreement confined to 4 vs 5 did not trigger the adjudication rule (≥2 gap or alert flip), so those 40 cases kept Ashwin's label; 6 articles with 4 and 5 votes were adjudicated because a third vote triggered it, and 5 of the 18 gold fives came through adjudication. Labeler votes at 5: Ashwin 24, Opus 36, Sol 35; on 22 articles both labeler models said 5 and gold stayed 4. Haiku (70 fives) and Sonnet (74) resemble the labeler models more than the gold.
4. **The prior and the models miss different articles.** Of the prior's 16 missed positives (9 in finance:1, 7 in cp), Jev recovers 7, Sonnet 4, Haiku 7 of 13 parsed; Jev loses 17 positives the prior catches, Sonnet 5. BM25 no-links argmax recovers 11 of the prior's 16. Complementary, not an established ensemble.
5. **What the models demonstrably buy:** the 24 non-alerts in finance:3 (the prior alerts all 80; Jev/Sonnet 0–1 false there) and 4 in finance:5. Precision 82% → 98%.
6. **kNN.** No tested lexical configuration beats the prior on aggregate exact or MAE (best exact TF-IDF no-links weighted mean 54%; best MAE BM25 with links weighted mean 0.59). Adding the ticker + links text lowers recall (counterparty 5/7 → 1/7) and raises BM25 precision/MAE; why is untested.
7. **The confidence gate.** Argmax vote share, ECE 0.105–0.177; 20–24% of articles clear 0.8, at 73–81% exact and 84–95% gated alert precision (BM25 with links: 95%, 3 false on 59 articles). XERJ's 86.9% coverage / 97.9% accuracy is its MiniLM arm (not run here — huggingface.co unreachable); its BM25 arm is 50.6% / 99.6%. The tested lexical configurations at 0.8 did not reproduce the cited coverage and accuracy; whether a cascade (gate → model on the rest) helps needs the full cascade measured on the same articles with cost, and is not shown.

## For the eval write-up

- Add the sampling-stratum prior to the main VALUECHAIN_EVAL table as the supervised no-inference baseline, with its denominator and the parse-failure policy stated.
- Lead with alert recall/precision; show 4/5-merged exact beside 5-level exact, labelled post hoc.
- State the 4-vs-5 adjudication gap in the gold-set section.
- Report kNN and the gate as negative results, aggregate only.
- A confirmatory version needs: frozen protocol (arms, decoder, threshold, primary metric, merge policy) before data; chronological and story-group separation; paired uncertainty; cascade accuracy/cost/coverage. Not scheduled.

Not run (ideas, not results): kNN within stratum; prior + model cascade; MiniLM neighbours.

## For Jeremy's cell

Whether a history vote helps his KEEP/DROP set is an empirical question for his rows (binary, ~1,500–2,500 adjudicated, a real out-of-scope class); nothing here predicts it. The Pulse lesson that transfers: put the supervised prior and a calibrated-model row in the table before judging the models.

## Script output

# kNN history vote on the 271-article gold set (k = 10, leave-one-out)

Classification as retrieval, no model call (method from XERJ's decisions-as-retrieval benchmark): rank-weighted vote over the k nearest labelled articles; confidence = winning score's vote share. Same gold, alert and metric definitions as VALUECHAIN_EVAL.md. Gate = articles decided at confidence >= 0.8.

| arm | links | decoder | exact | within 1 | MAE | alert recall | precision | ECE | gate coverage | gate exact | gate alert-correct | gate alert precision |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| majority class (always 4) | – | – | 48% | 73% | 0.87 | 100% (148/148) | 55% (123 false) | – | – | – | – | – |
| sampling-stratum prior (LOO mode) | – | – | 61% | 90% | 0.51 | 89% (132/148) | 82% (28 false) | – | – | – | – | – |
| bm25 | no | argmax | 51% | 81% | 0.72 | 88% (130/148) | 69% (59 false) | 0.133 | 24% (66) | 73% | 83% | 84% (10 false) |
| bm25 | no | weighted mean | 52% | 86% | 0.64 | 80% (119/148) | 75% (39 false) | – | – | – | – | – |
| bm25 | yes | argmax | 48% | 86% | 0.70 | 80% (119/148) | 71% (48 false) | 0.177 | 22% (59) | 80% | 95% | 95% (3 false) |
| bm25 | yes | weighted mean | 51% | 91% | 0.59 | 75% (111/148) | 79% (29 false) | – | – | – | – | – |
| tfidf | no | argmax | 49% | 83% | 0.73 | 88% (130/148) | 67% (65 false) | 0.154 | 23% (63) | 75% | 86% | 85% (9 false) |
| tfidf | no | weighted mean | 54% | 86% | 0.62 | 81% (120/148) | 75% (41 false) | – | – | – | – | – |
| tfidf | yes | argmax | 46% | 84% | 0.74 | 79% (117/148) | 68% (55 false) | 0.170 | 20% (53) | 81% | 92% | 92% (4 false) |
| tfidf | yes | weighted mean | 51% | 90% | 0.61 | 73% (108/148) | 77% (32 false) | – | – | – | – | – |

Alert recall by stratum (argmax rows; gold positives per stratum in the header):

| arm | links | finance:1 (9) | finance:3 (56) | finance:5 (76) | finance:cp (7) |
|---|---|---|---|---|---|
| bm25 | no | 67% (6/9) | 84% (47/56) | 95% (72/76) | 71% (5/7) |
| bm25 | yes | 44% (4/9) | 86% (48/56) | 87% (66/76) | 14% (1/7) |
| tfidf | no | 67% (6/9) | 86% (48/56) | 96% (73/76) | 43% (3/7) |
| tfidf | yes | 56% (5/9) | 82% (46/56) | 86% (65/76) | 14% (1/7) |

Confidence histogram, bm25 with links (tenths): 0.0–0.1: 0, 0.1–0.2: 0, 0.2–0.3: 0, 0.3–0.4: 19, 0.4–0.5: 37, 0.5–0.6: 58, 0.6–0.7: 56, 0.7–0.8: 42, 0.8–0.9: 29, 0.9–1.0: 30
