// Orchestrator for `npm run setup`.
//
// Branch on --network:
//   * undeployed (default): brings up the full local devnet (node + indexer +
//     proof server) with Docker, compiles, deploys.
//   * preview / preprod: public networks need no local node/indexer. If a local
//     proof server (Docker) is unavailable, deploy still works via the browser
//     DApp Connector wallet (frontend/), which proves in-app.
import { spawnSync } from 'node:child_process';

import { resolveNetwork, setActiveNetwork, parseNetworkFlag } from './network';

function run(cmd: string, args: string[]): void {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false });
  if (r.status !== 0) {
    process.stderr.write(`\nCommand failed: ${cmd} ${args.join(' ')}\n`);
    process.exit(r.status ?? 1);
  }
}

function dockerAvailable(): boolean {
  const r = spawnSync('docker', ['--version'], { stdio: 'ignore', shell: false });
  return r.status === 0;
}

async function main(): Promise<void> {
  const argv = process.argv;
  const flag = parseNetworkFlag(argv);
  if (flag) setActiveNetwork(flag);
  const { network, config } = resolveNetwork({ argv });

  process.stdout.write(`\n→ Setting up ProofGate on network: ${network}\n\n`);

  if (network === 'undeployed') {
    if (!dockerAvailable()) {
      process.stderr.write(
        '\n❌ The local devnet (node + indexer + proof server) requires Docker.\n' +
          '   On Windows/WSL2 enable Docker Desktop → Settings → Resources → WSL integration,\n' +
          '   or install the docker engine inside WSL, then re-run: npm run setup\n',
      );
      process.exit(1);
    }
    run('docker', ['compose', 'up', '-d', '--wait', ...config.composeServices]);
  } else {
    process.stdout.write(
      '  Public network — no local node/indexer required. If a local proof server is\n' +
        '  unavailable, deploy + calls still work from the browser wallet (frontend/).\n\n',
    );
  }

  run('npm', ['run', 'compile']);

  const deployArgs = network === 'undeployed' ? [] : ['--', '--network', network];
  run('npm', ['run', 'deploy', ...deployArgs]);
}

main().catch((e) => {
  process.stderr.write(`\nSetup failed: ${(e as Error).message}\n`);
  process.exit(1);
});
