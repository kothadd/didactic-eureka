import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', process.argv[2] || 'dev'], {
  stdio: 'inherit', env: { ...process.env, INDEX_MODE: 'demo' }
});
child.on('exit', code => process.exit(code ?? 1));
