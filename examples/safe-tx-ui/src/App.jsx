import { useEffect, useMemo, useState } from 'react';
import {
  createWalletClient,
  custom,
  encodeFunctionData,
  formatUnits,
  isAddress,
  parseUnits
} from 'viem';
import { API_BASE_URL, prividium } from './prividium';
import { TOKENS_BY_CHAIN_ID } from './config/tokens';

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

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(prividium.getAuthHeaders() || {}),
    ...(options.headers || {})
  };
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
  return res.json();
}

const walletClient = typeof window !== 'undefined' && window.ethereum
  ? createWalletClient({ transport: custom(window.ethereum) })
  : null;

const shorten = (value = '', left = 6, right = 4) => (value.length > 14 ? `${value.slice(0, left)}...${value.slice(-right)}` : value);

const getRoute = () => {
  const match = window.location.pathname.match(/^\/safes\/(0x[a-fA-F0-9]{40})$/);
  return match ? { page: 'safe', safeAddress: match[1] } : { page: 'home' };
};

const getProposalStatus = (proposal, myAddress) => {
  const confirmations = proposal.confirmations || [];
  const my = myAddress?.toLowerCase();
  const confirmationsCount = confirmations.length;
  const required = Number(proposal.confirmationsRequired || 0);
  const isExecuted = Boolean(proposal.executedTxHash);
  const hasMySig = confirmations.some((sig) => {
    const signer = typeof sig === 'string' ? sig : sig.owner || sig.signer;
    return signer?.toLowerCase() === my;
  });
  const isReady = !isExecuted && confirmationsCount >= required;

  if (isExecuted) return { key: 'executed', label: 'Executed' };
  if (isReady) return { key: 'ready', label: 'Ready to execute' };
  if (!hasMySig) return { key: 'needsSig', label: 'Needs your signature' };
  return { key: 'waiting', label: 'Waiting for others' };
};

const statusFilters = [
  { key: 'needsSig', label: 'Needs your signature' },
  { key: 'waiting', label: 'Waiting for others' },
  { key: 'ready', label: 'Ready to execute' },
  { key: 'executed', label: 'Executed' }
];

const getCreateErrors = (owners, threshold) => {
  const trimmed = owners.map((owner) => owner.trim());
  const errors = {};
  if (trimmed.some((owner) => !owner)) errors.owners = 'Please fill in every owner field.';
  if (trimmed.some((owner) => owner && !isAddress(owner))) errors.owners = 'All owners must be valid addresses.';
  const uniq = new Set(trimmed.map((owner) => owner.toLowerCase()));
  if (uniq.size !== trimmed.length) errors.owners = 'Duplicate owner addresses are not allowed.';
  if (threshold < 1 || threshold > trimmed.length) errors.threshold = 'Threshold must fit the owner count.';
  return { errors, trimmed };
};

function Button({ variant = 'primary', className = '', ...props }) {
  return <button className={`btn btn-${variant} ${className}`} {...props} />;
}

function Card({ title, action, children }) {
  return (
    <section className="card">
      {(title || action) && <div className="card-head"><h3>{title}</h3>{action}</div>}
      {children}
    </section>
  );
}

function Tabs({ tabs, value, onChange, compact = false }) {
  return (
    <div className={`tabs ${compact ? 'tabs-compact' : ''}`}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`tab ${value === tab.key ? 'active' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function Badge({ children, tone = 'default' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function Toasts({ items, onDismiss }) {
  return (
    <div className="toast-wrap">
      {items.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type}`}>
          {toast.message}
          <button onClick={() => onDismiss(toast.id)}>×</button>
        </div>
      ))}
    </div>
  );
}

function Skeleton({ lines = 3 }) {
  return <div className="skeleton" style={{ '--lines': lines }} />;
}

export default function App() {
  const [route, setRoute] = useState(getRoute());
  const [mainTab, setMainTab] = useState('safes');
  const [safeTab, setSafeTab] = useState('overview');
  const [proposalFilter, setProposalFilter] = useState('needsSig');
  const [me, setMe] = useState(null);
  const [safes, setSafes] = useState([]);
  const [loadingSafes, setLoadingSafes] = useState(false);
  const [loadingSafe, setLoadingSafe] = useState(false);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [safeDetail, setSafeDetail] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [registerInput, setRegisterInput] = useState('');
  const [toasts, setToasts] = useState([]);

  const [owners, setOwners] = useState(['']);
  const [threshold, setThreshold] = useState(1);
  const [createErrors, setCreateErrors] = useState({});

  const [proposalModalOpen, setProposalModalOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customTo, setCustomTo] = useState('');
  const [customValue, setCustomValue] = useState('0');
  const [customData, setCustomData] = useState('');
  const [customOperation, setCustomOperation] = useState('0');
  const [proposalError, setProposalError] = useState('');

  const isAuthed = useMemo(() => prividium.isAuthorized(), [me]);
  const myAddress = me?.address?.toLowerCase();
  const chainTokens = TOKENS_BY_CHAIN_ID[prividium.chain.id] || [];

  const addToast = (message, type = 'success') => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, message, type }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 3500);
  };

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setRoute(getRoute());
  };

  const refresh = async () => {
    if (!prividium.isAuthorized()) return;
    setLoadingSafes(true);
    try {
      const [meData, safeData] = await Promise.all([api('/v1/me'), api('/v1/safes')]);
      setMe(meData);
      setSafes(safeData.results || []);
    } finally {
      setLoadingSafes(false);
    }
  };

  const loadSafeData = async (safeAddress) => {
    if (!safeAddress) return;
    setLoadingSafe(true);
    setLoadingProposals(true);
    try {
      const [safe, txs] = await Promise.all([
        api(`/v1/safes/${safeAddress}`),
        api(`/v1/safes/${safeAddress}/transactions`)
      ]);
      setSafeDetail(safe.safe);
      setProposals(txs.results || []);
    } finally {
      setLoadingSafe(false);
      setLoadingProposals(false);
    }
  };

  useEffect(() => {
    refresh().catch((e) => addToast(e.message, 'error'));
    const onPop = () => setRoute(getRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (me?.address) {
      setOwners((current) => {
        if (current[0] === me.address) return current;
        const next = [...current];
        next[0] = me.address;
        return next;
      });
    }
  }, [me?.address]);

  useEffect(() => {
    if (route.page === 'safe' && route.safeAddress) {
      setMainTab('safes');
      loadSafeData(route.safeAddress).catch((e) => addToast(e.message, 'error'));
    } else {
      setSafeDetail(null);
      setProposals([]);
    }
  }, [route.page, route.safeAddress]);

  useEffect(() => {
    if (chainTokens.length && !selectedToken) {
      setSelectedToken(chainTokens[0].symbol);
    }
  }, [chainTokens, selectedToken]);

  useEffect(() => {
    setCreateErrors(getCreateErrors(owners, threshold).errors);
  }, [owners, threshold]);

  const login = async () => {
    await prividium.authorize({ scopes: ['wallet:required', 'network:required'] });
    await prividium.addNetworkToWallet();
    await refresh();
  };

  const validateCreate = () => {
    const { errors, trimmed } = getCreateErrors(owners, threshold);
    setCreateErrors(errors);
    return { valid: Object.keys(errors).length === 0, owners: trimmed };
  };

  const createSafe = async () => {
    const result = validateCreate();
    if (!result.valid) return;
    const payload = { owners: result.owners, threshold: Number(threshold) };
    const created = await api('/v1/safes', { method: 'POST', body: JSON.stringify(payload) });
    await refresh();
    addToast('Safe created');
    const safeAddress = created.safeAddress || created.safe_address || created.safe?.safeAddress;
    if (safeAddress) {
      navigate(`/safes/${safeAddress}`);
    } else {
      setMainTab('safes');
    }
  };

  const registerSafe = async () => {
    if (!isAddress(registerInput)) {
      addToast('Please enter a valid Safe address', 'error');
      return;
    }
    await api(`/v1/safes/${registerInput}/register`, { method: 'POST' });
    addToast('Safe registered from chain');
    await refresh();
    navigate(`/safes/${registerInput}`);
  };

  const selectedTokenConfig = chainTokens.find((token) => token.symbol === selectedToken);

  const proposalPreview = useMemo(() => {
    if (!selectedTokenConfig || !recipient || !amount) return 'Fill in token, recipient, and amount.';
    return `Send ${amount} ${selectedTokenConfig.symbol} to ${shorten(recipient)}`;
  }, [selectedTokenConfig, recipient, amount]);

  const buildProposalTx = () => {
    if (!selectedTokenConfig) throw new Error('Please select a token');
    if (!isAddress(recipient)) throw new Error('Recipient must be a valid address');
    if (!amount || Number(amount) <= 0) throw new Error('Amount must be greater than 0');

    const parsedAmount = parseUnits(amount, selectedTokenConfig.decimals);
    const data = encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: 'transfer',
      args: [recipient, parsedAmount]
    });

    let tx = {
      to: selectedTokenConfig.address,
      value: '0',
      data,
      operation: 0
    };

    if (advancedOpen) {
      tx = {
        to: customTo || tx.to,
        value: customValue || tx.value,
        data: customData || tx.data,
        operation: Number(customOperation || tx.operation)
      };
    }

    if (!isAddress(tx.to)) throw new Error('Transaction target must be a valid address');
    if (!/^0x([0-9a-fA-F]{2})*$/.test(tx.data || '')) throw new Error('Transaction data must be valid hex');

    return tx;
  };

  const propose = async () => {
    setProposalError('');
    const tx = buildProposalTx();
    await api(`/v1/safes/${route.safeAddress}/transactions`, {
      method: 'POST',
      body: JSON.stringify({ tx })
    });
    addToast('Proposal created');
    setProposalModalOpen(false);
    setAmount('');
    setRecipient('');
    const txs = await api(`/v1/safes/${route.safeAddress}/transactions`);
    setProposals(txs.results || []);
  };

  const confirm = async (proposal) => {
    if (!walletClient) throw new Error('No injected wallet found');
    const [address] = await walletClient.getAddresses();
    const typedData = await api(`/v1/transactions/${proposal.safeTxHash}/typed-data`);
    const typedMessage = {
      ...typedData.message,
      value: BigInt(typedData.message.value),
      safeTxGas: BigInt(typedData.message.safeTxGas),
      baseGas: BigInt(typedData.message.baseGas),
      gasPrice: BigInt(typedData.message.gasPrice),
      nonce: BigInt(typedData.message.nonce)
    };

    const signature = await walletClient.signTypedData({
      account: address,
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedMessage
    });

    await api(`/v1/transactions/${proposal.safeTxHash}/confirmations`, {
      method: 'POST',
      body: JSON.stringify({ signature })
    });
    addToast('Signed');
    const txs = await api(`/v1/safes/${route.safeAddress}/transactions`);
    setProposals(txs.results || []);
  };

  const execute = async (proposal) => {
    await api(`/v1/transactions/${proposal.safeTxHash}/execute`, { method: 'POST' });
    addToast('Executed');
    const txs = await api(`/v1/safes/${route.safeAddress}/transactions`);
    setProposals(txs.results || []);
  };

  const categorized = useMemo(() => proposals.map((proposal) => ({
    proposal,
    status: getProposalStatus(proposal, me?.address)
  })), [proposals, me?.address]);

  const filteredProposals = categorized.filter((item) => item.status.key === proposalFilter);

  const onCopy = async (value) => {
    await navigator.clipboard.writeText(value);
    addToast('Copied to clipboard');
  };

  const summaryFromProposal = (proposal) => {
    const toAddress = proposal.to || proposal.tx?.to || '';
    const data = proposal.data || proposal.tx?.data || '';
    const token = chainTokens.find((tk) => tk.address.toLowerCase() === toAddress.toLowerCase());
    if (token && data.startsWith('0xa9059cbb')) {
      try {
        const rawAmount = BigInt(`0x${data.slice(74, 138)}`);
        return `Transfer ${formatUnits(rawAmount, token.decimals)} ${token.symbol}`;
      } catch {
        return 'Token transfer';
      }
    }
    return `To ${shorten(toAddress)}`;
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="logo">🔐 Safe Tx UI</p>
          <h1>Prividium Safe Console</h1>
        </div>
        <div className="wallet-pill">
          {isAuthed ? <><span>Connected:</span> <strong>{shorten(me?.address || '')}</strong></> : 'Not connected'}
          {isAuthed ? null : <Button onClick={login}>Login with Prividium</Button>}
        </div>
      </header>

      {isAuthed && (
        <>
          {route.page === 'home' && (
            <>
              <Tabs value={mainTab} onChange={setMainTab} tabs={[{ key: 'safes', label: 'Safes' }, { key: 'create', label: 'Create Safe' }]} />

              {mainTab === 'safes' && (
                <div className="grid two-col">
                  <Card title="Your Safes">
                    {loadingSafes ? <Skeleton lines={4} /> : safes.length === 0 ? <p className="muted">No safes yet. Create one to get started.</p> : (
                      <div className="stack">
                        {safes.map((safe) => (
                          <button key={safe.safe_address} className="safe-row" onClick={() => navigate(`/safes/${safe.safe_address}`)}>
                            <span>{shorten(safe.safe_address)}</span>
                            <span>Open →</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </Card>

                  <Card title="Register Existing Safe">
                    <input value={registerInput} onChange={(e) => setRegisterInput(e.target.value)} placeholder="0x..." />
                    <Button onClick={() => registerSafe().catch((e) => addToast(e.message, 'error'))}>Register</Button>
                  </Card>
                </div>
              )}

              {mainTab === 'create' && (
                <Card title="Create Safe">
                  <div className="stack">
                    {owners.map((owner, index) => (
                      <div className="owner-row" key={`${index}-${owner}`}>
                        <input
                          value={owner}
                          onChange={(e) => setOwners((current) => current.map((v, i) => (i === index ? e.target.value : v)))}
                          placeholder={`Owner ${index + 1} address`}
                          readOnly={index === 0 && Boolean(me?.address)}
                        />
                        {index > 0 && <button className="icon-btn" onClick={() => setOwners((current) => current.filter((_, i) => i !== index))}>×</button>}
                      </div>
                    ))}
                    <button className="icon-btn add" onClick={() => setOwners((current) => [...current, ''])}>+</button>
                  </div>
                  {createErrors.owners && <p className="error">{createErrors.owners}</p>}

                  <div>
                    <label>Threshold: <strong>{threshold} of {owners.length} required</strong></label>
                    <input type="range" min="1" max={Math.max(1, owners.length)} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
                  </div>
                  {createErrors.threshold && <p className="error">{createErrors.threshold}</p>}

                  <div className="summary-box">
                    <p><strong>Summary</strong></p>
                    <p>{owners.length} owner(s) • {threshold} signatures required</p>
                  </div>
                  <Button onClick={() => createSafe().catch((e) => addToast(e.message, 'error'))}>Create Safe</Button>
                </Card>
              )}
            </>
          )}

          {route.page === 'safe' && (
            <>
              <div className="breadcrumb">
                <button onClick={() => navigate('/')}>Safes</button>
                <span>/</span>
                <strong>{shorten(route.safeAddress)}</strong>
              </div>

              <Tabs
                value={safeTab}
                onChange={setSafeTab}
                tabs={[{ key: 'overview', label: 'Overview' }, { key: 'proposals', label: 'Proposals' }, { key: 'owners', label: 'Owners' }]}
              />

              {safeTab === 'overview' && (
                <Card title="Safe Overview">
                  {loadingSafe ? <Skeleton lines={4} /> : safeDetail ? (
                    <div className="overview-grid">
                      <div><span className="muted">Address</span><p>{safeDetail.safeAddress}</p></div>
                      <div><span className="muted">Threshold</span><p>{safeDetail.threshold}/{safeDetail.owners?.length}</p></div>
                      <div><span className="muted">Nonce</span><p>{safeDetail.nonce}</p></div>
                      <div><span className="muted">Owners</span><p>{safeDetail.owners?.length}</p></div>
                    </div>
                  ) : <p className="muted">Safe not found.</p>}
                </Card>
              )}

              {safeTab === 'owners' && (
                <Card title="Owners" action={<Badge tone="info">{safeDetail?.threshold}/{safeDetail?.owners?.length} required</Badge>}>
                  {(safeDetail?.owners || []).map((owner) => (
                    <div key={owner} className="owner-line">
                      <span className="ellipsis">{owner}</span>
                      <div className="inline">
                        {owner.toLowerCase() === myAddress && <Badge tone="success">You</Badge>}
                        <button className="icon-btn" onClick={() => onCopy(owner).catch(() => addToast('Copy failed', 'error'))}>Copy</button>
                      </div>
                    </div>
                  ))}
                </Card>
              )}

              {safeTab === 'proposals' && (
                <Card title="Proposals" action={<Button onClick={() => setProposalModalOpen(true)}>New Proposal</Button>}>
                  <Tabs compact value={proposalFilter} onChange={setProposalFilter} tabs={statusFilters} />

                  {loadingProposals ? <Skeleton lines={5} /> : filteredProposals.length === 0 ? <p className="muted">No proposals in this category.</p> : (
                    <div className="stack">
                      {filteredProposals.map(({ proposal, status }) => {
                        const isNeedsSig = status.key === 'needsSig';
                        const isReady = status.key === 'ready';
                        return (
                          <div className="proposal-card" key={proposal.id || proposal.safeTxHash}>
                            <div className="proposal-head">
                              <Badge tone={status.key === 'executed' ? 'default' : status.key === 'ready' ? 'success' : status.key === 'needsSig' ? 'warning' : 'info'}>{status.label}</Badge>
                              <span className="muted">{proposal.confirmations?.length || 0}/{proposal.confirmationsRequired} confirmations</span>
                            </div>
                            <p>{summaryFromProposal(proposal)}</p>
                            <p className="ellipsis muted">{proposal.safeTxHash}</p>
                            <div className="inline">
                              {isNeedsSig && <Button variant="secondary" onClick={() => confirm(proposal).catch((e) => addToast(e.message, 'error'))}>Sign</Button>}
                              {isReady && <Button onClick={() => execute(proposal).catch((e) => addToast(e.message, 'error'))}>Execute</Button>}
                              {status.key === 'executed' && proposal.executedTxHash && (
                                <button className="icon-btn" onClick={() => onCopy(proposal.executedTxHash).catch(() => addToast('Copy failed', 'error'))}>
                                  Tx {shorten(proposal.executedTxHash)}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              )}
            </>
          )}
        </>
      )}

      {proposalModalOpen && (
        <div className="modal-backdrop" onClick={() => setProposalModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>New ERC-20 Transfer Proposal</h3>
            <label>Token</label>
            <select value={selectedToken} onChange={(e) => setSelectedToken(e.target.value)}>
              {chainTokens.map((token) => (
                <option value={token.symbol} key={token.symbol}>{token.symbol} · {token.name}</option>
              ))}
            </select>
            <label>Recipient</label>
            <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x..." />
            <label>Amount</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" />

            <button className="link" onClick={() => setAdvancedOpen((v) => !v)}>Advanced {advancedOpen ? '▲' : '▼'}</button>
            {advancedOpen && (
              <div className="stack">
                <input value={customTo} onChange={(e) => setCustomTo(e.target.value)} placeholder="custom to" />
                <input value={customValue} onChange={(e) => setCustomValue(e.target.value)} placeholder="value (wei)" />
                <input value={customData} onChange={(e) => setCustomData(e.target.value)} placeholder="data hex" />
                <input value={customOperation} onChange={(e) => setCustomOperation(e.target.value)} placeholder="operation" />
              </div>
            )}

            <div className="summary-box"><strong>Preview:</strong> {proposalPreview}</div>
            {proposalError && <p className="error">{proposalError}</p>}

            <div className="inline">
              <Button variant="secondary" onClick={() => setProposalModalOpen(false)}>Cancel</Button>
              <Button onClick={() => propose().catch((e) => setProposalError(e.message))}>Create proposal</Button>
            </div>
          </div>
        </div>
      )}

      <Toasts items={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
    </div>
  );
}
