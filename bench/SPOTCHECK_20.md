# Citation spot-check: 20 "filings"-sourced value-chain edges (2026-10-20)

Sample: 20 of the 388 unique `source='filings'` edges touched by the 271 labeled articles, seeded shuffle (bench/spotcheck_20.json).
Method: open the cited primary document on EDGAR, search for the counterparty by name (both halves of each ~110–125k-char filing read).

| # | edge | cited filing | result |
|---|---|---|---|
| 1 | AMKR supplies NVDA | Amkor 8-K May 2026 (EX-99.1 investor deck, 71 JPGs) | unverifiable: image-only exhibit |
| 2 | LRCX partners with ASML | Lam 10-K FY2026 | not named (competitors listed: AMAT, ASM, Wonik, Hitachi, TEL, Screen, Semes) |
| 3 | KLIC competes with COHU | Cohu 10-K FY2025 | not named (competitors: Advantest, Teradyne, Hon Precision, KLA) |
| 4 | SNPS supplies CRDO | Synopsys 10-Q Jul 2026 | not named |
| 5 | PH supplies BA | Parker-Hannifin 10-K FY2026 | not named |
| 6 | NVDA customer of COHU | Cohu 10-K FY2025 | partial: GPU/ASIC/xPU test named as served market; NVIDIA not named; only named customer is STMicro |
| 7 | CE competes with WLK | **Huntsman** 8-K (Item 8.01) | wrong filer: CIK 1307954 is Huntsman, not Celanese or Westlake |
| 8 | GOOGL customer of NTAP | NetApp 10-K FY2026 | supported: "on Google Cloud as Google Cloud NetApp Volumes" (Item 1) |
| 9 | FORM supplies AMKR | FormFactor 10-K FY2025 | not named (10% customers: SK hynix, Intel, TSMC, Samsung) |
| 10 | SKHY customer of ATEYY | **Applied Materials** 8-K May 2026 (earnings) | wrong filer: CIK 6951 is AMAT, not Advantest |
| 11 | FN competes with CLS | Fabrinet 10-K FY2026 | supported: Celestica in the Item 1 competitor list |
| 12 | MSFT customer of SNPS | Synopsys 10-K FY2025 | partial: Microsoft named once, as Azure partner ("developed in partnership with Microsoft Azure"), not as an EDA customer |
| 13 | BABA customer of WB | **GoDaddy** 8-K Dec 2021 | wrong filer: CIK 1609711 is GoDaddy, not Weibo |
| 14 | WCC customer of VRT | **Flex** 10-Q Jun 2026 | wrong filer: CIK 866374 is Flex, not WESCO |
| 15 | ADI competes with VICR | Vicor 10-K FY2025 | not named (competitors described generically as IDMs) |
| 16 | NVDA supplies JBL | Jabil 10-K FY2025 | not named (customers anonymized A/B) |
| 17 | ONTO supplies TSM | Onto 10-K FY2025 | not named (customers anonymized A/B/C; Taiwan only as a location) |
| 18 | AMKR supplies QCOM | Amkor 10-K FY2025 | supported: Qualcomm 11.1% of 2025 net sales (Item 1, Customers) |
| 19 | AMKR supplies MU | Amkor 10-K FY2025 | not named |
| 20 | ADEA supplies AMD | Adeia 10-K FY2025 | contradicted: AMD named as a litigation target (Nov 2025), not a licensee |

Tally: supported 3, partial 2, not named 9, contradicted 1, wrong filer 4, unverifiable 1. → 5 of 20 backed by the cited text; 4 of 20 cite a filing from an unrelated company.

Consequences
- "source = filings" means the generator read a filing while emitting the edge, not that the filing states the edge. The brief's "treat them as fact" was wrong for ~half the links shown.
- Pulse bug: citation CIK resolution attaches the wrong company's filing in 4/20 cases (likely name→CIK lookup on the counterparty resolving to a different issuer). File as an issue; do not trust `citations[].url` until fixed.
- For the eval: links still raised recall for Jev/Haiku/Sonnet, so their value was mostly telling the model which held names the article touches (the `[held]` tags and matched tickers), not supply-chain knowledge. Next input variant: pass the article's matched tickers explicitly and drop unverified edges.
