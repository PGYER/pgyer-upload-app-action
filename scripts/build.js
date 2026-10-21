// Bundles the action into dist/index.js and collects the licenses of the bundled packages.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

// @actions/core needs @actions/http-client only for getIDToken(), which this action never calls. Bundling it
// would add undici 6, which installs itself as the global dispatcher for Node's own fetch() when loaded.
const withoutHttpClient = {
  name: 'without-http-client',
  setup(build) {
    build.onResolve({ filter: /^@actions\/http-client(\/.*)?$/ }, (args) => ({
      path: args.path,
      namespace: 'http-client-stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'http-client-stub' }, () => ({
      contents: `
        const unavailable = () => { throw new Error('@actions/http-client is not bundled with this action'); };
        export class HttpClient { constructor() { unavailable(); } }
        export class BearerCredentialHandler { constructor() { unavailable(); } }
      `,
      loader: 'js',
    }));
  },
};

const result = await build({
  entryPoints: ['src/index.js'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  metafile: true,
  legalComments: 'none',
  // Bundled CommonJS packages call require() for Node built-ins.
  banner: { js: "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);" },
  plugins: [withoutHttpClient],
  logLevel: 'warning',
});

const packages = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const match = input.match(/^(?:.*\/)?node_modules\/((?:@[^/]+\/)?[^/]+)\//);
  if (match) {
    packages.add(match[1]);
  }
}

const sections = [...packages].sort().map((name) => {
  const dir = path.join('node_modules', name);
  const { version, license } = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const file = readdirSync(dir).sort().find((entry) => /^licen[cs]e/i.test(entry));
  const text = file ? readFileSync(path.join(dir, file), 'utf8').trim() : `License: ${license}`;
  return `${name}@${version}\n${license}\n\n${text}`;
});
writeFileSync('dist/licenses.txt', `${sections.join('\n\n----------------------------------------\n\n')}\n`);
