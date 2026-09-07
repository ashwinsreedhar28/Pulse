# Phase A3: LLM Signal Augmentation (Optional)

**Precondition:** Phase A2 passed. You have a working XGBoost model, a clean held-out test set, and documented feature importances.

**Decision before starting:** This phase is optional. Skip it and go directly to A4 if any of the following are true:
- A2's net Sharpe was already > 1.5 (diminishing returns from augmentation).
- Inspection of A2's feature importances shows the model is already using rich text-derived signals effectively.
- You want to ship live faster and iterate on signal quality after A4-A5 are in place.

Augmentation is most likely to help if A2 is *marginal* (Sharpe 0.5-1.0) and analysis suggests a subset of articles requires reasoning that simple features can't capture (e.g., complex M&A, regulatory action, supply-chain implications).

**Goal:** Determine whether adding an LLM (Claude) reasoning layer for a *targeted subset* of articles produces an ensemble with measurably better risk-adjusted returns than XGBoost alone, after accounting for inference cost.

**Budget:** 1 month. ~$200-500 in Claude API costs across experiments.

**Out of scope:** Replacing the XGBoost model with an LLM. The LLM is augmentation, not substitute. Also out of scope: fine-tuning any open-weight model. That comes much later, if ever.

---

## Context

What A2 produced:
- Trained XGBoost model with predictions and confidence (use prediction magnitude as confidence proxy, or train a separate uncertainty estimator).
- Held-out test set with realized outcomes per article.
- Feature importances and backtest results.

What you'll add:
- Claude predictions for a subset of articles where XGBoost is uncertain.
- An ensemble that combines both signals.
- Cost-benefit analysis.

## Tasks

### A3.1 — Identify the high-value article subset

Build `trading/analysis/identify_uncertain_articles.py`.

For each article in the test set, compute:
- XGBoost predicted excess return.
- Realized excess return.
- "Surprise" = |realized − predicted| / std(realized).

Select the subset where XGBoost was most surprised. These are the cases where additional reasoning might help.

Also create complementary subsets:
- High-importance entities (articles mentioning multiple value-chain hops — Pulse already has this data).
- Articles flagged as containing M&A, FDA actions, regulatory news, earnings restatements (build simple keyword-based flags or use Pulse's existing classification).
- Articles where XGBoost prediction is near zero but realized return is large (the "missed" cases).

Each subset should be 200-500 articles. Don't run Claude on all 100K+ articles in the test set — that's both expensive and unnecessary.

### A3.2 — Claude prompt design and evaluation

Build `trading/llm/score_with_claude.py`.

Design a structured prompt that takes:
- The article (title + body, truncated to ~1500 tokens).
- The ticker(s) it mentions.
- Pulse's value-chain context for those tickers (suppliers, customers, competitors, partners — already available, read-only).
- Current market context (sector recent performance, ticker recent volatility, days to earnings).

Returns structured JSON:
```json
{
  "ticker": "AAPL",
  "direction": "long" | "short" | "none",
  "magnitude": 0.0 to 1.0,
  "horizon_hours": int,
  "key_factors": ["list", "of", "specific", "facts"],
  "second_order_implications": [{"ticker": "TSM", "direction": "long", "reason": "..."}],
  "confidence": 0.0 to 1.0
}
```

Use Claude Sonnet (current generation) for quality. Use temperature 0 for reproducibility. Cache all responses keyed on (article_id, prompt_version) so re-runs don't re-bill.

Run the prompt on each article in each subset from A3.1. Convert Claude's outputs to a numeric prediction (e.g., direction × magnitude × something for confidence) on the same scale as XGBoost's `excess_return_4h` predictions.

### A3.3 — Ensemble construction

Build `trading/models/ensemble.py`.

Try three combination methods:
1. **Substitution:** use Claude's prediction when available, XGBoost otherwise.
2. **Linear blend:** `ensemble = w * claude + (1-w) * xgboost` for w ∈ {0.2, 0.4, 0.6, 0.8}, fit on validation, evaluate on test.
3. **Stacked:** train a second-stage XGBoost where features are XGBoost's prediction, Claude's prediction, Claude's confidence, and a few interaction terms. Watch for overfitting given small subset sizes.

Evaluate each combination on the SAME held-out test set as A2. Compute:
- Net Sharpe (after costs) on the subset where Claude was run.
- Net Sharpe on the full test set (Claude predictions where available, XGBoost elsewhere).
- Incremental alpha vs. A2 baseline.

### A3.4 — Cost-benefit analysis

Compute the all-in cost of running Claude in production:
- Articles per day eligible for Claude scoring (apply A3.1 selection criteria forward).
- Tokens per article × cost per token.
- Daily and annual cost projection.

Compute the value:
- Incremental Sharpe × portfolio size × volatility ≈ incremental annual return.
- At what portfolio size does Claude pay for itself?

Document the breakeven explicitly.

---

## Acceptance criteria (the gate)

**Pass (Claude becomes part of production signal generation):**
- Ensemble net Sharpe on full test set ≥ A2's net Sharpe + 0.3
- Incremental annual alpha covers Claude inference cost at the planned portfolio size with a 3× margin
- No degradation on the non-Claude subset (i.e., the ensemble doesn't worsen anywhere)

**Marginal (defer the decision):** Improvement in 0.0-0.3 Sharpe. Document, but proceed to A4 with XGBoost-only signal. Re-evaluate the LLM augmentation question after 6 months of live data, when the labeled corpus is larger and Claude pricing may have changed.

**Fail (drop LLM augmentation, proceed to A4 with XGBoost-only):** No improvement, or improvement doesn't justify cost, or ensemble overfits validation but not test.

---

## Hard constraints

- **The LLM is augmentation, not substitution.** Do not propose pipelines where Claude is the primary signal and XGBoost is the fallback. Reverse it: XGBoost is the workhorse, Claude is the specialist.
- **Cache aggressively.** Every Claude call must be cached by (article_id, prompt_version, model_version). Re-running an experiment must not re-bill.
- **No prompt engineering on the test set.** Iterate prompts on the validation portion of A2's data, freeze the prompt, then evaluate on the held-out test set. Once.
- **Cost budget hard cap: $500.** If you've spent $400 and don't have a clear answer, stop and report what you have.
- **Don't introduce new model classes** beyond the Anthropic API. No "let's also try GPT-4 and Gemini for comparison." That's another $500 minimum and not informative for a single-developer project.
- **Token efficiency.** Truncate article bodies to 1500 tokens. Use structured prompts with few-shot examples. Don't send 4K-token inputs to score a single news article.

## Deliverables

1. `trading/analysis/identify_uncertain_articles.py` + the four subsets persisted as a `claude_eval_subsets` table.
2. `trading/llm/score_with_claude.py` + `claude_predictions` table with cached responses.
3. `trading/models/ensemble.py` + ensemble metadata in `xgb_v2_ensemble_metadata.json`.
4. `reports/a3_ensemble_evaluation.md` with all three combination methods compared.
5. `reports/a3_cost_benefit.md` with breakeven analysis.
6. `PHASE_A3_RESULT.md`: pass/marginal/fail with specific numbers and recommendation.

When you finish, do not auto-proceed to Phase A4. Stop and surface the result.
