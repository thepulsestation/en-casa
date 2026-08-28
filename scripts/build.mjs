import { existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const startedAt = Date.now();
const cliPath = resolve('node_modules/vinext/dist/cli.js');
const child = spawn(process.execPath, [cliPath, 'build'], {
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (chunk) => {
  const value = chunk.toString();
  output += value;
  process.stdout.write(value);
});
child.stderr.on('data', (chunk) => {
  const value = chunk.toString();
  output += value;
  process.stderr.write(value);
});

function normalizeGitHubPagesAssets() {
  const publicPath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/^\/+|\/+$/g, '');
  if (!publicPath || publicPath.includes('..')) return;

  const clientRoot = resolve('dist/client');
  const prefixedRoot = resolve(clientRoot, publicPath);
  const prefixedAssets = resolve(prefixedRoot, '_next');
  const rootAssets = resolve(clientRoot, '_next');

  if (!prefixedAssets.startsWith(clientRoot) || !existsSync(prefixedAssets)) return;

  rmSync(rootAssets, { recursive: true, force: true });
  renameSync(prefixedAssets, rootAssets);
  rmSync(prefixedRoot, { recursive: true, force: true });
}

child.on('close', (code) => {
  const exportedIndex = resolve('dist/client/index.html');
  const buildProducedStaticSite =
    output.includes('Build complete') &&
    output.includes('Prerendered 1 routes') &&
    existsSync(exportedIndex) &&
    statSync(exportedIndex).mtimeMs >= startedAt - 2_000;

  if (buildProducedStaticSite) normalizeGitHubPagesAssets();
  if (code === 0) process.exit(0);

  const completedBeforeWindowsShutdownAssertion =
    process.platform === 'win32' &&
    buildProducedStaticSite;

  if (completedBeforeWindowsShutdownAssertion) {
    process.stderr.write(
      '\n[build] La exportación estática terminó correctamente; se omite una aserción de cierre conocida del runtime de Windows.\n',
    );
    process.exit(0);
  }

  process.exit(code ?? 1);
});
