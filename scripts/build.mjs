import { existsSync, statSync } from 'node:fs';
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

child.on('close', (code) => {
  if (code === 0) process.exit(0);

  const exportedIndex = resolve('dist/client/index.html');
  const completedBeforeWindowsShutdownAssertion =
    process.platform === 'win32' &&
    output.includes('Build complete') &&
    output.includes('Prerendered 1 routes') &&
    existsSync(exportedIndex) &&
    statSync(exportedIndex).mtimeMs >= startedAt - 2_000;

  if (completedBeforeWindowsShutdownAssertion) {
    process.stderr.write(
      '\n[build] La exportación estática terminó correctamente; se omite una aserción de cierre conocida del runtime de Windows.\n',
    );
    process.exit(0);
  }

  process.exit(code ?? 1);
});
