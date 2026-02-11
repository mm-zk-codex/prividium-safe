import { encodeAbiParameters, encodeFunctionData, getAddress, keccak256, recoverAddress, concatHex, createPublicClient, createWalletClient, decodeEventLog, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from './config.js';
import { pool } from './db.js';
import { v4 as uuidv4 } from 'uuid';
import { authFetch } from './prividiumAuth.js';

const SAFE_ABI = [
  { type: 'function', name: 'getOwners', stateMutability: 'view', inputs: [], outputs: [{ type: 'address[]' }] },
  { type: 'function', name: 'getThreshold', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'nonce', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'execTransaction',
    stateMutability: 'payable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'operation', type: 'uint8' },
      { name: 'safeTxGas', type: 'uint256' },
      { name: 'baseGas', type: 'uint256' },
      { name: 'gasPrice', type: 'uint256' },
      { name: 'gasToken', type: 'address' },
      { name: 'refundReceiver', type: 'address' },
      { name: 'signatures', type: 'bytes' }
    ],
    outputs: [{ type: 'bool' }]
  }
];

const SAFE_FACTORY_ABI = [
  {
    type: 'function',
    name: 'createProxyWithNonce',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_singleton', type: 'address' },
      { name: 'initializer', type: 'bytes' },
      { name: 'saltNonce', type: 'uint256' }
    ],
    outputs: [{ type: 'address' }]
  }
];


const SAFE_FACTORY_EVENTS_ABI = [
  {
    type: 'event',
    name: 'ProxyCreation',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'proxy', type: 'address' },
      { indexed: false, name: 'singleton', type: 'address' }
    ]
  }
];

const SAFE_SETUP_ABI = [
  {
    type: 'function',
    name: 'setup',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_owners', type: 'address[]' },
      { name: '_threshold', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'data', type: 'bytes' },
      { name: 'fallbackHandler', type: 'address' },
      { name: 'paymentToken', type: 'address' },
      { name: 'payment', type: 'uint256' },
      { name: 'paymentReceiver', type: 'address' }
    ],
    outputs: []
  }
];

const authTransport = http(config.rpcUrl, { fetch: authFetch });
const publicClient = createPublicClient({ transport: authTransport });
const serviceAccount = privateKeyToAccount(config.servicePrivateKey);
const walletClient = createWalletClient({ account: serviceAccount, transport: authTransport });

export function normalizeAddress(address) {
  return getAddress(address).toLowerCase();
}

export function buildSafeTxHash(safeAddress, tx) {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'bytes' },
        { type: 'uint8' },
        { type: 'uint256' }
      ],
      [safeAddress, tx.to, BigInt(tx.value), tx.data, tx.operation, BigInt(tx.nonce)]
    )
  );
}

export async function readSafeOnChain(safeAddress) {
  const addr = normalizeAddress(safeAddress);
  const [owners, threshold, nonce] = await Promise.all([
    publicClient.readContract({ address: addr, abi: SAFE_ABI, functionName: 'getOwners' }),
    publicClient.readContract({ address: addr, abi: SAFE_ABI, functionName: 'getThreshold' }),
    publicClient.readContract({ address: addr, abi: SAFE_ABI, functionName: 'nonce' })
  ]);
  return {
    safeAddress: addr,
    chainId: config.chainId,
    owners: owners.map((o) => o.toLowerCase()),
    threshold: Number(threshold),
    nonce: nonce.toString()
  };
}

export async function assertOwner(safeAddress, ownerAddress) {
  const result = await pool.query(
    'SELECT 1 FROM safe_owners WHERE safe_address = $1 AND owner_address = $2',
    [normalizeAddress(safeAddress), normalizeAddress(ownerAddress)]
  );
  if (!result.rowCount) {
    const err = new Error('Not a safe owner');
    err.status = 403;
    throw err;
  }
}

export async function upsertSafe(safeInfo) {
  await pool.query('BEGIN');
  try {
    await pool.query(
      'INSERT INTO safes (safe_address, chain_id, threshold) VALUES ($1,$2,$3) ON CONFLICT (safe_address) DO UPDATE SET threshold = EXCLUDED.threshold, chain_id = EXCLUDED.chain_id',
      [safeInfo.safeAddress, safeInfo.chainId, safeInfo.threshold]
    );
    await pool.query('DELETE FROM safe_owners WHERE safe_address = $1', [safeInfo.safeAddress]);
    for (const owner of safeInfo.owners) {
      await pool.query('INSERT INTO safe_owners (safe_address, owner_address) VALUES ($1,$2)', [safeInfo.safeAddress, owner]);
    }
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

export async function listSafesForOwner(ownerAddress) {
  const rows = await pool.query(
    `SELECT s.safe_address, s.chain_id, s.threshold
     FROM safes s
     JOIN safe_owners so ON so.safe_address = s.safe_address
     WHERE so.owner_address = $1
     ORDER BY s.created_at DESC`,
    [normalizeAddress(ownerAddress)]
  );
  return rows.rows;
}

export async function createSafe({ owners, threshold }) {
  if (!config.safeFactoryAddress || !config.safeSingletonAddress) {
    throw new Error('SAFE_FACTORY_ADDRESS and SAFE_SINGLETON_ADDRESS are required for safe creation');
  }
  const normalizedOwners = [...new Set(owners.map(normalizeAddress))];
  if (threshold < 1 || threshold > normalizedOwners.length) {
    const err = new Error('threshold must be between 1 and owner count');
    err.status = 400;
    throw err;
  }

  const initializer = encodeFunctionData({
    abi: SAFE_SETUP_ABI,
    functionName: 'setup',
    args: [normalizedOwners, BigInt(threshold), '0x0000000000000000000000000000000000000000', '0x', '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000', 0n, '0x0000000000000000000000000000000000000000']
  });

  const hash = await walletClient.writeContract({
    address: normalizeAddress(config.safeFactoryAddress),
    abi: SAFE_FACTORY_ABI,
    functionName: 'createProxyWithNonce',
    args: [normalizeAddress(config.safeSingletonAddress), initializer, BigInt(Date.now())]
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const proxyLog = receipt.logs
    .map((log) => {
      try {
        const decoded = decodeEventLog({ abi: SAFE_FACTORY_EVENTS_ABI, data: log.data, topics: log.topics });
        return decoded;
      } catch (error) {
        return null;
      }
    })
    .find((decoded) => decoded?.eventName === 'ProxyCreation');
  const safeAddress = proxyLog?.args?.proxy;
  if (!safeAddress) throw new Error('Could not infer safe address from ProxyCreation event');

  const safe = await readSafeOnChain(safeAddress);
  await upsertSafe(safe);
  return safe;
}

function rowToProposal(row, confirmations) {
  const tx = {
    to: row.recipient,
    value: row.value,
    data: row.data,
    operation: row.operation,
    nonce: row.nonce.toString()
  };
  return {
    id: row.id,
    safeAddress: row.safe_address,
    tx,
    safeTxHash: row.safe_tx_hash,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    confirmations,
    confirmationsRequired: row.threshold,
    executable: confirmations.length >= row.threshold && !row.executed_tx_hash,
    executedTxHash: row.executed_tx_hash || undefined
  };
}

export async function getProposalByHash(safeTxHash) {
  const base = await pool.query(
    `SELECT p.*, s.threshold FROM proposals p
     JOIN safes s ON s.safe_address = p.safe_address
     WHERE p.safe_tx_hash = $1`,
    [safeTxHash.toLowerCase()]
  );
  if (!base.rowCount) return null;
  const row = base.rows[0];
  const signatures = await pool.query('SELECT owner_address, signature FROM signatures WHERE proposal_id = $1 ORDER BY owner_address ASC', [row.id]);
  return rowToProposal(row, signatures.rows.map((s) => ({ owner: s.owner_address, signature: s.signature })));
}

export async function listProposalsForSafe(safeAddress) {
  const rows = await pool.query(
    `SELECT p.*, s.threshold
     FROM proposals p JOIN safes s ON s.safe_address = p.safe_address
     WHERE p.safe_address = $1
     ORDER BY p.created_at DESC`,
    [normalizeAddress(safeAddress)]
  );
  const results = [];
  for (const row of rows.rows) {
    const sigs = await pool.query('SELECT owner_address, signature FROM signatures WHERE proposal_id = $1 ORDER BY owner_address ASC', [row.id]);
    results.push(rowToProposal(row, sigs.rows.map((s) => ({ owner: s.owner_address, signature: s.signature }))));
  }
  return results;
}

export async function createProposal({ safeAddress, createdBy, tx }) {
  const safe = await readSafeOnChain(safeAddress);
  const nonce = tx.nonce ? BigInt(tx.nonce) : BigInt(safe.nonce);
  const proposalTx = {
    to: normalizeAddress(tx.to),
    value: tx.value,
    data: tx.data,
    operation: tx.operation,
    nonce: nonce.toString()
  };
  const safeTxHash = buildSafeTxHash(safe.safeAddress, proposalTx).toLowerCase();
  const id = uuidv4();

  await pool.query(
    `INSERT INTO proposals (id, safe_address, recipient, value, data, operation, nonce, safe_tx_hash, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (safe_tx_hash) DO NOTHING`,
    [id, safe.safeAddress, proposalTx.to, proposalTx.value, proposalTx.data, proposalTx.operation, proposalTx.nonce, safeTxHash, normalizeAddress(createdBy)]
  );

  return getProposalByHash(safeTxHash);
}

export async function addConfirmation({ safeTxHash, ownerAddress, signature }) {
  const proposal = await getProposalByHash(safeTxHash);
  if (!proposal) {
    const err = new Error('Proposal not found');
    err.status = 404;
    throw err;
  }
  console.log('hash to sign', proposal.safeTxHash);
  const recovered = await recoverAddress({ hash: proposal.safeTxHash, signature });
  console.log('Recovered address from signature', recovered);
  console.log('Owner address', ownerAddress);
  if (normalizeAddress(recovered) !== normalizeAddress(ownerAddress)) {
    const err = new Error('Signature does not match authenticated user');
    err.status = 400;
    throw err;
  }
  await pool.query(
    `INSERT INTO signatures (proposal_id, owner_address, signature)
     VALUES ($1,$2,$3)
     ON CONFLICT (proposal_id, owner_address)
     DO UPDATE SET signature = EXCLUDED.signature, created_at = now()`,
    [proposal.id, normalizeAddress(ownerAddress), signature]
  );
  return getProposalByHash(safeTxHash);
}

function joinSignatures(signatures) {
  return signatures
    .sort((a, b) => (a.owner < b.owner ? -1 : 1))
    .map((s) => s.signature)
    .reduce((acc, sig) => concatHex([acc, sig]), '0x');
}

export async function executeProposal(safeTxHash) {
  const proposal = await getProposalByHash(safeTxHash);
  if (!proposal) {
    const err = new Error('Proposal not found');
    err.status = 404;
    throw err;
  }
  if (!proposal.executable) {
    const err = new Error('Threshold confirmations not met or already executed');
    err.status = 400;
    throw err;
  }
  const sigBlob = joinSignatures(proposal.confirmations);
  const hash = await walletClient.writeContract({
    address: proposal.safeAddress,
    abi: SAFE_ABI,
    functionName: 'execTransaction',
    args: [proposal.tx.to, BigInt(proposal.tx.value), proposal.tx.data, proposal.tx.operation, 0n, 0n, 0n, '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000', sigBlob]
  });

  await pool.query('UPDATE proposals SET executed_tx_hash = $1, executed_at = now() WHERE id = $2', [hash.toLowerCase(), proposal.id]);
  return { executedTxHash: hash.toLowerCase(), proposal: await getProposalByHash(safeTxHash) };
}

export async function syncExecutionsFromChain(fromBlock) {
  const logs = await publicClient.getLogs({
    fromBlock: BigInt(fromBlock),
    toBlock: 'latest'
  });
  let count = 0;
  for (const log of logs) {
    if (!log.transactionHash) continue;
    const existing = await pool.query(
      'SELECT id FROM proposals WHERE executed_tx_hash = $1',
      [log.transactionHash.toLowerCase()]
    );
    if (existing.rowCount) continue;
    count += 1;
  }
  return { scanned: logs.length, matched: count };
}

export async function getLatestBlockNumber() {
  return Number(await publicClient.getBlockNumber());
}
