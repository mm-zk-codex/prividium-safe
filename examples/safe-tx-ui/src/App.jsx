import { useEffect, useMemo, useState } from 'react';
import { createWalletClient, custom } from 'viem';
import { API_BASE_URL, prividium } from './prividium';

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

export default function App() {
  const [me, setMe] = useState(null);
  const [safes, setSafes] = useState([]);
  const [selectedSafe, setSelectedSafe] = useState('');
  const [safeDetail, setSafeDetail] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [ownersInput, setOwnersInput] = useState('');
  const [thresholdInput, setThresholdInput] = useState('2');
  const [registerInput, setRegisterInput] = useState('');
  const [txTo, setTxTo] = useState('');
  const [txData, setTxData] = useState('0x');
  const [txValue, setTxValue] = useState('0');
  const [status, setStatus] = useState('');

  const isAuthed = useMemo(() => prividium.isAuthorized(), [me]);

  const refresh = async () => {
    if (!prividium.isAuthorized()) return;
    const meData = await api('/v1/me');
    const safeData = await api('/v1/safes');
    setMe(meData);
    setSafes(safeData.results || []);
  };

  useEffect(() => {
    refresh().catch(() => { });
  }, []);

  useEffect(() => {
    if (!selectedSafe) return;
    (async () => {
      const [safe, txs] = await Promise.all([
        api(`/v1/safes/${selectedSafe}`),
        api(`/v1/safes/${selectedSafe}/transactions`)
      ]);
      setSafeDetail(safe.safe);
      setProposals(txs.results || []);
    })().catch((e) => setStatus(e.message));
  }, [selectedSafe]);

  const login = async () => {
    await prividium.authorize({ scopes: ['wallet:required', 'network:required'] });
    await prividium.addNetworkToWallet();
    await refresh();
  };

  const createSafe = async () => {
    const owners = ownersInput.split(',').map((s) => s.trim()).filter(Boolean);
    await api('/v1/safes', {
      method: 'POST',
      body: JSON.stringify({ owners, threshold: Number(thresholdInput) })
    });
    setStatus('Safe created');
    await refresh();
  };

  const registerSafe = async () => {
    await api(`/v1/safes/${registerInput}/register`, { method: 'POST' });
    setStatus('Safe registered from chain');
    await refresh();
  };

  const propose = async () => {
    await api(`/v1/safes/${selectedSafe}/transactions`, {
      method: 'POST',
      body: JSON.stringify({ tx: { to: txTo, value: txValue, data: txData, operation: 0 } })
    });
    setStatus('Transaction proposed');
    const txs = await api(`/v1/safes/${selectedSafe}/transactions`);
    setProposals(txs.results || []);
  };

  const confirm = async (proposal) => {
    if (!walletClient) throw new Error('No injected wallet found');
    const [address] = await walletClient.getAddresses();
    const signature = await walletClient.signMessage({ account: address, message: { raw: proposal.safeTxHash } });
    await api(`/v1/transactions/${proposal.safeTxHash}/confirmations`, {
      method: 'POST',
      body: JSON.stringify({ signature })
    });
    setStatus('Confirmation stored');
    const txs = await api(`/v1/safes/${selectedSafe}/transactions`);
    setProposals(txs.results || []);
  };

  const execute = async (proposal) => {
    await api(`/v1/transactions/${proposal.safeTxHash}/execute`, { method: 'POST' });
    setStatus('Executed');
    const txs = await api(`/v1/safes/${selectedSafe}/transactions`);
    setProposals(txs.results || []);
  };

  return (
    <div className="app">
      <h1>Safe-style Tx Flow + Prividium Login</h1>
      <p className="explain">On-chain: Safe state + execution. Backend DB: proposals/signatures. Backend has sequencer access for optional sync. UI only talks to backend API.</p>
      <div className="card">
        <strong>Auth:</strong> {isAuthed ? `Logged in as ${me?.address}` : 'Not logged in'}
        {!isAuthed && <button onClick={login}>Login with Prividium</button>}
      </div>

      {isAuthed && (
        <>
          <div className="card">
            <h2>Your Safes</h2>
            {safes.map((s) => (
              <button key={s.safe_address} onClick={() => setSelectedSafe(s.safe_address)}>{s.safe_address}</button>
            ))}
          </div>

          <div className="card">
            <h3>Create Safe</h3>
            <input value={ownersInput} onChange={(e) => setOwnersInput(e.target.value)} placeholder="owners comma-separated" />
            <input value={thresholdInput} onChange={(e) => setThresholdInput(e.target.value)} placeholder="threshold" />
            <button onClick={createSafe}>Create</button>
          </div>

          <div className="card">
            <h3>Register Existing Safe</h3>
            <input value={registerInput} onChange={(e) => setRegisterInput(e.target.value)} placeholder="safe address" />
            <button onClick={registerSafe}>Register</button>
          </div>

          {safeDetail && (
            <div className="card">
              <h2>Safe Detail</h2>
              <div>Address: {safeDetail.safeAddress}</div>
              <div>Owners: {safeDetail.owners.join(', ')}</div>
              <div>Threshold: {safeDetail.threshold}</div>
              <div>Nonce: {safeDetail.nonce}</div>

              <h3>Propose Transaction</h3>
              <input value={txTo} onChange={(e) => setTxTo(e.target.value)} placeholder="to" />
              <input value={txValue} onChange={(e) => setTxValue(e.target.value)} placeholder="value wei" />
              <input value={txData} onChange={(e) => setTxData(e.target.value)} placeholder="data hex" />
              <button onClick={propose}>Propose</button>

              <h3>Proposals</h3>
              {proposals.map((p) => (
                <div className="proposal" key={p.id}>
                  <div>{p.safeTxHash}</div>
                  <div>{p.confirmations.length}/{p.confirmationsRequired} confirmations</div>
                  <div>Executable: {String(p.executable)}</div>
                  <button onClick={() => confirm(p)}>Sign</button>
                  <button disabled={!p.executable} onClick={() => execute(p)}>Execute</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {status && <p>{status}</p>}
    </div>
  );
}
