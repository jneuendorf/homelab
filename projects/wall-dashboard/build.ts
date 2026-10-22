// 1. apps with their own toolchain (package.json "build" script) build themselves
// 2. esbuild bundles the shell + config; every app UI becomes a lazy chunk
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { build, type Plugin } from 'esbuild';
import { configPath } from './server/config.ts';

for (const dir of readdirSync('apps')) {
  const pkg = `apps/${dir}/package.json`;
  if (!existsSync(pkg) || !JSON.parse(readFileSync(pkg, 'utf8')).scripts?.build) continue;
  const run = (...args: string[]) =>
    execFileSync('npm', args, { cwd: `apps/${dir}`, stdio: 'inherit' });
  if (!existsSync(`apps/${dir}/node_modules`)) run('ci');
  run('run', 'build');
}

const browser: Plugin = {
  name: 'wall',
  setup(b) {
    // the host-local config wins, same as on the server
    b.onResolve({ filter: /^#config$/ }, () => ({ path: configPath() }));
    // server code never ships to the browser (it imports node: modules and reads secrets)
    b.onResolve({ filter: /\/server\.ts$/ }, (args) => ({
      path: args.path,
      namespace: 'server-only',
    }));
    b.onLoad({ filter: /.*/, namespace: 'server-only' }, () => ({
      contents: 'export default null',
    }));
  },
};

rmSync('dist/public', { recursive: true, force: true });
await build({
  entryPoints: ['shell/main.ts'],
  bundle: true,
  splitting: true,
  format: 'esm',
  minify: true,
  target: ['safari15', 'chrome100'],
  outdir: 'dist/public',
  chunkNames: 'chunks/[name]-[hash]',
  loader: { '.css': 'text' },
  plugins: [browser],
  logLevel: 'info',
});
cpSync('shell/index.html', 'dist/public/index.html');
cpSync('shell/shell.css', 'dist/public/shell.css');
cpSync('sdk/ui.css', 'dist/public/ui.css');
