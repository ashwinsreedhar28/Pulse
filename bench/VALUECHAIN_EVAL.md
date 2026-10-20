# Pulse urgency scoring: adjudicated gold set and value-chain links as input

2026-10-20. Follow-up to DECISION_MODELS.md (Jev / Clef-flash / Typical vs Haiku on 50 articles, Oct 14) and the blind-label finding that Haiku reads urgency as "breaking news" while the user reads it as "a holder should look at this today".

## Short version

- A new brief that states the criterion ("should a holder of one of these names look at this today?", levels defined) moves Haiku's alert recall from 39% to 73% on the same 271 articles. Measured against a gold set that was itself defined by brief v2, most of the Haiku gap was the brief, not the model.
- Passing each article's value-chain links as input raises alert recall for Jev, Haiku and Sonnet: Jev 74% → 82%, Haiku 73% → 84%, Sonnet 83% → 89%. Paired on the gold positives, links fix 12 Jev misses and break none (p = 0.0005), Sonnet 8/0 (p = 0.008), Haiku 19/5 (p = 0.007). On overall alert correctness (negatives included) the same tests are p = 0.002 / 0.039 / 0.052, and with a Holm correction across the five models only Jev stays under 0.05. Clef does not move; Typical's change (49% → 57%) is not distinguishable from zero, which is not evidence of no effect.
- With links, Jev (argmax) has the best exact agreement (52%) and MAE (0.55) of the argmax/temperature-0 configurations at 373 ms p50, ahead of Sonnet on the number and behind it on recall (82% vs 89%). Jev's expected-value decoder has MAE 0.54 with lower recall (65%); it is in VALUECHAIN_RESULTS.md.
- Every model except Typical has 96–100% alert precision: the errors are misses, not false alarms. Typical is the only one that over-alerts (precision 66–69%).
- Ensembles with the rules written before the runs give no recall advantage over Sonnet alone with links (vote rule 127/143 vs Sonnet 128/143 on the same articles); the mean-score ensemble does have the lowest MAE of anything (0.51 vs Sonnet's 0.68 on that subset).
- The links are mostly not backed by the filings they cite. A 20-edge hand check found 3 supported, 2 partial, 9 not naming the counterparty, 1 contradicted, 4 citing an unrelated company's filing; an automated check of all 388 edges (both endpoint names present in the cited document) verifies 86 (22%; 26% of the checkable ones). With verified edges only, the recall gain disappears: Haiku 73% → 73%, Sonnet 83% → 84%, Jev 74% → 77%, none significant, and the full link set beats verified-only for all three (Haiku 18 fixed / 3 broken, Sonnet 6/0, Jev 9/1). A ticker-only ablation (matched tickers with [held] tags, no edges) does not reproduce the gain either (Haiku 76%, Sonnet 80%, Jev 68%). So the gain comes from the unverified edges: either the generator's relationships are often right despite the citations, or the labelers and the models were reading the same text and gold inherited it. This design cannot separate the two. "Filing-backed links improve urgency scoring" is not supported by this data.

## Gold set

271 finance articles from Pulse's database (12,395 articles at the Oct 20 snapshot; counts from the sampler run), excluding the 50 from the Oct 14 table, deduplicated by title and URL. Stratified by Pulse's keyword urgency score so the sample covers the full range rather than only the ambiguous 3s: 80 each at keyword 1 / 3 / 5, plus 31 articles that name a filing-linked counterparty of a held name without naming a held name (31 of the 32 that pass the sampler's length and dedup filters; one more such article sits in the keyword-1 stratum). Holdings list: the 75 active tickers in Pulse, frozen in the fixture.

Brief v2 (bench/brief_v2.txt), frozen before any article was read. Levels: 5 act today (material to a held name), 4 look today (substantive coverage of a held name, or material news at a filing-linked supplier/customer), 3 glance, 2 routine, 1 ignore. Rule: direct coverage of a held name scores one notch above the same news at a linked company; names that are neither held nor linked do not raise the score. Alert = score ≥ 4.

One human labeler and two model labelers, each seeing headline, summary, and the article's links block: Ashwin (blind, 270 in 13.5 min, ~3 s per article, one skipped article scored afterwards), Claude Opus 5.5 and GPT-5.6 Sol via OpenRouter (neither is an evaluated model). This is one human judgment assisted by two models, not three independent human judgments. Adjudication rule, written into the project plan before labeling (plan doc timestamps; brief committed as 19f33df before the fixture was frozen): adjudicate when any pair differs by two or more points or disagrees on the alert; otherwise Ashwin's label stands. 89 of 271 went to adjudication; 77 were changed, all 77 toward the models (52 down, 25 up), with the model rationales visible. Ashwin's raw labels match the final gold 72% exact. Gold distribution 1–5: 22 / 51 / 50 / 130 / 18; alert rate 55%, 7% at 5.

Labeler agreement before adjudication: Opus vs Sol 75% exact, MAE 0.27; Ashwin vs Opus 41%, MAE 0.77; Ashwin vs Sol 41%, MAE 0.82. The fast first pass was systematically higher than both models on the keyword-1 stratum (36 of the 89 adjudications), and the models' rationales usually held up on a second read.

## Links as input

For each article: its matched tickers (Pulse's `article_ticker_matches`, plus a company-name match for counterparties of held names) → value-chain edges from `company_value_chains` with `source = 'filings'` touching those tickers → deduplicated (supplier/customer mirrors collapsed), held-name endpoints first, capped at 8, rendered as

    CRDO -> supplies -> NVDA [held] (10-K 2026)

238 of 271 articles have at least one link. The with-links variant appends this block to the brief; the no-links variant omits the section entirely (never "none"). The labelers saw the with-links text, so gold is conditional on the links shown.

## Results (271 articles, brief v2, alert = score ≥ 4, 148 positives)

| model | links | exact | within 1 | MAE | alert recall | precision | p50 |
|---|---|---|---|---|---|---|---|
| Haiku 4.5, brief v1 | no | 32% | 69% | 1.04 | 39% (58/148) | 97% | 1,068 ms |
| Haiku 4.5 | no | 38% | 87% | 0.78 | 73% (108/147) | 100% | 1,409 ms |
| Haiku 4.5 | yes | 41% | 94% | 0.66 | 84% (120/143) | 98% | 1,522 ms |
| Haiku 4.5 | mentions only | 43% | 88% | 0.71 | 76% (111/147) | 100% | – |
| Haiku 4.5 | verified edges only | 40% | 91% | 0.71 | 73% (106/146) | 100% | – |
| Sonnet 4.6 | no | 33% | 91% | 0.77 | 83% (122/147) | 99% | 2,283 ms |
| Sonnet 4.6 | yes | 40% | 94% | 0.67 | 89% (131/148) | 98% | 2,247 ms |
| Sonnet 4.6 | mentions only | 41% | 93% | 0.66 | 80% (117/147) | 100% | – |
| Sonnet 4.6 | verified edges only | 34% | 91% | 0.77 | 84% (124/147) | 98% | – |
| Jev 1.13 (argmax) | no | 41% | 83% | 0.79 | 74% (110/148) | 98% | 362 ms |
| Jev 1.13 (argmax) | yes | 52% | 94% | 0.55 | 82% (122/148) | 98% | 373 ms |
| Jev 1.13 (argmax) | mentions only | 42% | 85% | 0.76 | 68% (101/148) | 94% | – |
| Jev 1.13 (argmax) | verified edges only | 45% | 88% | 0.68 | 77% (114/148) | 99% | – |
| Clef-flash (argmax) | no | 29% | 86% | 0.85 | 30% (45/148) | 96% | 534 ms |
| Clef-flash (argmax) | yes | 29% | 85% | 0.86 | 29% (43/148) | 100% | 543 ms |
| Typical-medium (argmax) | no | 39% | 87% | 0.76 | 49% (73/148) | 69% (33 false) | 711 ms |
| Typical-medium (argmax) | yes | 43% | 87% | 0.74 | 57% (85/148) | 66% (44 false) | 749 ms |

Recall 95% CIs are about ±8 points at this n. Parsed outputs per run: Haiku v1 271, Haiku v2 267 (no links), 265 (links), 269 (mentions); Sonnet 270, 271, 270; all others 271. "Mentions only" appends `Companies this article mentions: CE [held], LIN` (the fixture's matched tickers) in place of the links block. "Verified edges only" is the links block restricted to edges whose both endpoint names appear in the cited document (bench/links_verified.json). Parsed: Haiku 269, Sonnet 270, Jev 271. Haiku's failures are truncated JSON at the 128-token budget, Sonnet's one is a quoted "score": "4"; the table excludes them (recall denominators show it). Counting a failed call as a miss instead, Haiku with links is 120/148 = 81%, not 84%. These are parser and output-budget outcomes as much as model outcomes. Expected-value decoding for the decision models is in bench/VALUECHAIN_RESULTS.md; it is worse on recall for all three and not shown here.

Paired links effect (same articles, alert correct with vs without links, exact McNemar):

| model | fixed by links | broken by links | p |
|---|---|---|---|
| Jev | 13 | 1 | 0.002 |
| Sonnet | 8 | 1 | 0.039 |
| Haiku | 19 | 8 | 0.052 |
| Typical | 25 | 24 | 1.00 |
| Clef | 12 | 12 | 1.00 |

By stratum, the links effect shows up where it should: on the 31 counterparty-only articles (7 positives) Haiku, Sonnet, Jev and Clef are 0 for 7 without links; with links Haiku catches 4 of its 6 parsed positives, Jev 2 of 7, Sonnet 1 of 7. Typical is 5 of 7 without links and 3 of 7 with, consistent with it alerting broadly rather than reading the links. On keyword-5 articles Jev goes 86% → 95%, Sonnet 92% → 97%.

Ensembles, rules fixed before the runs: (a) rounded mean score, alert ≥ 4; (b) alert if ≥ 2 of 5 models alert. With links: (a) 76% recall / 99% precision, (b) 89% / 98%. Sonnet alone with links is 89% / 98%. Same conclusion as on the 50.

Brief v2 alert rate is 55% of this sample (the sample is balanced across keyword strata, so this is not a population prevalence). That is a digest, not a ping; the user's reading is that 4 and 5 are "things I should read or have summarized", with 5 the act-now tier. The act-now tier is not reliable for any model: with links, score-5 precision is 12% (Jev), 19% (Haiku), 18% (Sonnet), and Jev catches 3 of 18 gold fives. High precision at ≥ 4 does not carry over to 5.

## What the links actually are

The generator that builds Pulse's value chains reads a company's latest 10-K Item 1, profile and recent news, and emits edges tagged with the source it was reading and a citation. 84% of the 14,104 edges carry `source = 'filings'`. Spot-check of 20 such edges touched by the labeled articles, reading the cited primary document on EDGAR (bench/SPOTCHECK_20.md):

- 3 supported by the cited text (Amkor → Qualcomm, 11.1% of 2025 sales; NetApp on Google Cloud; Fabrinet lists Celestica as a competitor).
- 2 partial (Cohu names GPU test but not NVIDIA; Synopsys names Microsoft as an Azure partner, not a customer).
- 9 do not name the counterparty anywhere in the filing.
- 1 contradicted (Adeia's 10-K names AMD as a litigation target; the edge says licensee).
- 4 cite an unrelated company's filing (a Huntsman 8-K for a Celanese/Westlake edge, an Applied Materials 8-K for SK Hynix/Advantest, a GoDaddy 8-K for Alibaba/Weibo, a Flex 10-Q for WESCO/Vertiv): a CIK-resolution bug in the citation builder.
- 1 unverifiable (image-only investor deck).

So "filings" means the model read a filing while writing the edge, not that the filing states it. The brief told labelers to treat the links as fact; for 14 of the 20 checked, the cited document does not state the relationship as given (unnamed counterparty, wrong document, or contradicted are different failures and the 20 unique edges do not directly estimate the error rate per article shown). The models still benefited. The obvious explanation, that the links block carries `[held]` tags on the matched tickers and so tells a model which held names an article is about, is wrong: a mentions-only variant (same tickers and tags, no edges) gives Haiku 76% recall (links 84%), Sonnet 80% (89%), Jev 68% (82%), and head to head links beat mentions-only on the gold positives for all three (Sonnet 13 fixed / 0 broken, p = 0.0002; Jev 21/0; Haiku 14/3, p = 0.013). Jev with mentions only is worse than with nothing (1 fixed, 10 broken). So the relationship text is doing the work even though the cited filings support it in a minority of cases. A third run restricts the links block to verified edges (both endpoint names appear in the cited document; bench/verify_edges.py, 86 of 388 edges, 157 of 271 articles keep at least one). The gain goes away: Haiku 73% recall (links 84%, none 73%), Sonnet 84% (89%, 83%), Jev 77% (82%, 74%); paired against no links, p = 1.0 / 0.69 / 0.29 on the positives; paired against the full link set, the full set wins for all three (Haiku 18/3 p = 0.0015, Sonnet 6/0 p = 0.03, Jev 9/1 p = 0.02). The recall gain therefore comes from the edges the filings do not support. Two readings remain and this design cannot separate them: the generator's edges are often right about who matters to whom even when the citation is wrong (it read the 10-K and knows the industry), or the labelers saw the same edges and the models are matching link-conditioned gold. Separating them needs a relabel without links shown. Until then the defensible statement is that the generator's edges improve agreement with link-conditioned gold, not that filing-backed links improve urgency scoring.

## Caveats

- One human labeler who also wrote the brief and did the adjudication; the model labelers improve consistency but do not independently validate the intended preference. Adjudication moved 77 labels toward the models. Gold is conditional on the links shown, including the wrong ones.
- 271 articles supports the brief effect clearly and the links effect for Jev, Sonnet and Haiku on the paired recall test; it does not rank models within ~10 points of each other, and the intervals do not account for label uncertainty or for related articles in the same news cycle not being independent.
- Pulse's ticker matcher has false positives; some articles carried irrelevant link blocks (a muni-bond ETF note with AMD edges). Models mostly said "links do not apply".
- The counterparty slice is 31 articles / 7 positives, the whole database's worth; the mechanism shows up but the number is small.
- Haiku's unparseable outputs (JSON not returned) are dropped, 4–6 per run.
- Costs per 1k calls at list price, from the run rows (latest successful call per article): Clef $0.09 (no links) / $0.11 (links); Haiku $1.38 / $1.58; Sonnet $3.78 / $4.38. Jev and Typical rows carry no rate; their Oct 13 figures were $0.03 per 1k (TypeSafe list) and ~$0.11 per 1k unbatched on a 4090 (DECISION_MODELS.md), and prompts here are ~15% longer. p50 latencies are over the same row selection.

## Next

1. Relabel a subset without links shown (links-blind gold). This is now the deciding experiment: if the full-link gain holds against links-blind labels, the generator's edges carry information; if it shrinks to the verified-only level, it was shared text.
2. The citation bug is fixed on dev (28313fe: web-search sec.gov hits must belong to an endpoint's CIK); existing chains keep their old citations until regenerated. The larger gap, edges citing a real filing that does not state them, is a generator-prompt problem, not a citation one.
3. If Jev is the production scorer, calibrate its threshold on this gold (precision has room: 2 false alerts at 82% recall), then evaluate on a fresh held-out sample; performance on these 271 after tuning would be training-set performance.

## Reproduction

Branch `dev` in github.com/ashwinsreedhar28/Pulse. `bench/sample_300.py` (fixture), `bench/brief_v2.txt`, `bench/label.html` and `bench/adjudicate.html` (served from `bench/` with any static server), `bench/label_models.py` (OpenRouter second labelers), `bench/quality.py run --fixture articles_300.json [--links] [--brief v1]`, `bench/report_gold.py`. Gold in `bench/gold.json`; per-call rows in `bench/quality.csv`.
