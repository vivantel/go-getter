// go-getter doctor [--project <dir>] [--hosts <h1,h2>|all]
// Prints what a person may need to do by hand: the allow rules for commands the project frees or approves that a host's own
// permission layer can still refuse (decision 0152). Reads only; writes nothing.
import path from 'node:path';
import { allowSuggestions, formatSuggestions } from '../allow-rules.mjs';
import { HOSTS } from '../capabilities.mjs';

export default function doctorCommand({ args }) {
  let project = process.cwd();
  let hosts;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project') project = path.resolve(args[++i]);
    else if (args[i] === '--hosts') hosts = args[++i] === 'all' ? HOSTS : args[i].split(',');
    else throw new Error(`doctor: unknown argument ${args[i]}`);
  }
  const lines = formatSuggestions(allowSuggestions(project, hosts));
  console.log(lines.length ? lines.join('\n') : 'doctor: no command is freed or approved that a host permission layer needs a rule for');
  return 0;
}
