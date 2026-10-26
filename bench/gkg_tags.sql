-- Diagnostic for bench/gkg_daily.sql: which GKG org tags each held company actually gets.
-- Part 1 (kind='tag'): top 12 org tags per ticker matching a broad stem, last 12 months.
-- Part 2 (kind='url'): 8 sample article URLs per ambiguous bare tag (doc tagged exactly e.g. 'eaton'), last 30 days.
-- Cheap: one year of Organizations + one month of DocumentIdentifier. Save as CSV (local) to bench/data/gkg_tags.csv.
WITH stems AS (
  SELECT * FROM UNNEST([
    STRUCT('AAOI' AS symbol, r'\bapplied opto' AS re),
    STRUCT('ACLS' AS symbol, r'\baxcelis' AS re),
    STRUCT('ADEA' AS symbol, r'\badeia|\bxperi' AS re),
    STRUCT('AEIS' AS symbol, r'\badvanced energy' AS re),
    STRUCT('ALAB' AS symbol, r'\bastera' AS re),
    STRUCT('AMAT' AS symbol, r'\bapplied materials' AS re),
    STRUCT('AMD' AS symbol, r'\badvanced micro|\bamd\b' AS re),
    STRUCT('AMKR' AS symbol, r'\bamkor' AS re),
    STRUCT('ANET' AS symbol, r'\barista\b' AS re),
    STRUCT('APH' AS symbol, r'\bamphenol' AS re),
    STRUCT('ARM' AS symbol, r'\barm\b' AS re),
    STRUCT('ASML' AS symbol, r'\basml\b' AS re),
    STRUCT('ASX' AS symbol, r'\base\b|\bsiliconware|\bspil\b' AS re),
    STRUCT('ATEYY' AS symbol, r'\badvantest' AS re),
    STRUCT('AVGO' AS symbol, r'\bbroadcom' AS re),
    STRUCT('CAMT' AS symbol, r'\bcamtek' AS re),
    STRUCT('CDNS' AS symbol, r'\bcadence\b' AS re),
    STRUCT('CE' AS symbol, r'\bcelanese' AS re),
    STRUCT('CIEN' AS symbol, r'\bciena\b' AS re),
    STRUCT('CLS' AS symbol, r'\bcelestica' AS re),
    STRUCT('COHR' AS symbol, r'\bcoherent\b|\bii[- ]?vi\b' AS re),
    STRUCT('COHU' AS symbol, r'\bcohu\b' AS re),
    STRUCT('CRDO' AS symbol, r'\bcredo\b' AS re),
    STRUCT('CRUS' AS symbol, r'\bcirrus logic' AS re),
    STRUCT('CRWV' AS symbol, r'\bcoreweave' AS re),
    STRUCT('CSCO' AS symbol, r'\bcisco\b' AS re),
    STRUCT('ENTG' AS symbol, r'\bentegris' AS re),
    STRUCT('ETN' AS symbol, r'\beaton\b' AS re),
    STRUCT('FCX' AS symbol, r'\bfreeport' AS re),
    STRUCT('FLEX' AS symbol, r'\bflex\b|\bflextronics' AS re),
    STRUCT('FN' AS symbol, r'\bfabrinet' AS re),
    STRUCT('FORM' AS symbol, r'\bform ?factor' AS re),
    STRUCT('GFS' AS symbol, r'\bglobal ?foundries' AS re),
    STRUCT('GLW' AS symbol, r'\bcorning\b' AS re),
    STRUCT('INTC' AS symbol, r'\bintel\b' AS re),
    STRUCT('JBL' AS symbol, r'\bjabil' AS re),
    STRUCT('JCI' AS symbol, r'\bjohnson controls' AS re),
    STRUCT('KLAC' AS symbol, r'\bkla\b|\bkla[- ]?tencor' AS re),
    STRUCT('KLIC' AS symbol, r'\bkulicke' AS re),
    STRUCT('LIN' AS symbol, r'\blinde\b' AS re),
    STRUCT('LITE' AS symbol, r'\blumentum' AS re),
    STRUCT('LRCX' AS symbol, r'\blam research' AS re),
    STRUCT('LSCC' AS symbol, r'\blattice semi' AS re),
    STRUCT('MCHP' AS symbol, r'\bmicrochip\b' AS re),
    STRUCT('MKSI' AS symbol, r'\bmks\b' AS re),
    STRUCT('MPWR' AS symbol, r'\bmonolithic power' AS re),
    STRUCT('MRVL' AS symbol, r'\bmarvell' AS re),
    STRUCT('MTSI' AS symbol, r'\bmacom\b' AS re),
    STRUCT('MU' AS symbol, r'\bmicron\b' AS re),
    STRUCT('NVDA' AS symbol, r'\bnvidia' AS re),
    STRUCT('NXPI' AS symbol, r'\bnxp\b' AS re),
    STRUCT('ON' AS symbol, r'\bonsemi|\bon semi' AS re),
    STRUCT('ONTO' AS symbol, r'\bonto\b|\bnanometrics|\brudolph tech' AS re),
    STRUCT('PH' AS symbol, r'\bparker[- ]?hannifin|\bparker\b' AS re),
    STRUCT('QCOM' AS symbol, r'\bqualcomm' AS re),
    STRUCT('QRVO' AS symbol, r'\bqorvo' AS re),
    STRUCT('RKLB' AS symbol, r'\brocket ?lab' AS re),
    STRUCT('RMBS' AS symbol, r'\brambus' AS re),
    STRUCT('SIMO' AS symbol, r'\bsilicon motion' AS re),
    STRUCT('SMCI' AS symbol, r'\bsuper ?micro' AS re),
    STRUCT('SNDK' AS symbol, r'\bsandisk' AS re),
    STRUCT('SNPS' AS symbol, r'\bsynopsys' AS re),
    STRUCT('SPCX' AS symbol, r'\bspacex|\bspace exploration' AS re),
    STRUCT('STM' AS symbol, r'\bstmicro|\bst micro' AS re),
    STRUCT('STX' AS symbol, r'\bseagate' AS re),
    STRUCT('SWKS' AS symbol, r'\bskyworks' AS re),
    STRUCT('TEL' AS symbol, r'\bte connectivity|\btyco electronics' AS re),
    STRUCT('TER' AS symbol, r'\bteradyne' AS re),
    STRUCT('TSM' AS symbol, r'\btsmc\b|\btaiwan semi' AS re),
    STRUCT('UCTT' AS symbol, r'\bultra clean' AS re),
    STRUCT('UMC' AS symbol, r'\bumc\b|\bunited micro' AS re),
    STRUCT('VICR' AS symbol, r'\bvicor\b' AS re),
    STRUCT('VRT' AS symbol, r'\bvertiv' AS re),
    STRUCT('WDC' AS symbol, r'\bwestern digital' AS re),
    STRUCT('WOLF' AS symbol, r'\bwolfspeed|\bcree\b' AS re)
  ])
),
ambig AS (
  SELECT * FROM UNNEST([
    STRUCT('ARM' AS symbol, 'arm' AS tag),
    STRUCT('CDNS' AS symbol, 'cadence' AS tag),
    STRUCT('COHR' AS symbol, 'coherent' AS tag),
    STRUCT('CRDO' AS symbol, 'credo' AS tag),
    STRUCT('ETN' AS symbol, 'eaton' AS tag),
    STRUCT('FLEX' AS symbol, 'flex' AS tag),
    STRUCT('GLW' AS symbol, 'corning' AS tag),
    STRUCT('KLAC' AS symbol, 'kla' AS tag),
    STRUCT('MU' AS symbol, 'micron' AS tag),
    STRUCT('PH' AS symbol, 'parker' AS tag)
  ])
),
tags AS (
  SELECT tag
  FROM `gdelt-bq.gdeltv2.gkg_partitioned`, UNNEST(SPLIT(LOWER(Organizations), ';')) AS tag
  WHERE _PARTITIONTIME >= TIMESTAMP('2025-10-20') AND _PARTITIONTIME < TIMESTAMP('2026-10-21')
    AND REGEXP_CONTAINS(LOWER(Organizations), r'\bnvidia|\badvanced micro|\bamd\b|\bbroadcom|\bqualcomm|\bmarvell|\barm\b|\blattice semi|\bintel\b|\bonsemi|\bon semi|\bmicron\b|\bstmicro|\bst micro|\bnxp\b|\bmicrochip\b|\bwolfspeed|\bcree\b|\btsmc\b|\btaiwan semi|\bglobal ?foundries|\bumc\b|\bunited micro|\basml\b|\bapplied materials|\blam research|\bkla\b|\bkla[- ]?tencor|\bteradyne|\bonto\b|\bnanometrics|\brudolph tech|\bultra clean|\baxcelis|\bcoherent\b|\bii[- ]?vi\b|\bform ?factor|\bsynopsys|\bcadence\b|\bamkor|\base\b|\bsiliconware|\bspil\b|\bentegris|\bmks\b|\blinde\b|\bfreeport|\bamphenol|\bcelestica|\bcoreweave|\bcorning\b|\bcredo\b|\blumentum|\bmonolithic power|\brocket ?lab|\bsandisk|\bvertiv|\badvantest|\bvicor\b|\badeia|\bxperi|\brambus|\bqorvo|\bcohu\b|\bcelanese|\bcirrus logic|\bjohnson controls|\bskyworks|\bte connectivity|\btyco electronics|\bmacom\b|\bparker[- ]?hannifin|\bparker\b|\bsuper ?micro|\beaton\b|\bkulicke|\bcamtek|\bciena\b|\bcisco\b|\barista\b|\bastera|\badvanced energy|\bseagate|\bwestern digital|\bflex\b|\bflextronics|\bjabil|\bapplied opto|\bsilicon motion|\bfabrinet|\bspacex|\bspace exploration')
),
tag_counts AS (
  SELECT s.symbol, t.tag, COUNT(*) AS n
  FROM tags t CROSS JOIN stems s
  WHERE REGEXP_CONTAINS(t.tag, s.re)
  GROUP BY 1, 2
),
urls AS (
  SELECT a.symbol, g.DocumentIdentifier AS url
  FROM `gdelt-bq.gdeltv2.gkg_partitioned` g CROSS JOIN ambig a
  WHERE g._PARTITIONTIME >= TIMESTAMP('2026-09-20') AND g._PARTITIONTIME < TIMESTAMP('2026-10-21')
    AND REGEXP_CONTAINS(LOWER(g.Organizations), CONCAT(r'(^|;)', a.tag, r'(;|$)'))
)
SELECT symbol, 'tag' AS kind, tag AS value, n FROM tag_counts
QUALIFY ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY n DESC) <= 12
UNION ALL
SELECT symbol, 'url' AS kind, url AS value, NULL AS n FROM urls
QUALIFY ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY FARM_FINGERPRINT(url)) <= 8
ORDER BY symbol, kind, n DESC
