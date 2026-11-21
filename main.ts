// Driver for the csv-reader-speed-01 entry: the harness runs
// `node /bot/main.ts` (node22). It reads every case from /input/cases.json
// (a JSON array of {id, input}), answers each one alone with run() from
// solve.js, and writes /output/answers.json: a JSON array of the answers,
// one per case and in the cases' order. Outside a container
// MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for /input and /output.
//
// V8's incremental marking is off, set before solve.js is imported so all
// of its work runs under it, as the house baseline runs.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

setFlagsFromString('--no-incremental-marking');

/** solve.js, imported by its URL (a .js module carries no types) and typed by its contract. */
const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  run: (input: unknown) => unknown;
};

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as Array<{
  id: string;
  input: unknown;
}>;

const answers = cases.map((c) => run(c.input));

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(OUTPUT_DIR, 'answers.json'), JSON.stringify(answers));
