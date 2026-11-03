// go-getter doctor [--project <dir>] [--hosts <h1,h2>|all]
// Prints what a person may need to do by hand: the allow rules for commands the project frees or approves that a host's own
// permission layer can still refuse (decision 0152). Reads only; writes nothing.
import path from 'node:path';
import { allowSuggestions, formatSuggestions } from '../allow-rules.mjs';
import { HOSTS } from '../capabilities.mjs';
import { installedPluginVersion } from '../plugin-pin.mjs';
import { packageVersion } from '../apply.mjs';

export default function doctorCommand({ root, args }) {
  let project = process.cwd();
  let hosts;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project') project = path.resolve(args[++i]);
    else if (args[i] === '--hosts') hosts = args[++i] === 'all' ? HOSTS : args[i].split(',');
    else throw new Error(`doctor: unknown argument ${args[i]}`);
  }
  const lines = formatSuggestions(allowSuggestions(project, hosts));
  console.log(lines.length ? lines.join('\n') : 'doctor: no command is freed or approved that a host permission layer needs a rule for');
  // A plugin the host installed at another version than this CLI: the skills then run older instructions (decision 0183).
  const cli = packageVersion(root);
  const plugin = installedPluginVersion(project);
  if (plugin && plugin !== cli) console.log(`doctor: the installed go-getter plugin is ${plugin} but the CLI is ${cli}; run "claude plugin update go-getter@go-getter" and restart the host`);
  return 0;
}
