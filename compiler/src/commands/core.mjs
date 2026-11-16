// go-getter core update <ref> --from <kms checkout> | status: manage the vendored knowledge-base core (decision 0212).
import path from 'node:path';
import { readPin, updateCore } from '../core-pin.mjs';

export default function core({ root, args }) {
  const [sub, ref, ...rest] = args;
  if (sub === 'status') {
    const pin = readPin(root);
    console.log(pin ? `kms ${pin.ref} (${pin.commit.slice(0, 10)}), schema ${pin.schemaVersion}, ${Object.keys(pin.files).length} files` : 'no core pinned');
    return 0;
  }
  const from = rest[rest.indexOf('--from') + 1];
  if (sub !== 'update' || !ref || !from || rest.indexOf('--from') < 0) {
    console.error('usage: go-getter core update <ref> --from <kms checkout> | core status');
    return 2;
  }
  const pin = updateCore(root, path.resolve(from), ref);
  console.log(`core update: kms ${pin.ref} (${pin.commit.slice(0, 10)}), schema ${pin.schemaVersion}, ${Object.keys(pin.files).length} files; expected release tag ${pin.expectedTag}`);
  return 0;
}
