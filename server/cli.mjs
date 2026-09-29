/* Shared by the operator commands in scripts/. Arguments are parsed with
 * Node's own strict parser: unknown options, missing values and stray words
 * are refused with exit code 2 instead of being guessed at. */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

export function usageError(message) {
  return Object.assign(new Error(message), { usage: true });
}

export function readArgs(options, required = []) {
  const { values } = parseArgs({ args: process.argv.slice(2), options, strict: true, allowPositionals: false });
  for (const name of required) if (!values[name]) throw usageError(`--${name} is required.`);
  return values;
}

/* The live database: --data-dir, else DATA_DIR, else ./data — same rule as the server. */
export const databasePath = dataDir => resolve(dataDir ?? process.env.DATA_DIR ?? 'data', 'crumb.sqlite');

/* Runs a command; exit code 0 on success, 1 on failure, 2 on wrong usage. */
export function runCommand(usage, main) {
  main().then(
    () => { process.exitCode = 0; },
    error => {
      const wrongUsage = error.usage || String(error.code ?? '').startsWith('ERR_PARSE_ARGS');
      console.error(wrongUsage ? `${error.message}\n${usage}` : `Error: ${error.message}`);
      process.exitCode = wrongUsage ? 2 : 1;
    },
  );
}
