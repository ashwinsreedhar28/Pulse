#!/bin/sh
# Experiment 3 cost check, round 2: price each content column separately (dry runs are free).
set -e
for spec in "V2Tone:2017-01-01" "Themes:2017-01-01" "Themes:2021-01-01" "Extras:2021-01-01"; do
  col=${spec%%:*}; start=${spec#*:}
  printf '%-8s from %s: ' "$col" "$start"
  bq query --nouse_legacy_sql --dry_run --format=none "SELECT COUNT(*) FROM \`gdelt-bq.gdeltv2.gkg_partitioned\` WHERE _PARTITIONTIME >= TIMESTAMP('$start') AND _PARTITIONTIME < TIMESTAMP('2025-01-01') AND $col IS NOT NULL" 2>&1 | grep -o '[0-9]* bytes' | awk '{printf "%.0f GB\n", $1/1e9}'
done
