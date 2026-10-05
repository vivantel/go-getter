// go-getter apply [--project <dir>] [--hosts <h1,h2>|all] [--check]
import path from 'node:path';
import { planApply, writeApply, diffApply } from '../apply.mjs';
import { HOSTS } from '../capabilities.mjs';

export default function applyCommand({ args }) {
  let project = process.cwd();
  let hosts;
  let check = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project') project = path.resolve(args[++i]);
    else if (args[i] === '--hosts') hosts = args[++i] === 'all' ? HOSTS : args[i].split(',');
    else if (args[i] === '--check') check = true;
    else throw new Error(`apply: unknown argument ${args[i]}`);
  }
  const plan = planApply(project, { hosts });
  if (check) {
    const problems = diffApply(project, plan);
    if (problems.length) {
      console.error(`apply --check: ${problems.length} file(s) out of date; run "go-getter apply"`);
      for (const p of problems) console.error(`  ${p}`);
      return 1;
    }
    console.log('apply --check: ok');
    return 0;
  }
  const written = writeApply(project, plan);
  console.log(`apply: hosts ${plan.hosts.join(', ') || '(none detected)'}; tier 2 ${plan.tier2 ? 'on' : 'off'}; tier 3 ${plan.tier3 ? 'on' : 'off'}`);
  for (const w of written) console.log(`  ${w}`);
  return 0;
}
