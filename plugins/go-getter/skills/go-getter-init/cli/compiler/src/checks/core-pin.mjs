// Decision 0212: the vendored knowledge-base core is byte-identical to the kms ref recorded in src/core-pin.json.
// With --kms <dir> it also compares against that kms checkout at the pinned commit.
import { pinProblems, verifyAgainstKms } from '../core-pin.mjs';

export default function checkCorePin({ root, args }) {
  const i = args.indexOf('--kms');
  const problems = pinProblems(root);
  if (i >= 0 && !problems.length) problems.push(...verifyAgainstKms(root, args[i + 1]));
  if (problems.length) {
    for (const p of problems) console.error(`check core-pin: ${p}`);
    return 1;
  }
  console.log('check core-pin: ok');
  return 0;
}
