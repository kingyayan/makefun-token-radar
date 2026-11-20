# makefun-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/kingyayan/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/kingyayan/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A snapshot-driven token launch radar. The program reads the sealed DefiLlama
snapshot, scores protocols that still record no token, and writes a static
offline dashboard with a ranked board, a detail view for every protocol, a
filter, and a concrete farm plan for each row.

The implied value is a transparent claim derived only from the snapshot's TVL,
seven-day change, first-listed runway, chain breadth and category. It is not a
forecast and not a price. Protocols whose token already trades are shown in a
separate live-token view with their market caps.

## What is where

- `main.ts` — entrypoint run by the grader
- `lib/model.ts` — scoring and farm-plan model
- `vendor/makefun-board.ts` — the kit's dossier builder
- `dashboard/` — offline static page
- `screenshots/` — board, detail and filtered views
- `out/` — local run output, generated and not committed

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Open `out/dashboard/index.html` from disk. The page reads `../data.js` from the
same output directory and needs no network.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ctpjhcy0&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
