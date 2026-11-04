// go-getter pr [--title <type: summary>] [--why <intent>] [--dry-run] [--no-conform] [--no-review] [--interval <s>] [--timeout <min>] [--project <dir>]
// Everything `ship` does except the merge (decision 0163): checks, message with Refs, push, pull request, wait for CI.
import { runVerb } from './ship.mjs';

export default ({ args }) => runVerb('pr', args);
