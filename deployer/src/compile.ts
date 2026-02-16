import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT_DIR, stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${cmd} ${args.join(' ')} failed with exit code ${code ?? 'unknown'}`));
    });
  });
}

export async function compileContracts() {
  await run('npx', ['hardhat', 'compile']);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  compileContracts().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
