// go-getter secret run (--from <dotenv-file> | --file <path> [--env <NAME>]) -- <command> [args...]
// go-getter secret put <path> ...: see compiler/src/secrets/put.mjs (decision 0107).
// Both are the only go-getter calls a host's pre-tool hook lets name a use or sink path (decision 0072).
import { runSecret } from '../secrets/run.mjs';
import { recordQuietly } from '../telemetry/record.mjs';

export default async function secretCommand({ args }) {
  const [sub, ...rest] = args;
  const project = process.cwd();
  if (sub === 'run') {
    const result = await runSecret(project, rest);
    if (result.refused) {
      console.error(`go-getter secret run: ${result.refused}`);
      if (!result.usage) recordQuietly(project, { event: 'secret-run', outcome: 'blocked' });
      return result.usage ? 2 : 1;
    }
    recordQuietly(project, { event: 'secret-run', outcome: result.code === 0 ? 'pass' : 'fail' });
    return result.code;
  }
  console.error('usage: go-getter secret run (--from <dotenv-file> | --file <path> [--env <NAME>]) -- <command> [args...]');
  return 2;
}
