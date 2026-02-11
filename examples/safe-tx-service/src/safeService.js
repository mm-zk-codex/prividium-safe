import {
  encodeFunctionData,
  getAddress,
  concatHex,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  decodeFunctionData,
  formatUnits,
  http,
  isAddress,
  parseUnits,
  recoverTypedDataAddress,
  hashTypedData
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from './config.js';
import { pool } from './db.js';
import { v4 as uuidv4 } from 'uuid';
import { authFetch } from './prividiumAuth.js';
import { getSupportedTokenAddresses, getTokenMetadata, isSupportedToken } from './tokens.js';

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

const ERC20_TRANSFER_ABI = [{
  type: 'function',
  name: 'transfer',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' }
  ],
  outputs: [{ name: '', type: 'bool' }]
}];

const ERC20_BALANCE_ABI = [{
  type: 'function',
  name: 'balanceOf',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }]
}];

const authTransport = http(config.rpcUrl, { fetch: authFetch });
const publicClient = createPublicClient({ transport: authTransport });
const serviceAccount = privateKeyToAccount(config.servicePrivateKey);
const walletClient = createWalletClient({ account: serviceAccount, transport: authTransport });

export function normalizeAddress(address) {
  return getAddress(address).toLowerCase();
}

const SAFE_TX_TYPES = {
  SafeTx: [
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'data', type: 'bytes' },
    { name: 'operation', type: 'uint8' },
    { name: 'safeTxGas', type: 'uint256' },
    { name: 'baseGas', type: 'uint256' },
    { name: 'gasPrice', type: 'uint256' },
    { name: 'gasToken', type: 'address' },
    { name: 'refundReceiver', type: 'address' },
    { name: 'nonce', type: 'uint256' }
  ]
};

export function buildSafeTxTypedData({ chainId, safeAddress, safeTx }) {
  return {
    domain: {
      chainId: BigInt(chainId),
      verifyingContract: normalizeAddress(safeAddress)
    },
    types: SAFE_TX_TYPES,
    primaryType: 'SafeTx',
    message: {
      to: normalizeAddress(safeTx.to),
      value: BigInt(safeTx.value),
      data: safeTx.data,
      operation: Number(safeTx.operation),
      safeTxGas: 0n,
      baseGas: 0n,
      gasPrice: 0n,
      gasToken: '0x0000000000000000000000000000000000000000',
      refundReceiver: '0x0000000000000000000000000000000000000000',
      nonce: BigInt(safeTx.nonce)
    }
  };
}

export function buildSafeTxHash(safeAddress, tx) {
  const typedData = buildSafeTxTypedData({ chainId: config.chainId, safeAddress, safeTx: tx });
  return hashTypedData(typedData);
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
    executedTxHash: row.executed_tx_hash || undefined,
    isAdvanced: Boolean(row.is_advanced),
    summary: typeof row.summary === 'string' ? JSON.parse(row.summary) : row.summary || undefined
  };
}

async function buildProposalSummary(tx, isAdvanced = false) {
  if (isAdvanced) {
    return {
      type: 'advanced',
      label: 'Custom calldata'
    };
  }

  if (!tx.data || tx.data === '0x') {
    return {
      type: 'native-transfer',
      amount: tx.value
    };
  }

  try {
    const decoded = decodeFunctionData({ abi: ERC20_TRANSFER_ABI, data: tx.data });
    if (decoded.functionName !== 'transfer') return null;
    const recipient = decoded.args[0];
    const amount = decoded.args[1];
    const metadata = await getTokenMetadata(tx.to);
    return {
      type: 'erc20-transfer',
      tokenSymbol: metadata.symbol,
      tokenAddress: metadata.address,
      recipient: normalizeAddress(recipient),
      amount: formatUnits(amount, metadata.decimals)
    };
  } catch (_error) {
    return null;
  }
}

async function normalizeProposalInput(input) {
  const mode = input.mode || 'direct';
  const isAdvanced = Boolean(input.advanced);

  if (mode === 'erc20' && !isAdvanced) {
    const tokenAddress = input.erc20?.tokenAddress;
    const recipient = input.erc20?.recipient;
    const amount = input.erc20?.amount;
    if (!tokenAddress || !recipient || !amount) {
      const err = new Error('erc20 tokenAddress/recipient/amount are required');
      err.status = 400;
      throw err;
    }
    if (!isAddress(tokenAddress) || !isAddress(recipient)) {
      const err = new Error('erc20 tokenAddress and recipient must be valid addresses');
      err.status = 400;
      throw err;
    }
    if (!isSupportedToken(tokenAddress)) {
      const err = new Error('Unsupported ERC20 token for this chain');
      err.status = 400;
      throw err;
    }
    const metadata = await getTokenMetadata(tokenAddress);
    const parsedAmount = parseUnits(String(amount), metadata.decimals);
    if (parsedAmount <= 0n) {
      const err = new Error('erc20 amount must be greater than 0');
      err.status = 400;
      throw err;
    }
    return {
      proposalTx: {
        to: normalizeAddress(tokenAddress),
        value: '0',
        data: encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: 'transfer',
          args: [normalizeAddress(recipient), parsedAmount]
        }),
        operation: 0
      },
      isAdvanced: false,
      summary: {
        type: 'erc20-transfer',
        tokenSymbol: metadata.symbol,
        tokenAddress: metadata.address,
        recipient: normalizeAddress(recipient),
        amount: String(amount)
      }
    };
  }

  const tx = input.tx;
  if (!tx?.to || tx?.value === undefined || tx?.data === undefined || tx?.operation === undefined) {
    const err = new Error('tx.to/value/data/operation are required');
    err.status = 400;
    throw err;
  }
  if (!isAddress(tx.to)) {
    const err = new Error('tx.to must be a valid address');
    err.status = 400;
    throw err;
  }
  if (!/^0x([0-9a-fA-F]{2})*$/.test(tx.data || '')) {
    const err = new Error('tx.data must be valid hex');
    err.status = 400;
    throw err;
  }

  const proposalTx = {
    to: normalizeAddress(tx.to),
    value: String(tx.value),
    data: tx.data,
    operation: Number(tx.operation)
  };
  return {
    proposalTx,
    isAdvanced,
    summary: await buildProposalSummary(proposalTx, isAdvanced)
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
  const { proposalTx: normalizedTx, isAdvanced, summary } = await normalizeProposalInput(tx);
  const providedNonce = tx.tx?.nonce ?? tx.nonce;
  const nonce = providedNonce !== undefined ? BigInt(providedNonce) : BigInt(safe.nonce);
  const proposalTx = { ...normalizedTx, nonce: nonce.toString() };
  const safeTxHash = buildSafeTxHash(safe.safeAddress, proposalTx).toLowerCase();
  const id = uuidv4();

  await pool.query(
    `INSERT INTO proposals (id, safe_address, recipient, value, data, operation, nonce, safe_tx_hash, created_by, is_advanced, summary)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (safe_tx_hash) DO NOTHING`,
    [
      id,
      safe.safeAddress,
      proposalTx.to,
      proposalTx.value,
      proposalTx.data,
      proposalTx.operation,
      proposalTx.nonce,
      safeTxHash,
      normalizeAddress(createdBy),
      isAdvanced,
      summary ? JSON.stringify(summary) : null
    ]
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
  const typedData = buildSafeTxTypedData({
    chainId: config.chainId,
    safeAddress: proposal.safeAddress,
    safeTx: proposal.tx
  });
  const recovered = await recoverTypedDataAddress({ ...typedData, signature });
  if (normalizeAddress(recovered) !== normalizeAddress(ownerAddress)) {
    const err = new Error('Signature mismatch (ensure you signed the typed data prompt)');
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

export async function getTypedDataForProposal(safeTxHash) {
  const proposal = await getProposalByHash(safeTxHash);
  if (!proposal) {
    const err = new Error('Proposal not found');
    err.status = 404;
    throw err;
  }
  const typedData = buildSafeTxTypedData({
    chainId: config.chainId,
    safeAddress: proposal.safeAddress,
    safeTx: proposal.tx
  });
  return {
    domain: {
      ...typedData.domain,
      chainId: Number(typedData.domain.chainId)
    },
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: {
      ...typedData.message,
      value: typedData.message.value.toString(),
      safeTxGas: typedData.message.safeTxGas.toString(),
      baseGas: typedData.message.baseGas.toString(),
      gasPrice: typedData.message.gasPrice.toString(),
      nonce: typedData.message.nonce.toString()
    },
    safeAddress: proposal.safeAddress,
    chainId: config.chainId
  };
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

export async function getSafeBalances(safeAddress) {
  const normalizedSafeAddress = normalizeAddress(safeAddress);
  const nativeBalance = await publicClient.getBalance({ address: normalizedSafeAddress });
  const tokenAddresses = getSupportedTokenAddresses();
  const erc20 = await Promise.all(
    tokenAddresses.map(async (tokenAddress) => {
      const [metadata, balance] = await Promise.all([
        getTokenMetadata(tokenAddress),
        publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [normalizedSafeAddress]
        })
      ]);
      return {
        address: metadata.address,
        symbol: metadata.symbol,
        name: metadata.name,
        decimals: metadata.decimals,
        balance: balance.toString()
      };
    })
  );

  return {
    safeAddress: normalizedSafeAddress,
    chainId: config.chainId,
    native: {
      symbol: config.nativeSymbol,
      decimals: config.nativeDecimals,
      balance: nativeBalance.toString()
    },
    erc20
  };
}

function normalizeLabel(label) {
  return String(label || '').trim();
}

function validateAddressBookInput({ label, address }, { allowPartial = false } = {}) {
  const errors = [];
  const normalized = {};

  if (!allowPartial || label !== undefined) {
    const nextLabel = normalizeLabel(label);
    if (!nextLabel) errors.push('label is required');
    if (nextLabel.length > 80) errors.push('label must be 80 characters or less');
    normalized.label = nextLabel;
  }

  if (!allowPartial || address !== undefined) {
    if (!isAddress(address || '')) {
      errors.push('address must be a valid 0x address');
    } else {
      normalized.address = normalizeAddress(address);
    }
  }

  if (errors.length) {
    const err = new Error(errors[0]);
    err.status = 400;
    throw err;
  }

  return normalized;
}

async function getEntryTxCount(safeAddress, address) {
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS tx_count
       FROM proposals
      WHERE safe_address = $1
        AND recipient = $2
        AND executed_tx_hash IS NOT NULL`,
    [safeAddress, address]
  );
  return Number(countRes.rows[0]?.tx_count || 0);
}

async function getLatestAuditByEntryIds(safeAddress) {
  const rows = await pool.query(
    `SELECT DISTINCT ON (a.address_book_id)
        a.address_book_id,
        a.changed_at,
        a.changed_by
      FROM address_book_audit a
      WHERE a.safe_address = $1
      ORDER BY a.address_book_id, a.changed_at DESC`,
    [safeAddress]
  );
  return new Map(rows.rows.map((row) => [row.address_book_id, row]));
}

function mapAddressBookRow(row, latestAudit, txCount) {
  return {
    id: row.id,
    label: row.label,
    address: row.address,
    createdAt: row.created_at.toISOString(),
    createdBy: row.created_by,
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by,
    lastChangedAt: (latestAudit?.changed_at || row.updated_at).toISOString(),
    lastChangedBy: latestAudit?.changed_by || row.updated_by,
    txCount
  };
}

export async function listAddressBookEntries(safeAddress) {
  const normalizedSafeAddress = normalizeAddress(safeAddress);
  const entries = await pool.query(
    `SELECT id, safe_address, address, label, created_at, created_by, updated_at, updated_by
     FROM address_book
     WHERE safe_address = $1
     ORDER BY updated_at DESC, created_at DESC`,
    [normalizedSafeAddress]
  );
  const latestAuditByEntry = await getLatestAuditByEntryIds(normalizedSafeAddress);

  const rows = await Promise.all(entries.rows.map(async (row) => {
    const txCount = await getEntryTxCount(normalizedSafeAddress, row.address);
    return mapAddressBookRow(row, latestAuditByEntry.get(row.id), txCount);
  }));

  return rows;
}

export async function createAddressBookEntry({ safeAddress, label, address, changedBy }) {
  const normalizedSafeAddress = normalizeAddress(safeAddress);
  const normalizedBy = normalizeAddress(changedBy);
  const normalizedInput = validateAddressBookInput({ label, address });
  const id = uuidv4();
  const auditId = uuidv4();

  await pool.query('BEGIN');
  try {
    const created = await pool.query(
      `INSERT INTO address_book (id, safe_address, address, label, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, safe_address, address, label, created_at, created_by, updated_at, updated_by`,
      [id, normalizedSafeAddress, normalizedInput.address, normalizedInput.label, normalizedBy, normalizedBy]
    );
    await pool.query(
      `INSERT INTO address_book_audit (id, address_book_id, safe_address, action, new_label, new_address, changed_by)
       VALUES ($1,$2,$3,'create',$4,$5,$6)`,
      [auditId, id, normalizedSafeAddress, normalizedInput.label, normalizedInput.address, normalizedBy]
    );
    await pool.query('COMMIT');
    const txCount = await getEntryTxCount(normalizedSafeAddress, normalizedInput.address);
    return mapAddressBookRow(created.rows[0], { changed_at: created.rows[0].updated_at, changed_by: normalizedBy }, txCount);
  } catch (error) {
    await pool.query('ROLLBACK');
    if (error.code === '23505') {
      const err = new Error('Address already exists in this safe address book');
      err.status = 409;
      throw err;
    }
    throw error;
  }
}

export async function updateAddressBookEntry({ safeAddress, entryId, label, address, changedBy }) {
  const normalizedSafeAddress = normalizeAddress(safeAddress);
  const normalizedBy = normalizeAddress(changedBy);
  const nextInput = validateAddressBookInput({ label, address }, { allowPartial: true });
  if (!Object.keys(nextInput).length) {
    const err = new Error('label or address is required');
    err.status = 400;
    throw err;
  }

  await pool.query('BEGIN');
  try {
    const existing = await pool.query(
      `SELECT id, safe_address, address, label, created_at, created_by, updated_at, updated_by
       FROM address_book
       WHERE id = $1 AND safe_address = $2`,
      [entryId, normalizedSafeAddress]
    );
    if (!existing.rowCount) {
      const err = new Error('Address book entry not found');
      err.status = 404;
      throw err;
    }

    const current = existing.rows[0];
    const updatedLabel = nextInput.label ?? current.label;
    const updatedAddress = nextInput.address ?? current.address;
    const updated = await pool.query(
      `UPDATE address_book
       SET label = $1, address = $2, updated_at = now(), updated_by = $3
       WHERE id = $4
       RETURNING id, safe_address, address, label, created_at, created_by, updated_at, updated_by`,
      [updatedLabel, updatedAddress, normalizedBy, entryId]
    );

    await pool.query(
      `INSERT INTO address_book_audit (id, address_book_id, safe_address, action, old_label, new_label, old_address, new_address, changed_by)
       VALUES ($1,$2,$3,'update',$4,$5,$6,$7,$8)`,
      [uuidv4(), entryId, normalizedSafeAddress, current.label, updatedLabel, current.address, updatedAddress, normalizedBy]
    );
    await pool.query('COMMIT');
    const txCount = await getEntryTxCount(normalizedSafeAddress, updatedAddress);
    return mapAddressBookRow(updated.rows[0], { changed_at: updated.rows[0].updated_at, changed_by: normalizedBy }, txCount);
  } catch (error) {
    await pool.query('ROLLBACK');
    if (error.code === '23505') {
      const err = new Error('Address already exists in this safe address book');
      err.status = 409;
      throw err;
    }
    throw error;
  }
}

export async function deleteAddressBookEntry({ safeAddress, entryId, changedBy }) {
  const normalizedSafeAddress = normalizeAddress(safeAddress);
  const normalizedBy = normalizeAddress(changedBy);

  await pool.query('BEGIN');
  try {
    const existing = await pool.query(
      `SELECT id, safe_address, address, label
       FROM address_book
       WHERE id = $1 AND safe_address = $2`,
      [entryId, normalizedSafeAddress]
    );
    if (!existing.rowCount) {
      const err = new Error('Address book entry not found');
      err.status = 404;
      throw err;
    }
    const current = existing.rows[0];
    await pool.query('DELETE FROM address_book WHERE id = $1', [entryId]);
    await pool.query(
      `INSERT INTO address_book_audit (id, address_book_id, safe_address, action, old_label, old_address, changed_by)
       VALUES ($1,$2,$3,'delete',$4,$5,$6)`,
      [uuidv4(), entryId, normalizedSafeAddress, current.label, current.address, normalizedBy]
    );
    await pool.query('COMMIT');
    return { id: entryId };
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}
