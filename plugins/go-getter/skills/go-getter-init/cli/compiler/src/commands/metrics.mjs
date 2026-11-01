// go-getter metrics day [--date YYYY-MM-DD] [--project <dir>]: the throughput report for one UTC day (decision 0154).
import path from 'node:path';
import { dayReport } from '../metrics/day.mjs';

const USAGE = 'usage: go-getter metrics day [--date YYYY-MM-DD] [--project <dir>]';

export default function metricsCommand({ args }) {
  const [sub, ...rest] = args;
  let project = process.cwd();
  let date = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--project' && rest[i + 1]) project = path.resolve(rest[++i]);
    else if (rest[i] === '--date' && rest[i + 1]) date = rest[++i];
    else sub === 'day' && console.error(`metrics: unknown argument ${rest[i]}`), (date = null);
  }
  if (sub !== 'day' || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || Number.isNaN(Date.parse(date))) {
    console.error(USAGE);
    return 2;
  }
  console.log(JSON.stringify(dayReport(project, date), null, 2));
  return 0;
}
