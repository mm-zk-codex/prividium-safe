import { useEffect, useMemo, useState } from 'react';
import {
  createWalletClient,
  custom,
  isAddress,
  parseUnits
} from 'viem';
import { API_BASE_URL, prividium } from './prividium';

const PROPOSAL_MODES = [
  { key: 'erc20', label: 'ERC-20 Transfer' },
  { key: 'native', label: 'Base Token Transfer' },
  { key: 'custom', label: 'Custom Call' }
];

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

const formatTokenAmount = (raw, decimals, max = 6) => {
  const value = Number(raw || 0) / 10 ** Number(decimals || 0);
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString(undefined, { maximumFractionDigits: max });
};

const formatTimestamp = (iso) => {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString();
};

const getRoute = () => {
  const match = window.location.pathname.match(/^\/safes\/(0x[a-fA-F0-9]{40})$/);
  return match ? { page: 'safe', safeAddress: match[1] } : { page: 'home' };
};

const getProposalTx = (proposal) => ({
  to: proposal.to || proposal.tx?.to || '',
  value: proposal.value || proposal.tx?.value || '0',
  data: proposal.data || proposal.tx?.data || '0x',
  operation: proposal.operation ?? proposal.tx?.operation ?? 0
});

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
  { key: 'all', label: 'All' },
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
  const [proposalFilter, setProposalFilter] = useState('all');
  const [me, setMe] = useState(null);
  const [safes, setSafes] = useState([]);
  const [loadingSafes, setLoadingSafes] = useState(false);
  const [loadingSafe, setLoadingSafe] = useState(false);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [safeDetail, setSafeDetail] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [balances, setBalances] = useState(null);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [addressBook, setAddressBook] = useState([]);
  const [loadingAddressBook, setLoadingAddressBook] = useState(false);
  const [addressBookLabel, setAddressBookLabel] = useState('');
  const [addressBookAddress, setAddressBookAddress] = useState('');
  const [editingEntryId, setEditingEntryId] = useState('');
  const [registerInput, setRegisterInput] = useState('');
  const [toasts, setToasts] = useState([]);

  const [owners, setOwners] = useState(['']);
  const [threshold, setThreshold] = useState(1);
  const [createErrors, setCreateErrors] = useState({});

  const [proposalModalOpen, setProposalModalOpen] = useState(false);
  const [proposalMode, setProposalMode] = useState('erc20');
  const [selectedToken, setSelectedToken] = useState('');
  const [selectedAddressBookEntryId, setSelectedAddressBookEntryId] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [nativeRecipient, setNativeRecipient] = useState('');
  const [nativeAmount, setNativeAmount] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customTo, setCustomTo] = useState('');
  const [customValue, setCustomValue] = useState('0');
  const [customData, setCustomData] = useState('0x');
  const [customOperation, setCustomOperation] = useState('0');
  const [proposalError, setProposalError] = useState('');

  const isAuthed = useMemo(() => prividium.isAuthorized(), [me]);
  const myAddress = me?.address?.toLowerCase();

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
      const [meData, safeData, tokenData] = await Promise.all([api('/v1/me'), api('/v1/safes'), api('/v1/tokens')]);
      setMe(meData);
      setSafes(safeData.results || []);
      setTokens(tokenData.tokens || []);
    } finally {
      setLoadingSafes(false);
    }
  };

  const loadSafeBalances = async (safeAddress) => {
    setLoadingBalances(true);
    try {
      const data = await api(`/v1/safes/${safeAddress}/balances`);
      setBalances(data);
    } finally {
      setLoadingBalances(false);
    }
  };

  const loadAddressBook = async (safeAddress) => {
    setLoadingAddressBook(true);
    try {
      const data = await api(`/v1/safes/${safeAddress}/address-book`);
      setAddressBook(data.entries || []);
    } finally {
      setLoadingAddressBook(false);
    }
  };

  const loadSafeData = async (safeAddress) => {
    if (!safeAddress) return;
    setLoadingSafe(true);
    setLoadingProposals(true);
    setLoadingBalances(true);
    setLoadingAddressBook(true);
    try {
      const [safe, txs, balanceData, addressBookData] = await Promise.all([
        api(`/v1/safes/${safeAddress}`),
        api(`/v1/safes/${safeAddress}/transactions`),
        api(`/v1/safes/${safeAddress}/balances`),
        api(`/v1/safes/${safeAddress}/address-book`)
      ]);
      setSafeDetail(safe.safe);
      setProposals(txs.results || []);
      setBalances(balanceData);
      setAddressBook(addressBookData.entries || []);
    } finally {
      setLoadingSafe(false);
      setLoadingProposals(false);
      setLoadingBalances(false);
      setLoadingAddressBook(false);
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
      setBalances(null);
      setAddressBook([]);
    }
  }, [route.page, route.safeAddress]);

  useEffect(() => {
    if (tokens.length && !selectedToken) {
      setSelectedToken(tokens[0].address);
    }
  }, [tokens, selectedToken]);

  useEffect(() => {
    if (!selectedAddressBookEntryId) return;
    const selected = addressBook.find((entry) => entry.id === selectedAddressBookEntryId);
    if (selected) {
      setRecipient(selected.address);
    }
  }, [selectedAddressBookEntryId, addressBook]);

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

  const selectedTokenConfig = tokens.find((token) => token.address === selectedToken);

  const proposalPreview = useMemo(() => {
    if (proposalMode === 'erc20') {
      if (!selectedTokenConfig || !recipient || !amount) return 'Fill in token, recipient, and amount.';
      return `Send ${amount} ${selectedTokenConfig.symbol} to ${recipient}`;
    }
    if (proposalMode === 'native') {
      if (!nativeRecipient || !nativeAmount) return 'Fill in recipient and base token amount.';
      return `Send ${nativeAmount} ${prividium.chain.nativeCurrency.symbol} to ${nativeRecipient}`;
    }
    if (!customTo) return 'Fill in target address and optional calldata.';
    return `Call ${customTo} (${customData || '0x'})`;
  }, [proposalMode, selectedTokenConfig, recipient, amount, nativeRecipient, nativeAmount, customTo, customData]);

  const buildProposalTx = () => {
    if (proposalMode === 'erc20') {
      if (!selectedTokenConfig) throw new Error('Please select a token');
      if (!isAddress(recipient)) throw new Error('Recipient must be a valid address');
      if (!amount || Number(amount) <= 0) throw new Error('Amount must be greater than 0');

      let tx = {
        mode: 'erc20',
        advanced: false,
        erc20: {
          tokenAddress: selectedTokenConfig.address,
          recipient,
          amount
        }
      };

      if (advancedOpen) {
        tx = {
          ...tx,
          advanced: true,
          tx: {
            to: customTo,
            value: customValue || '0',
            data: customData || '0x',
            operation: Number(customOperation || 0)
          }
        };
      }

      if (advancedOpen && !isAddress(tx.tx.to)) throw new Error('Transaction target must be a valid address');
      if (advancedOpen && !/^0x([0-9a-fA-F]{2})*$/.test(tx.tx.data || '')) throw new Error('Transaction data must be valid hex');
      return tx;
    }

    if (proposalMode === 'native') {
      if (!isAddress(nativeRecipient)) throw new Error('Recipient must be a valid address');
      if (!nativeAmount || Number(nativeAmount) <= 0) throw new Error('Amount must be greater than 0');
      return {
        mode: 'direct',
        advanced: false,
        tx: {
          to: nativeRecipient,
          value: parseUnits(nativeAmount, prividium.chain.nativeCurrency.decimals).toString(),
          data: '0x',
          operation: 0
        }
      };
    }

    if (!isAddress(customTo)) throw new Error('Target must be a valid address');
    if (!/^0x([0-9a-fA-F]{2})*$/.test(customData || '')) throw new Error('Calldata must be valid hex');
    return {
      mode: 'direct',
      advanced: true,
      tx: {
        to: customTo,
        value: customValue || '0',
        data: customData || '0x',
        operation: Number(customOperation || 0)
      }
    };
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
    setSelectedAddressBookEntryId('');
    setNativeAmount('');
    setNativeRecipient('');
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
    await loadAddressBook(route.safeAddress);
  };

  const saveAddressBookEntry = async () => {
    if (!addressBookLabel.trim()) throw new Error('Label is required');
    if (!isAddress(addressBookAddress)) throw new Error('Address must be a valid 0x address');

    if (editingEntryId) {
      await api(`/v1/safes/${route.safeAddress}/address-book/${editingEntryId}`, {
        method: 'PUT',
        body: JSON.stringify({ label: addressBookLabel, address: addressBookAddress })
      });
      addToast('Address book entry updated');
    } else {
      await api(`/v1/safes/${route.safeAddress}/address-book`, {
        method: 'POST',
        body: JSON.stringify({ label: addressBookLabel, address: addressBookAddress })
      });
      addToast('Address book entry created');
    }
    setAddressBookLabel('');
    setAddressBookAddress('');
    setEditingEntryId('');
    await loadAddressBook(route.safeAddress);
  };

  const beginEditAddressBookEntry = (entry) => {
    setEditingEntryId(entry.id);
    setAddressBookLabel(entry.label);
    setAddressBookAddress(entry.address);
  };

  const removeAddressBookEntry = async (entryId) => {
    await api(`/v1/safes/${route.safeAddress}/address-book/${entryId}`, { method: 'DELETE' });
    addToast('Address book entry deleted');
    await loadAddressBook(route.safeAddress);
  };

  const openProposalWithToken = (tokenAddress) => {
    setProposalMode('erc20');
    setSelectedToken(tokenAddress);
    setProposalModalOpen(true);
  };

  const addressBookByAddress = useMemo(() => new Map(addressBook.map((entry) => [entry.address.toLowerCase(), entry])), [addressBook]);

  const categorized = useMemo(() => proposals.map((proposal) => ({
    proposal,
    status: getProposalStatus(proposal, me?.address)
  })), [proposals, me?.address]);

  const filteredProposals = categorized.filter((item) => proposalFilter === 'all' || item.status.key === proposalFilter);

  const onCopy = async (value) => {
    await navigator.clipboard.writeText(value);
    addToast('Copied to clipboard');
  };

  const summaryFromProposal = (proposal) => {
    const tx = getProposalTx(proposal);
    const toEntry = addressBookByAddress.get((tx.to || '').toLowerCase());
    if (proposal.summary?.type === 'erc20-transfer') {
      return `Transfer ${proposal.summary.amount} ${proposal.summary.tokenSymbol} to ${proposal.summary.recipient}`;
    }
    if (proposal.summary?.type === 'advanced') {
      return 'Custom calldata';
    }

    if (tx.data === '0x') {
      return `Transfer ${tx.value || '0'} ${prividium.chain.nativeCurrency.symbol}${toEntry ? ` to ${toEntry.label}` : ''}`;
    }
    return `Contract call (operation ${tx.operation})`;
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
                tabs={[{ key: 'overview', label: 'Overview' }, { key: 'proposals', label: 'Proposals' }, { key: 'address-book', label: 'Address Book' }, { key: 'owners', label: 'Owners' }]}
              />

              {safeTab === 'overview' && (
                <div className="stack">
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

                  <Card
                    title="Balances"
                    action={<Button variant="secondary" onClick={() => loadSafeBalances(route.safeAddress).catch((e) => addToast(e.message, 'error'))}>Refresh</Button>}
                  >
                    {loadingBalances ? <Skeleton lines={4} /> : !balances ? <p className="muted">No balance data yet.</p> : (
                      <div className="stack">
                        <div className="balance-row">
                          <strong>{balances.native.symbol}</strong>
                          <span>{formatTokenAmount(balances.native.balance, balances.native.decimals)} {balances.native.symbol}</span>
                        </div>
                        {(balances.erc20 || []).map((token) => (
                          <div key={token.address} className="balance-row">
                            <div>
                              <strong>{token.symbol}</strong>
                              <p className="muted token-meta">{token.name}</p>
                            </div>
                            <div className="inline">
                              <span>{formatTokenAmount(token.balance, token.decimals)} {token.symbol}</span>
                              <Button variant="secondary" onClick={() => openProposalWithToken(token.address)}>Send</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>
              )}

              {safeTab === 'address-book' && (
                <Card title="Address Book">
                  <p className="muted">Only Safe owners can edit address book entries.</p>
                  <p className="muted">We display when an entry was last changed and how often the Safe has sent transactions to it.</p>

                  <div className="grid two-col">
                    <div className="stack">
                      <label>Label</label>
                      <input value={addressBookLabel} onChange={(e) => setAddressBookLabel(e.target.value)} placeholder="Treasury" />
                    </div>
                    <div className="stack">
                      <label>Address</label>
                      <input value={addressBookAddress} onChange={(e) => setAddressBookAddress(e.target.value)} placeholder="0x..." />
                    </div>
                  </div>

                  <div className="inline">
                    <Button onClick={() => saveAddressBookEntry().catch((e) => addToast(e.message, 'error'))}>{editingEntryId ? 'Update entry' : 'Add entry'}</Button>
                    {editingEntryId && <Button variant="secondary" onClick={() => { setEditingEntryId(''); setAddressBookLabel(''); setAddressBookAddress(''); }}>Cancel edit</Button>}
                    <Button variant="secondary" onClick={() => loadAddressBook(route.safeAddress).catch((e) => addToast(e.message, 'error'))}>Refresh</Button>
                  </div>

                  {loadingAddressBook ? <Skeleton lines={4} /> : addressBook.length === 0 ? <p className="muted">No entries yet.</p> : (
                    <div className="stack">
                      {addressBook.map((entry) => (
                        <div key={entry.id} className="proposal-card">
                          <div className="proposal-head">
                            <strong>{entry.label}</strong>
                            <span className="muted">Sent {entry.txCount} txs</span>
                          </div>
                          <div className="inline">
                            <span className="hash-full">{entry.address}</span>
                            <button className="icon-btn" onClick={() => onCopy(entry.address).catch(() => addToast('Copy failed', 'error'))}>Copy</button>
                          </div>
                          <p className="muted">Last changed: {formatTimestamp(entry.lastChangedAt)} by {shorten(entry.lastChangedBy)}</p>
                          <div className="inline">
                            <Button variant="secondary" onClick={() => beginEditAddressBookEntry(entry)}>Edit</Button>
                            <Button variant="secondary" onClick={() => removeAddressBookEntry(entry.id).catch((e) => addToast(e.message, 'error'))}>Delete</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
                        const tx = getProposalTx(proposal);
                        const isNeedsSig = status.key === 'needsSig';
                        const isReady = status.key === 'ready';
                        return (
                          <div className="proposal-card" key={proposal.id || proposal.safeTxHash}>
                            <div className="proposal-head">
                              <Badge tone={status.key === 'executed' ? 'default' : status.key === 'ready' ? 'success' : status.key === 'needsSig' ? 'warning' : 'info'}>{status.label}</Badge>
                              {proposal.isAdvanced && <Badge tone="warning">Custom calldata</Badge>}
                              <span className="muted">{proposal.confirmations?.length || 0}/{proposal.confirmationsRequired} confirmations</span>
                            </div>
                            <p>{summaryFromProposal(proposal)}</p>
                            <p className="to-line"><span className="muted">To:</span> <span className="hash-full">{addressBookByAddress.get((tx.to || '').toLowerCase()) ? `${addressBookByAddress.get((tx.to || '').toLowerCase()).label} (${shorten(tx.to)})` : tx.to}</span></p>
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
            <h3>New Proposal</h3>
            <Tabs compact value={proposalMode} onChange={setProposalMode} tabs={PROPOSAL_MODES} />

            {proposalMode === 'erc20' && (
              <>
                <label>Token</label>
                <select value={selectedToken} onChange={(e) => setSelectedToken(e.target.value)}>
                  {tokens.map((token) => (
                    <option value={token.address} key={token.address} title={token.address}>{token.symbol} · {token.name}</option>
                  ))}
                </select>
                <label>Recipient</label>
                <select value={selectedAddressBookEntryId} onChange={(e) => {
                  setSelectedAddressBookEntryId(e.target.value);
                  if (!e.target.value) setRecipient('');
                }}>
                  <option value="">Enter raw address</option>
                  {addressBook.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.label} · {shorten(entry.address)}</option>
                  ))}
                </select>
                <input
                  value={recipient}
                  onChange={(e) => {
                    setSelectedAddressBookEntryId('');
                    setRecipient(e.target.value);
                  }}
                  placeholder="0x..."
                />
                {selectedAddressBookEntryId && <p className="muted">Using address book recipient: {addressBook.find((entry) => entry.id === selectedAddressBookEntryId)?.label}</p>}
                <label>Amount {selectedTokenConfig ? `(${selectedTokenConfig.decimals} decimals)` : ''}</label>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={selectedTokenConfig ? `0.${'0'.repeat(Math.min(selectedTokenConfig.decimals, 6))}` : '0.0'} />

                <button className="link" onClick={() => setAdvancedOpen((v) => !v)}>Advanced {advancedOpen ? '▲' : '▼'}</button>
                {advancedOpen && (
                  <div className="stack">
                    <input value={customTo} onChange={(e) => setCustomTo(e.target.value)} placeholder="custom to" />
                    <input value={customValue} onChange={(e) => setCustomValue(e.target.value)} placeholder="value (wei)" />
                    <input value={customData} onChange={(e) => setCustomData(e.target.value)} placeholder="data hex" />
                    <input value={customOperation} onChange={(e) => setCustomOperation(e.target.value)} placeholder="operation" />
                  </div>
                )}
              </>
            )}

            {proposalMode === 'native' && (
              <>
                <label>Recipient</label>
                <input value={nativeRecipient} onChange={(e) => setNativeRecipient(e.target.value)} placeholder="0x..." />
                <label>Amount ({prividium.chain.nativeCurrency.symbol})</label>
                <input value={nativeAmount} onChange={(e) => setNativeAmount(e.target.value)} placeholder="0.0" />
              </>
            )}

            {proposalMode === 'custom' && (
              <div className="stack">
                <label>Target</label>
                <input value={customTo} onChange={(e) => setCustomTo(e.target.value)} placeholder="0x..." />
                <label>Value (wei)</label>
                <input value={customValue} onChange={(e) => setCustomValue(e.target.value)} placeholder="0" />
                <label>Data (hex)</label>
                <input value={customData} onChange={(e) => setCustomData(e.target.value)} placeholder="0x" />
                <label>Operation</label>
                <input value={customOperation} onChange={(e) => setCustomOperation(e.target.value)} placeholder="0" />
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
