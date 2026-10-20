# Pulse urgency scoring: adjudicated gold set and value-chain links as input

2026-10-20. Follow-up to DECISION_MODELS.md (Jev / Clef-flash / Typical vs Haiku on 50 articles, Oct 14) and the blind-label finding that Haiku reads urgency as "breaking news" while the user reads it as "a holder should look at this today".

## Short version

- A new brief that states the criterion ("should a holder of one of these names look at this today?", levels defined) moves Haiku's alert recall from 39% to 73% on the same 271 articles. Most of the Haiku gap was the brief, not the model.
- Passing each article's value-chain links as input raises recall again for every LLM and for Jev: Jev 74% → 82% (p = 0.002), Haiku 73% → 84% (p = 0.052), Sonnet 83% → 89% (p = 0.039). Clef does not move; Typical moves within noise.
- With links, Jev has the best exact agreement (52%) and MAE (0.55) of any model at 373 ms p50, ahead of Sonnet on the number and behind it on recall (82% vs 89%).
- Every model except Typical has 96–100% alert precision: the errors are misses, not false alarms. Typical is the only one that over-alerts (precision 66–69%).
- Ensembles with the rules fixed beforehand reach 89% recall with links, the same as Sonnet alone. Nothing to gain.
- A 20-edge spot-check of the cited filings found 5 supported, 9 not naming the counterparty, 1 contradicted, 4 citing an unrelated company's filing, 1 unverifiable. The links helped mostly by telling the model which held names an article touches, not by supplying supply-chain facts. Pass the ticker matches explicitly next time and fix the citation pipeline.

## Gold set

271 finance articles from Pulse's database (12,395 articles), excluding the 50 from the Oct 14 table, deduplicated by title and URL. Stratified by Pulse's keyword urgency score so the sample covers the full range rather than only the ambiguous 3s: 80 each at keyword 1 / 3 / 5, plus 31 articles that name a filing-linked counterparty of a held name without naming a held name (every such article in the database). Holdings list: the 75 active tickers in Pulse, frozen in the fixture.

Brief v2 (bench/brief_v2.txt), frozen before any article was read. Levels: 5 act today (material to a held name), 4 look today (substantive coverage of a held name, or material news at a filing-linked supplier/customer), 3 glance, 2 routine, 1 ignore. Rule: direct coverage of a held name scores one notch above the same news at a linked company; names that are neither held nor linked do not raise the score. Alert = score ≥ 4.

Three labelers, each seeing headline, summary, and the article's links block: Ashwin (blind, 271 in 14 min, ~3 s per article), Claude Opus 5.5 and GPT-5.6 Sol via OpenRouter (neither is an evaluated model). Adjudication rule, written before labeling: adjudicate when any pair differs by two or more points or disagrees on the alert; otherwise Ashwin's label stands. 89 of 271 went to adjudication; 77 were changed, all 77 toward the models (52 down, 25 up), with the model rationales visible. Ashwin's raw labels match the final gold 72% exact. Gold distribution 1–5: 22 / 51 / 50 / 130 / 18; alert rate 55%, 7% at 5.

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
| Haiku 4.5 | yes | 41% | 94% | 0.66 | 84% (120/143) | 98% | 1,520 ms |
| Sonnet 4.6 | no | 33% | 91% | 0.77 | 83% (122/147) | 99% | 2,283 ms |
| Sonnet 4.6 | yes | 40% | 94% | 0.67 | 89% (131/148) | 98% | 2,247 ms |
| Jev 1.13 (argmax) | no | 41% | 83% | 0.79 | 74% (110/148) | 98% | 362 ms |
| Jev 1.13 (argmax) | yes | 52% | 94% | 0.55 | 82% (122/148) | 98% | 373 ms |
| Clef-flash (argmax) | no | 29% | 86% | 0.85 | 30% (45/148) | 96% | 536 ms |
| Clef-flash (argmax) | yes | 29% | 85% | 0.86 | 29% (43/148) | 100% | 543 ms |
| Typical-medium (argmax) | no | 39% | 87% | 0.76 | 49% (73/148) | 69% (33 false) | 710 ms |
| Typical-medium (argmax) | yes | 43% | 87% | 0.74 | 57% (85/148) | 66% (44 false) | 749 ms |

Recall 95% CIs are about ±8 points at this n. Haiku returned unparseable JSON on 4–6 articles per run; those rows are excluded (n shown). Expected-value decoding for the decision models is in bench/VALUECHAIN_RESULTS.md; it is worse on recall for all three and not shown here.

Paired links effect (same articles, alert correct with vs without links, exact McNemar):

| model | fixed by links | broken by links | p |
|---|---|---|---|
| Jev | 13 | 1 | 0.002 |
| Sonnet | 8 | 1 | 0.039 |
| Haiku | 19 | 8 | 0.052 |
| Typical | 25 | 24 | 1.00 |
| Clef | 12 | 12 | 1.00 |

By stratum, the links effect is concentrated where it should be: on the 31 counterparty-only articles (7 positives) every model is 0 for 7 without links; with links Haiku catches 4, Jev 2, Sonnet 1. On keyword-5 articles Jev goes 86% → 95%, Sonnet 92% → 97%.

Ensembles, rules fixed before the runs: (a) rounded mean score, alert ≥ 4; (b) alert if ≥ 2 of 5 models alert. With links: (a) 76% recall / 99% precision, (b) 89% / 98%. Sonnet alone with links is 89% / 98%. Same conclusion as on the 50.

Brief v2 alert rate is 55% of finance articles (reweighted to Pulse's live mix, about the same). That is a digest, not a ping; the user's reading is that 4 and 5 are "things I should read or have summarized", with 5 (7% of articles) the act-now tier.

## What the links actually are

The generator that builds Pulse's value chains reads a company's latest 10-K Item 1, profile and recent news, and emits edges tagged with the source it was reading and a citation. 84% of the 14,104 edges carry `source = 'filings'`. Spot-check of 20 such edges touched by the labeled articles, reading the cited primary document on EDGAR (bench/SPOTCHECK_20.md):

- 3 supported by the cited text (Amkor → Qualcomm, 11.1% of 2025 sales; NetApp on Google Cloud; Fabrinet lists Celestica as a competitor).
- 2 partial (Cohu names GPU test but not NVIDIA; Synopsys names Microsoft as an Azure partner, not a customer).
- 9 do not name the counterparty anywhere in the filing.
- 1 contradicted (Adeia's 10-K names AMD as a litigation target; the edge says licensee).
- 4 cite an unrelated company's filing (a Huntsman 8-K for a Celanese/Westlake edge, an Applied Materials 8-K for SK Hynix/Advantest, a GoDaddy 8-K for Alibaba/Weibo, a Flex 10-Q for WESCO/Vertiv): a CIK-resolution bug in the citation builder.
- 1 unverifiable (image-only investor deck).

So "filings" means the model read a filing while writing the edge, not that the filing states it. The brief told labelers to treat the links as fact; for about half of them that was wrong. The models still benefited, and the stratum breakdown says why: the links block carries `[held]` tags on the matched tickers, so it tells a model which held names an article is about, which the ~120-character summaries often do not. That is the "knowledge" half of the task from the Oct 19 email, and it turns out to be mostly entity resolution, not supply-chain recall.

## Caveats

- One human labeler who also wrote the brief; the second labelers and adjudication are the mitigation, and adjudication moved 77 labels toward them. Gold is conditional on the links shown, including the wrong ones.
- 271 articles settles the paired questions (brief effect, links effect) and not the ranking of models within ~10 points of each other.
- Pulse's ticker matcher has false positives; some articles carried irrelevant link blocks (a muni-bond ETF note with AMD edges). Models mostly said "links do not apply".
- The counterparty slice is 31 articles / 7 positives, the whole database's worth; the mechanism shows up but the number is small.
- Haiku's unparseable outputs (JSON not returned) are dropped, 4–6 per run.
- Typical and Jev list prices from Oct 13 ($0.03–0.11 per 1k); Clef $0.09–0.11 per 1k measured; Haiku $1.38–1.56 per 1k; Sonnet $3.78–4.38 per 1k at list.

## Next

1. Fix the citation CIK bug and tag edges as verified only when the counterparty name appears in the cited document; re-run the links variant with verified edges only.
2. Input v3: pass the matched tickers explicitly (`mentions: CE [held], LIN [held]`) with or without edges, to separate entity resolution from supply-chain knowledge.
3. If Jev is the production scorer, calibrate its threshold on this gold (precision has room: 2 false alerts at 82% recall).

## Reproduction

Branch `dev` in github.com/ashwinsreedhar28/Pulse. `bench/sample_300.py` (fixture), `bench/brief_v2.txt`, `bench/label.html` and `bench/adjudicate.html` (served from `bench/` with any static server), `bench/label_models.py` (OpenRouter second labelers), `bench/quality.py run --fixture articles_300.json [--links] [--brief v1]`, `bench/report_gold.py`. Gold in `bench/gold.json`; per-call rows in `bench/quality.csv`.
