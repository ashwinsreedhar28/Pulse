#!/bin/sh
# Experiment 3 cost check: bytes BigQuery would scan for the content columns. Dry runs are free.
# (a) tone + themes, 2017-2024 (covariate history for the 2023-2024 holdout)
# (b) page titles (Extras) + URLs, 2022-2024 (headlines for the Jev backtest)
set -e
bq query --nouse_legacy_sql --dry_run '
SELECT COUNT(*) FROM `gdelt-bq.gdeltv2.gkg_partitioned`
WHERE _PARTITIONTIME >= TIMESTAMP("2017-01-01") AND _PARTITIONTIME < TIMESTAMP("2025-01-01")
  AND REGEXP_CONTAINS(LOWER(Organizations), r"nvidia") AND V2Tone IS NOT NULL AND V2Themes IS NOT NULL AND `DATE` > 0'
bq query --nouse_legacy_sql --dry_run '
SELECT COUNT(*) FROM `gdelt-bq.gdeltv2.gkg_partitioned`
WHERE _PARTITIONTIME >= TIMESTAMP("2022-01-01") AND _PARTITIONTIME < TIMESTAMP("2025-01-01")
  AND REGEXP_CONTAINS(LOWER(Organizations), r"nvidia") AND Extras IS NOT NULL AND DocumentIdentifier IS NOT NULL'
