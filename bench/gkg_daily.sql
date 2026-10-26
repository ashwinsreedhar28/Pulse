-- v2: daily GDELT GKG 2.0 document counts per held ticker, 2017-01-01 .. 2026-10-20 (UTC days).
-- Matches the lowercased Organizations field (GDELT's entity-typed org tags; includes machine-translated sources).
-- Patterns come from bench/gkg_tags.sql output (top tags per company, last 12 months). v1 -> v2 fixes:
--   ETN bare 'eaton' tag was mostly the Eaton fire / Eaton Centre -> only 'eaton corp(oration)';
--   ON matched 'duties on semiconductors' -> anchored; GLW matched Owens Corning -> anchored corning inc/incorporated;
--   MKSI renamed 'mks inc' (bare 'mks' = Knesset members); KLAC excludes 'kla tham party'; LIN excludes people;
--   former names: WOLF 'cree inc', ADEA 'xperi holding', COHR 'ii-vi', TEL 'tyco electronics', ASX 'siliconware';
--   AEIS/ARM/FLEX/COHR bare-name exact matches dropped (ambiguous). NXPI and ONTO are thinly tagged in GKG itself.
-- Output: symbol,date,count,norm, zero-filled. Save as bench/data/gkg_daily_v2.csv.
WITH q AS (
  SELECT * FROM UNNEST([
    STRUCT('AAOI' AS symbol, r'\bapplied optoelectronics' AS re),
    STRUCT('ACLS' AS symbol, r'\baxcelis' AS re),
    STRUCT('ADEA' AS symbol, r'\badeia\b|(^|;)xperi (holding|corp)' AS re),
    STRUCT('AEIS' AS symbol, r'\badvanced energy industries' AS re),
    STRUCT('ALAB' AS symbol, r'\bastera labs?\b' AS re),
    STRUCT('AMAT' AS symbol, r'\bapplied materials\b' AS re),
    STRUCT('AMD' AS symbol, r'\badvanced micro devices\b|\bamd\b' AS re),
    STRUCT('AMKR' AS symbol, r'\bamkor\b' AS re),
    STRUCT('ANET' AS symbol, r'\barista networks?\b' AS re),
    STRUCT('APH' AS symbol, r'\bamphenol\b' AS re),
    STRUCT('ARM' AS symbol, r'(^|;)arm (holdings?|limited|ltd)\b' AS re),
    STRUCT('ASML' AS symbol, r'\basml\b' AS re),
    STRUCT('ASX' AS symbol, r'(^|;)ase (technology|group|inc|industrial)\b|\bsiliconware precision' AS re),
    STRUCT('ATEYY' AS symbol, r'\badvantest\b' AS re),
    STRUCT('AVGO' AS symbol, r'\bbroadcom\b' AS re),
    STRUCT('CAMT' AS symbol, r'\bcamtek\b' AS re),
    STRUCT('CDNS' AS symbol, r'\bcadence design' AS re),
    STRUCT('CE' AS symbol, r'\bcelanese\b' AS re),
    STRUCT('CIEN' AS symbol, r'\bciena\b' AS re),
    STRUCT('CLS' AS symbol, r'\bcelestica\b' AS re),
    STRUCT('COHR' AS symbol, r'(^|;)coherent (corp|corporation|inc)\b|(^|;)ii[- ]?vi( inc| incorporated)?(;|$)' AS re),
    STRUCT('COHU' AS symbol, r'\bcohu (inc|electronics|company)\b|(^|;)cohu(;|$)' AS re),
    STRUCT('CRDO' AS symbol, r'\bcredo technology' AS re),
    STRUCT('CRUS' AS symbol, r'\bcirrus logic' AS re),
    STRUCT('CRWV' AS symbol, r'\bcoreweave' AS re),
    STRUCT('CSCO' AS symbol, r'\bcisco\b' AS re),
    STRUCT('ENTG' AS symbol, r'\bentegris' AS re),
    STRUCT('ETN' AS symbol, r'(^|;)eaton (corporation|corp)\b' AS re),
    STRUCT('FCX' AS symbol, r'\bfreeport[- ]mcmoran' AS re),
    STRUCT('FLEX' AS symbol, r'(^|;)flex ltd\b|\bflextronics\b' AS re),
    STRUCT('FN' AS symbol, r'\bfabrinet' AS re),
    STRUCT('FORM' AS symbol, r'\bformfactor\b' AS re),
    STRUCT('GFS' AS symbol, r'\bglobal ?foundries' AS re),
    STRUCT('GLW' AS symbol, r'(^|;)corning (inc|incorporated|company|optical|glass technologies)\b' AS re),
    STRUCT('INTC' AS symbol, r'\bintel corp|(^|;)intel( foundry[^;]*)?(;|$)' AS re),
    STRUCT('JBL' AS symbol, r'\bjabil\b' AS re),
    STRUCT('JCI' AS symbol, r'\bjohnson controls\b' AS re),
    STRUCT('KLAC' AS symbol, r'(^|;)kla(-tencor)? corp' AS re),
    STRUCT('KLIC' AS symbol, r'\bkulicke' AS re),
    STRUCT('LIN' AS symbol, r'(^|;)linde( plc| ag| group| inc)?(;|$)' AS re),
    STRUCT('LITE' AS symbol, r'\blumentum\b' AS re),
    STRUCT('LRCX' AS symbol, r'\blam research\b' AS re),
    STRUCT('LSCC' AS symbol, r'\blattice semiconductor' AS re),
    STRUCT('MCHP' AS symbol, r'\bmicrochip technology' AS re),
    STRUCT('MKSI' AS symbol, r'\bmks instruments|(^|;)mks inc\b' AS re),
    STRUCT('MPWR' AS symbol, r'\bmonolithic power' AS re),
    STRUCT('MRVL' AS symbol, r'\bmarvell\b' AS re),
    STRUCT('MTSI' AS symbol, r'\bmacom\b' AS re),
    STRUCT('MU' AS symbol, r'\bmicron technology|(^|;)micron(;|$)' AS re),
    STRUCT('NVDA' AS symbol, r'\bnvidia\b' AS re),
    STRUCT('NXPI' AS symbol, r'\bnxp semiconductors?\b|(^|;)nxp(;|$)' AS re),
    STRUCT('ON' AS symbol, r'\bonsemi\b|(^|;)on semiconductor( corp| corporation)?(;|$)' AS re),
    STRUCT('ONTO' AS symbol, r'\bonto innovation' AS re),
    STRUCT('PH' AS symbol, r'\bparker[- ]hannifin' AS re),
    STRUCT('QCOM' AS symbol, r'\bqualcomm\b' AS re),
    STRUCT('QRVO' AS symbol, r'\bqorvo\b' AS re),
    STRUCT('RKLB' AS symbol, r'\brocket ?lab\b' AS re),
    STRUCT('RMBS' AS symbol, r'\brambus\b' AS re),
    STRUCT('SIMO' AS symbol, r'\bsilicon motion' AS re),
    STRUCT('SMCI' AS symbol, r'\bsuper ?micro( computer)?\b' AS re),
    STRUCT('SNDK' AS symbol, r'\bsandisk\b' AS re),
    STRUCT('SNPS' AS symbol, r'\bsynopsys\b' AS re),
    STRUCT('SPCX' AS symbol, r'\bspacex\b|\bspace exploration technologies' AS re),
    STRUCT('STM' AS symbol, r'\bstmicroelectronics\b' AS re),
    STRUCT('STX' AS symbol, r'\bseagate\b' AS re),
    STRUCT('SWKS' AS symbol, r'\bskyworks\b' AS re),
    STRUCT('TEL' AS symbol, r'\bte connectivity|\btyco electronics' AS re),
    STRUCT('TER' AS symbol, r'\bteradyne\b' AS re),
    STRUCT('TSM' AS symbol, r'\btsmc\b|\btaiwan semiconductor manufacturing|(^|;)taiwan semiconductor( co| company)?(;|$)' AS re),
    STRUCT('UCTT' AS symbol, r'\bultra clean (holdings?|technology)\b' AS re),
    STRUCT('UMC' AS symbol, r'\bunited microelectronics\b|(^|;)umc( inc| corp)?(;|$)' AS re),
    STRUCT('VICR' AS symbol, r'\bvicor (corp|corporation|company)\b' AS re),
    STRUCT('VRT' AS symbol, r'\bvertiv\b' AS re),
    STRUCT('WDC' AS symbol, r'\bwestern digital\b' AS re),
    STRUCT('WOLF' AS symbol, r'\bwolfspeed\b|(^|;)cree,? inc\b' AS re)
  ])
),
g AS (
  SELECT
    DATE(PARSE_TIMESTAMP('%Y%m%d%H%M%S', CAST(`DATE` AS STRING))) AS day,
    LOWER(Organizations) AS orgs
  FROM `gdelt-bq.gdeltv2.gkg_partitioned`
  WHERE _PARTITIONTIME >= TIMESTAMP('2016-12-31') AND _PARTITIONTIME < TIMESTAMP('2026-10-22')
),
norm AS (
  SELECT day, COUNT(*) AS norm FROM g
  WHERE day >= '2017-01-01' AND day < '2026-10-21'
  GROUP BY day
),
cand AS (  -- one combined pass first, so the per-ticker regexes only see matching docs
  SELECT day, orgs FROM g
  WHERE day >= '2017-01-01' AND day < '2026-10-21'
    AND REGEXP_CONTAINS(orgs, r'\bapplied optoelectronics|\baxcelis|\badeia\b|(^|;)xperi (holding|corp)|\badvanced energy industries|\bastera labs?\b|\bapplied materials\b|\badvanced micro devices\b|\bamd\b|\bamkor\b|\barista networks?\b|\bamphenol\b|(^|;)arm (holdings?|limited|ltd)\b|\basml\b|(^|;)ase (technology|group|inc|industrial)\b|\bsiliconware precision|\badvantest\b|\bbroadcom\b|\bcamtek\b|\bcadence design|\bcelanese\b|\bciena\b|\bcelestica\b|(^|;)coherent (corp|corporation|inc)\b|(^|;)ii[- ]?vi( inc| incorporated)?(;|$)|\bcohu (inc|electronics|company)\b|(^|;)cohu(;|$)|\bcredo technology|\bcirrus logic|\bcoreweave|\bcisco\b|\bentegris|(^|;)eaton (corporation|corp)\b|\bfreeport[- ]mcmoran|(^|;)flex ltd\b|\bflextronics\b|\bfabrinet|\bformfactor\b|\bglobal ?foundries|(^|;)corning (inc|incorporated|company|optical|glass technologies)\b|\bintel corp|(^|;)intel( foundry[^;]*)?(;|$)|\bjabil\b|\bjohnson controls\b|(^|;)kla(-tencor)? corp|\bkulicke|(^|;)linde( plc| ag| group| inc)?(;|$)|\blumentum\b|\blam research\b|\blattice semiconductor|\bmicrochip technology|\bmks instruments|(^|;)mks inc\b|\bmonolithic power|\bmarvell\b|\bmacom\b|\bmicron technology|(^|;)micron(;|$)|\bnvidia\b|\bnxp semiconductors?\b|(^|;)nxp(;|$)|\bonsemi\b|(^|;)on semiconductor( corp| corporation)?(;|$)|\bonto innovation|\bparker[- ]hannifin|\bqualcomm\b|\bqorvo\b|\brocket ?lab\b|\brambus\b|\bsilicon motion|\bsuper ?micro( computer)?\b|\bsandisk\b|\bsynopsys\b|\bspacex\b|\bspace exploration technologies|\bstmicroelectronics\b|\bseagate\b|\bskyworks\b|\bte connectivity|\btyco electronics|\bteradyne\b|\btsmc\b|\btaiwan semiconductor manufacturing|(^|;)taiwan semiconductor( co| company)?(;|$)|\bultra clean (holdings?|technology)\b|\bunited microelectronics\b|(^|;)umc( inc| corp)?(;|$)|\bvicor (corp|corporation|company)\b|\bvertiv\b|\bwestern digital\b|\bwolfspeed\b|(^|;)cree,? inc\b')
),
hits AS (
  SELECT q.symbol, cand.day, COUNT(*) AS n
  FROM cand CROSS JOIN q
  WHERE REGEXP_CONTAINS(cand.orgs, q.re)
  GROUP BY 1, 2
)
SELECT q.symbol, FORMAT_DATE('%Y-%m-%d', norm.day) AS date, IFNULL(hits.n, 0) AS count, norm.norm
FROM norm CROSS JOIN q
LEFT JOIN hits ON hits.symbol = q.symbol AND hits.day = norm.day
ORDER BY symbol, date
