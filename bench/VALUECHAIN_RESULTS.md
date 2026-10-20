# Results vs gold (271 finance articles, brief v2, alert = score >= 4)

gold distribution: [22, 51, 50, 130, 18]; alert rate 55%; 5-rate 7%; adjudicated 89 of 89 queued; changed by adjudication 77

| model | brief | links | n | exact | within 1 | MAE | alert recall | precision | recall@5 | prec@5 |
|---|---|---|---|---|---|---|---|---|---|---|
| @cf/cloudflare/clef-flash | v2 | no | 271 | 29% | 86% | 0.85 | 30% (45/148, CI 24%–38%) | 96% (2 false) | 0% | 0% |
| @cf/cloudflare/clef-flash | v2 | yes | 271 | 29% | 85% | 0.86 | 29% (43/148, CI 22%–37%) | 100% (0 false) | 0% | nan% |
| @cf/cloudflare/clef-flash+ev | v2 | no | 271 | 27% | 81% | 0.93 | 14% (20/148, CI 9%–20%) | 100% (0 false) | 0% | nan% |
| @cf/cloudflare/clef-flash+ev | v2 | yes | 271 | 22% | 84% | 0.95 | 10% (15/148, CI 6%–16%) | 100% (0 false) | 0% | nan% |
| OzLabs/typical-medium | v2 | no | 271 | 39% | 87% | 0.76 | 49% (73/148, CI 41%–57%) | 69% (33 false) | 0% | 0% |
| OzLabs/typical-medium | v2 | yes | 271 | 43% | 87% | 0.74 | 57% (85/148, CI 49%–65%) | 66% (44 false) | 0% | nan% |
| OzLabs/typical-medium+ev | v2 | no | 271 | 33% | 89% | 0.79 | 36% (53/148, CI 29%–44%) | 88% (7 false) | 0% | nan% |
| OzLabs/typical-medium+ev | v2 | yes | 271 | 35% | 88% | 0.77 | 39% (58/148, CI 32%–47%) | 85% (10 false) | 0% | nan% |
| claude-haiku-4-5-20251001 | v1 | no | 271 | 32% | 69% | 1.04 | 39% (58/148, CI 32%–47%) | 97% (2 false) | 11% | 50% |
| claude-haiku-4-5-20251001 | v2 | no | 267 | 38% | 87% | 0.78 | 73% (108/147, CI 66%–80%) | 100% (0 false) | 50% | 18% |
| claude-haiku-4-5-20251001 | v2 | yes | 265 | 41% | 94% | 0.66 | 84% (120/143, CI 77%–89%) | 98% (3 false) | 72% | 19% |
| claude-sonnet-4-6 | v2 | no | 270 | 33% | 91% | 0.77 | 83% (122/147, CI 76%–88%) | 99% (1 false) | 72% | 17% |
| claude-sonnet-4-6 | v2 | yes | 271 | 40% | 94% | 0.67 | 89% (131/148, CI 82%–93%) | 98% (2 false) | 72% | 18% |
| jev-1.13.0 | v2 | no | 271 | 41% | 83% | 0.79 | 74% (110/148, CI 67%–81%) | 98% (2 false) | 17% | 12% |
| jev-1.13.0 | v2 | yes | 271 | 52% | 94% | 0.55 | 82% (122/148, CI 76%–88%) | 98% (2 false) | 17% | 12% |
| jev-1.13.0+ev | v2 | no | 271 | 41% | 92% | 0.67 | 55% (81/148, CI 47%–63%) | 100% (0 false) | 11% | 18% |
| jev-1.13.0+ev | v2 | yes | 271 | 51% | 96% | 0.54 | 65% (96/148, CI 57%–72%) | 100% (0 false) | 11% | 14% |

## Links effect (paired, same articles)

| model | alerts right: no-links only | links only | both | neither | McNemar p | exact no→links | MAE no→links |
|---|---|---|---|---|---|---|---|
| @cf/cloudflare/clef-flash | 12 | 12 | 154 | 93 | 1.000 | 29%→29% | 0.85→0.86 |
| @cf/cloudflare/clef-flash+ev | 10 | 5 | 133 | 123 | 0.302 | 27%→22% | 0.93→0.95 |
| OzLabs/typical-medium | 24 | 25 | 139 | 83 | 1.000 | 39%→43% | 0.76→0.74 |
| OzLabs/typical-medium+ev | 14 | 16 | 155 | 86 | 0.856 | 33%→35% | 0.79→0.77 |
| claude-haiku-4-5-20251001 | 8 | 19 | 217 | 18 | 0.052 | 38%→42% | 0.77→0.65 |
| claude-sonnet-4-6 | 1 | 8 | 243 | 18 | 0.039 | 33%→40% | 0.77→0.67 |
| jev-1.13.0 | 1 | 13 | 230 | 27 | 0.002 | 41%→52% | 0.79→0.55 |
| jev-1.13.0+ev | 2 | 17 | 202 | 50 | 0.001 | 41%→51% | 0.67→0.54 |

## Alert recall by stratum (brief v2)

| model | links | finance:1 | finance:3 | finance:5 | finance:cp |
|---|---|---|---|---|---|
| @cf/cloudflare/clef-flash | no | 11% (1/9), 1 false | 23% (13/56), 1 false | 41% (31/76), 0 false | 0% (0/7), 0 false |
| @cf/cloudflare/clef-flash | yes | 11% (1/9), 0 false | 20% (11/56), 0 false | 41% (31/76), 0 false | 0% (0/7), 0 false |
| @cf/cloudflare/clef-flash+ev | no | 0% (0/9), 0 false | 5% (3/56), 0 false | 22% (17/76), 0 false | 0% (0/7), 0 false |
| @cf/cloudflare/clef-flash+ev | yes | 11% (1/9), 0 false | 7% (4/56), 0 false | 13% (10/76), 0 false | 0% (0/7), 0 false |
| OzLabs/typical-medium | no | 44% (4/9), 19 false | 41% (23/56), 10 false | 54% (41/76), 2 false | 71% (5/7), 2 false |
| OzLabs/typical-medium | yes | 56% (5/9), 25 false | 48% (27/56), 11 false | 66% (50/76), 3 false | 43% (3/7), 5 false |
| OzLabs/typical-medium+ev | no | 22% (2/9), 2 false | 29% (16/56), 3 false | 42% (32/76), 2 false | 43% (3/7), 0 false |
| OzLabs/typical-medium+ev | yes | 33% (3/9), 3 false | 30% (17/56), 4 false | 46% (35/76), 2 false | 43% (3/7), 1 false |
| claude-haiku-4-5-20251001 | no | 38% (3/8), 0 false | 68% (38/56), 0 false | 88% (67/76), 0 false | 0% (0/7), 0 false |
| claude-haiku-4-5-20251001 | yes | 43% (3/7), 0 false | 82% (46/56), 2 false | 91% (67/74), 0 false | 67% (4/6), 1 false |
| claude-sonnet-4-6 | no | 33% (3/9), 0 false | 89% (50/56), 0 false | 92% (69/75), 1 false | 0% (0/7), 0 false |
| claude-sonnet-4-6 | yes | 33% (3/9), 0 false | 95% (53/56), 1 false | 97% (74/76), 1 false | 14% (1/7), 0 false |
| jev-1.13.0 | no | 44% (4/9), 0 false | 73% (41/56), 0 false | 86% (65/76), 2 false | 0% (0/7), 0 false |
| jev-1.13.0 | yes | 56% (5/9), 1 false | 77% (43/56), 0 false | 95% (72/76), 1 false | 29% (2/7), 0 false |
| jev-1.13.0+ev | no | 22% (2/9), 0 false | 43% (24/56), 0 false | 72% (55/76), 0 false | 0% (0/7), 0 false |
| jev-1.13.0+ev | yes | 33% (3/9), 0 false | 62% (35/56), 0 false | 76% (58/76), 0 false | 0% (0/7), 0 false |

## Ensembles (pre-registered: (a) rounded mean, alert >= 4; (b) alert if >= 2 models alert)

links=no over 5 models (@cf/cloudflare/clef-flash, OzLabs/typical-medium, claude-haiku-4-5-20251001, claude-sonnet-4-6, jev-1.13.0), n=266: (a) exact 43% MAE 0.63 recall 70% precision 100%; (b) recall 82% precision 98%
links=yes over 5 models (@cf/cloudflare/clef-flash, OzLabs/typical-medium, claude-haiku-4-5-20251001, claude-sonnet-4-6, jev-1.13.0), n=265: (a) exact 51% MAE 0.51 recall 76% precision 99%; (b) recall 89% precision 98%
