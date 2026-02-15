import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { createPublicClient, createWalletClient, getAddress, http, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createSiweTenantTokenProvider } from './tenant/siweTenantAuth.ts';
import { tenantHttpTransport } from './transport/tenantHttpTransport.ts';
import { compileContracts } from './compile.ts';

dotenv.config();

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACTS_FILE_PATH = '/shared/contracts.json';
const REQUIRED_KEYS = [
  'safe_factory_address',
  'safe_singleton_address',
  'safe_fallback_handler_address',
  'safe_multisend_address'
] as const;

type ConfigRecord = Record<string, string>;

type PrivateDeployment = {
  key: string;
  artifact: string;
  constructorArgs?: unknown[];
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

function normalize(address: string): string {
  return getAddress(address).toLowerCase();
}

function parsePrivateDeployments(): PrivateDeployment[] {
  const raw = process.env.PRIVATE_CONTRACT_DEPLOYMENTS;
  if (!raw) return [];
  const parsed = JSON.parse(raw) as PrivateDeployment[];
  if (!Array.isArray(parsed)) {
    throw new Error('PRIVATE_CONTRACT_DEPLOYMENTS must be a JSON array');
  }
  return parsed;
}

async function waitForPostgres(pool: Pool, maxAttempts = 45) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (_error) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error('Postgres did not become ready in time');
}

async function ensureConfigTable(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function readAllConfig(pool: Pool): Promise<ConfigRecord> {
  const result = await pool.query('SELECT key, value FROM app_config ORDER BY key ASC');
  return Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
}

async function upsertConfig(pool: Pool, key: string, value: string) {
  await pool.query(
    `INSERT INTO app_config (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value]
  );
}

async function readArtifact(relativePath: string) {
  const artifactPath = path.join(ROOT_DIR, 'artifacts', relativePath);
  const raw = await fs.readFile(artifactPath, 'utf8');
  return JSON.parse(raw) as { abi: unknown[]; bytecode: string };
}

async function deployArtifact({
  walletClient,
  publicClient,
  relativePath,
  constructorArgs
}: {
  walletClient: ReturnType<typeof createWalletClient>;
  publicClient: ReturnType<typeof createPublicClient>;
  relativePath: string;
  constructorArgs?: unknown[];
}) {
  const artifact = await readArtifact(relativePath);
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode as `0x${string}`,
    args: constructorArgs ?? []
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress || !isAddress(receipt.contractAddress)) {
    throw new Error(`Deployment failed for ${relativePath}`);
  }
  return normalize(receipt.contractAddress);
}

async function writeContractsJson(contracts: ConfigRecord) {
  await fs.mkdir(path.dirname(CONTRACTS_FILE_PATH), { recursive: true });
  await fs.writeFile(CONTRACTS_FILE_PATH, `${JSON.stringify(contracts, null, 2)}\n`, 'utf8');
}


function createRpcTransport(rpcUrl: string) {
  const mode = (process.env.TENANT_AUTH_MODE || 'none').toLowerCase();
  if (mode === 'none') {
    return http(rpcUrl);
  }

  if (mode !== 'siwe') {
    throw new Error('TENANT_AUTH_MODE must be one of: none, siwe');
  }

  const tenantPrivateKey = process.env.TENANT_PRIVATE_KEY as `0x${string}` | undefined;
  const tenantSiweBaseUrl = process.env.TENANT_SIWE_BASE_URL;
  if (!tenantPrivateKey || !tenantSiweBaseUrl) {
    throw new Error('TENANT_AUTH_MODE=siwe requires TENANT_PRIVATE_KEY and TENANT_SIWE_BASE_URL');
  }

  const tenantAddress = privateKeyToAccount(tenantPrivateKey).address;
  const tokenProvider = createSiweTenantTokenProvider({
    tenantRpcBaseUrl: tenantSiweBaseUrl,
    tenantAddress,
    tenantPrivateKey,
    audience: process.env.TENANT_AUDIENCE
  });

  return tenantHttpTransport(rpcUrl, tokenProvider);
}

async function main() {
  const databaseUrl = required('DATABASE_URL');
  const rpcUrl = required('L2_RPC_URL');
  const privateKey = required('DEPLOYER_PRIVATE_KEY') as `0x${string}`;
  const expectedChainId = Number(required('CHAIN_ID'));

  const pool = new Pool({ connectionString: databaseUrl });
  await waitForPostgres(pool);
  await ensureConfigTable(pool);

  const currentConfig = await readAllConfig(pool);
  const isInitialized = REQUIRED_KEYS.every((key) => currentConfig[key]);
  if (isInitialized) {
    console.log('already initialized');
    await writeContractsJson(currentConfig);
    await pool.end();
    return;
  }

  await compileContracts();

  const account = privateKeyToAccount(privateKey);
  const transport = createRpcTransport(rpcUrl);
  const publicClient = createPublicClient({ transport });
  const walletClient = createWalletClient({ account, transport });

  const rpcChainId = await publicClient.getChainId();
  if (rpcChainId !== expectedChainId) {
    throw new Error(`CHAIN_ID mismatch. Expected ${expectedChainId}, RPC returned ${rpcChainId}`);
  }

  const deployedContracts: ConfigRecord = {
    safe_singleton_address: await deployArtifact({
      walletClient,
      publicClient,
      relativePath: 'contracts/SafeDeploy.sol/SafeSingleton.json'
    }),
    safe_factory_address: await deployArtifact({
      walletClient,
      publicClient,
      relativePath: 'contracts/SafeDeploy.sol/SafeFactory.json'
    }),
    safe_fallback_handler_address: await deployArtifact({
      walletClient,
      publicClient,
      relativePath: 'contracts/SafeDeploy.sol/SafeFallbackHandler.json'
    }),
    safe_multisend_address:
      process.env.MULTISEND_ADDRESS && isAddress(process.env.MULTISEND_ADDRESS)
        ? normalize(process.env.MULTISEND_ADDRESS)
        : await deployArtifact({
            walletClient,
            publicClient,
            relativePath: 'contracts/SafeDeploy.sol/SafeMultiSend.json'
          })
  };

  for (const deployment of parsePrivateDeployments()) {
    const address = await deployArtifact({
      walletClient,
      publicClient,
      relativePath: deployment.artifact,
      constructorArgs: deployment.constructorArgs
    });
    deployedContracts[deployment.key] = address;
  }

  for (const [key, value] of Object.entries(deployedContracts)) {
    await upsertConfig(pool, key, value);
  }

  const allConfig = await readAllConfig(pool);
  await writeContractsJson(allConfig);
  console.log('initialized contracts');

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
