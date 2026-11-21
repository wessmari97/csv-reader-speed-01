# Fast CSV reader — a faster drop-in for csv-reader 1.0.0

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/wessmari97/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/wessmari97/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A faster drop-in for [make.fun](https://make.fun/r/jrnh2cfm)'s own csv-reader 1.0.0, written for the [Read broken CSV files faster](https://make.fun/bounty/csv-reader-speed-01-run-20261121) bounty. It answers exactly as csv-reader does on every case — same `{columns, rows, errors}` for every `{text, header}` — only faster. Broken rows are read csv-reader's way: stray CRs, quote junk, unterminated quotes, short and long rows, all reported with the same error codes, lines and rows.

## How it is faster

csv-reader reads one character at a time and builds every field a character at a time. This reader cuts fields out instead: an unquoted field is the slice up to the next comma or LF, found with `indexOf`, and a quoted field is the slice up to its closing quote, found the same way. Only the rare broken pieces — a stray CR in an unquoted field, a line break or a doubled quote inside a quoted one — fall back to a character at a time. Nothing is kept from one call to the next, so every case is answered alone.

## Layout

- `solve.js` — the reader. `run(input)` returns csv-reader's answer for one case.
- `main.ts` — the driver the harness runs: reads every case from `/input/cases.json`, answers each with `run`, writes `/output/answers.json`.

## Run it

```sh
mkdir -p out
MAKEFUN_INPUT_DIR=<cases dir> MAKEFUN_OUTPUT_DIR=out node main.ts
```

Node 22, no dependencies, no network, no build step.
