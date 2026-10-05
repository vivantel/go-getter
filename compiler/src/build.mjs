// Compiles neutral source (src/) into each host's distributable packaging (decision 0021, output kind A).
// An output is a map of repo-relative path -> { content } | { symlink: relativeTarget }.
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync, rmSync, symlinkSync, lstatSync, cpSync } from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';
import { HOSTS, loadCapabilities } from './capabilities.mjs';

export const PLUGIN_DIR = 'plugins/go-getter';
// Paths the build owns completely; anything else in the repo is left alone.
export const GENERATED_ROOTS = [PLUGIN_DIR, '.claude-plugin/marketplace.json', '.agents/plugins/marketplace.json', 'gemini-extension.json', 'skills'];

const SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SPEC_FIELDS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);

function listFiles(dir, base = dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const p = path.join(dir, name);
      return statSync(p).isDirectory() ? listFiles(p, base) : [path.relative(base, p).split(path.sep).join('/')];
    });
}

export function readSkills(srcDir) {
  const skillsDir = path.join(srcDir, 'skills');
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir)
    .filter((n) => statSync(path.join(skillsDir, n)).isDirectory())
    .sort()
    .map((dirName) => {
      const dir = path.join(skillsDir, dirName);
      const skillFile = path.join(dir, 'SKILL.md');
      if (!existsSync(skillFile)) throw new Error(`skill ${dirName}: missing SKILL.md`);
      const { data } = parseFrontmatter(readFileSync(skillFile, 'utf8'));
      if (data.name !== dirName) throw new Error(`skill ${dirName}: frontmatter name "${data.name}" must equal the directory name`);
      if (!SKILL_NAME.test(dirName)) throw new Error(`skill ${dirName}: name must match ${SKILL_NAME}`);
      if (typeof data.description !== 'string' || !data.description.trim()) throw new Error(`skill ${dirName}: description is required`);
      const extra = Object.keys(data).filter((k) => !SPEC_FIELDS.has(k));
      if (extra.length) throw new Error(`skill ${dirName}: non-standard frontmatter ${extra.join(', ')} (Agent Skills fields only)`);
      const files = listFiles(dir);
      return { name: dirName, files, read: (f) => readFileSync(path.join(dir, f)) };
    });
}

function json(value) {
  return { content: `${JSON.stringify(value, null, 2)}\n` };
}

export function packageMeta(pkg) {
  return {
    name: 'go-getter',
    version: pkg.version,
    description: pkg.description,
    author: { name: 'vivantel' },
    homepage: 'https://github.com/vivantel/go-getter',
    repository: 'https://github.com/vivantel/go-getter',
    license: pkg.license,
    keywords: ['agent-harness', 'sdlc', 'model-routing', 'guardrails'],
  };
}

const sharedSkills = (ctx) => {
  const out = {};
  for (const skill of ctx.skills) {
    for (const f of skill.files) out[`${PLUGIN_DIR}/skills/${skill.name}/${f}`] = { content: skill.read(f) };
  }
  return out;
};

const agentPluginsManifest = (ctx) => ({
  [`${PLUGIN_DIR}/plugin.json`]: json({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', ...ctx.meta }),
});

// One emitter per host. Each returns the files that host needs; identical shared entries are merged.
export const ADAPTERS = {
  'claude-code': (ctx) => ({
    ...sharedSkills(ctx),
    '.claude-plugin/marketplace.json': json({
      name: 'go-getter',
      owner: { name: 'vivantel' },
      description: ctx.meta.description,
      plugins: [{ name: 'go-getter', description: ctx.meta.description, source: `./${PLUGIN_DIR}` }],
    }),
    [`${PLUGIN_DIR}/.claude-plugin/plugin.json`]: json({ ...ctx.meta, displayName: 'go-getter' }),
  }),
  codex: (ctx) => ({
    ...sharedSkills(ctx),
    [`${PLUGIN_DIR}/.codex-plugin/plugin.json`]: json({
      name: ctx.meta.name,
      version: ctx.meta.version,
      description: ctx.meta.description,
      skills: './skills',
    }),
    // Entry shape per third-party descriptions of Codex marketplaces; verified in plan step 6.3.
    '.agents/plugins/marketplace.json': json({
      name: 'go-getter',
      interface: { displayName: 'go-getter' },
      plugins: [
        {
          name: 'go-getter',
          source: { source: 'local', path: `./${PLUGIN_DIR}` },
          policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
          category: 'Developer Tools',
        },
      ],
    }),
  }),
  'kilo-opencode': (ctx) => ({
    ...sharedSkills(ctx),
    [`${PLUGIN_DIR}/skills/index.json`]: json({
      skills: ctx.skills.map((s) => ({ name: s.name, version: ctx.meta.version, files: s.files })),
    }),
  }),
  cursor: (ctx) => ({ ...sharedSkills(ctx), ...agentPluginsManifest(ctx) }),
  copilot: (ctx) => ({ ...sharedSkills(ctx), ...agentPluginsManifest(ctx) }),
  // Gemini installs a whole repo and needs gemini-extension.json and skills/ in the same root.
  'gemini-cli': (ctx) => ({
    ...sharedSkills(ctx),
    'gemini-extension.json': json({ name: ctx.meta.name, version: ctx.meta.version, description: ctx.meta.description }),
    skills: { symlink: `${PLUGIN_DIR}/skills` },
  }),
};

function sameEntry(a, b) {
  if ('symlink' in a || 'symlink' in b) return a.symlink === b.symlink;
  return Buffer.from(a.content).equals(Buffer.from(b.content));
}

export function compile({ root, hosts = HOSTS }) {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const caps = loadCapabilities(root);
  const ctx = { pkg, meta: packageMeta(pkg), skills: readSkills(path.join(root, 'src')), caps };
  const outputs = {};
  for (const host of hosts) {
    const adapter = ADAPTERS[host];
    if (!adapter) throw new Error(`no adapter for host "${host}"`);
    for (const [p, entry] of Object.entries(adapter(ctx))) {
      if (outputs[p] && !sameEntry(outputs[p], entry)) throw new Error(`hosts disagree on generated file ${p}`);
      outputs[p] = entry;
    }
  }
  // Keep the skills directory present even with no skills, so the gemini symlink never dangles.
  if (!Object.keys(outputs).some((p) => p.startsWith(`${PLUGIN_DIR}/skills/`))) {
    outputs[`${PLUGIN_DIR}/skills/.gitkeep`] = { content: '' };
  }
  return outputs;
}

function removePath(p) {
  try {
    lstatSync(p);
  } catch {
    return;
  }
  rmSync(p, { recursive: true, force: true });
}

export function writeOutputs(targetRoot, outputs, { copy = process.platform === 'win32' } = {}) {
  for (const r of GENERATED_ROOTS) removePath(path.join(targetRoot, r));
  const symlinks = [];
  for (const [rel, entry] of Object.entries(outputs)) {
    const dest = path.join(targetRoot, rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    if ('symlink' in entry) symlinks.push([dest, entry.symlink]);
    else writeFileSync(dest, entry.content);
  }
  // Symlinks last, so copy mode can copy their already-written targets.
  for (const [dest, target] of symlinks) {
    const absTarget = path.join(targetRoot, target);
    if (copy) cpSync(absTarget, dest, { recursive: true });
    else symlinkSync(path.relative(path.dirname(dest), absTarget), dest);
  }
}
