import { useCallback, useEffect, useMemo, useState } from 'react';
import { createWalletClient, custom, encodeFunctionData, getContract } from 'viem';
import { createPrividiumClient } from 'prividium';
import { prividium } from './prividium';
import { REVEAL_SOON_ABI } from './messageAbi';
import {
  explorerTxUrl,
  formatAddress,
  formatCountdown,
  formatRelative,
  formatTimestamp,
  timeAgo,
  ZERO_ADDRESS
} from './utils';

const CONTRACT_ADDRESS = import.meta.env.VITE_REVEAL_SOON_CONTRACT_ADDRESS;
const FEED_PAGE_SIZE = 50;

const DELAY_OPTIONS = [
  { label: '1 minute', seconds: 60 },
  { label: '5 minutes', seconds: 300 },
  { label: '30 minutes', seconds: 1800 },
  { label: '1 hour', seconds: 3600 },
  { label: '24 hours', seconds: 86400 },
  { label: 'Custom minutes', seconds: 'custom' }
];

const PUBLIC_TEXT_HINT = 'Teaser (80–120 chars works well).';

function parseRoute(pathname) {
  const match = pathname.match(/^\/message\/(\d+)/);
  if (match) {
    return { view: 'message', messageId: Number(match[1]) };
  }
  return { view: 'home', messageId: null };
}

function useChainNow(rpcClient, enabled) {
  const [offsetSeconds, setOffsetSeconds] = useState(0);
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    const tick = () => setNowSeconds(Math.floor(Date.now() / 1000) + offsetSeconds);
    tick();
    const interval = window.setInterval(tick, 500);
    return () => window.clearInterval(interval);
  }, [offsetSeconds]);

  useEffect(() => {
    if (!rpcClient || !enabled) return;
    let active = true;

    const sync = async () => {
      try {
        const block = await rpcClient.getBlock();
        if (!active) return;
        const chainTime = Number(block.timestamp);
        const localTime = Math.floor(Date.now() / 1000);
        setOffsetSeconds(chainTime - localTime);
        setSynced(true);
      } catch (error) {
        console.warn('Failed to sync chain time', error);
        if (active) setSynced(false);
      }
    };

    sync();
    const interval = window.setInterval(sync, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [rpcClient, enabled]);

  return { nowSeconds, synced };
}

function TeachingPanel({ compact }) {
  return (
    <section className={compact ? 'panel teaching compact' : 'panel teaching'}>
      <h2>RevealSoon: public teaser + private reveal</h2>
      <div className="teaching-grid">
        <div>
          <h3>Public immediately</h3>
          <ul>
            <li>Public teaser text</li>
            <li>Author + timestamps</li>
            <li>Reveal schedule</li>
          </ul>
        </div>
        <div>
          <h3>Private until reveal</h3>
          <ul>
            <li>Full private message</li>
          </ul>
        </div>
      </div>
      <p className="teaching-copy">
        Both parts live on-chain in contract storage. Prividium keeps the private text unreadable until reveal time — no
        events, no server timers, no explicit reveal transaction.
      </p>
    </section>
  );
}

function MessageRow({ item, nowSeconds, onOpen }) {
  const isRevealed = nowSeconds >= item.revealAt;
  const revealLabel = isRevealed ? 'Revealed' : 'Hidden';
  const countdown = formatCountdown(item.revealAt, nowSeconds);
  const href = `/message/${item.messageId}`;

  return (
    <li className="activity-item">
      <header>
        <span className={`badge ${isRevealed ? 'reveal' : 'secret'}`}>{revealLabel}</span>
        <div className="activity-meta">
          <strong>{item.publicText}</strong>
          <span className="subtle">by {formatAddress(item.author)}</span>
          <div className="time">
            Created {formatTimestamp(item.createdAt)} · {timeAgo(item.createdAt, nowSeconds)}
          </div>
          <div className="time">
            Reveals {formatTimestamp(item.revealAt)} · {formatRelative(item.revealAt, nowSeconds)}
          </div>
        </div>
        <div className="countdown">
          {isRevealed ? 'Now public' : `Unlocks in ${countdown}`}
          <a
            className="secondary link-button"
            href={href}
            onClick={(event) => {
              event.preventDefault();
              onOpen(item.messageId);
            }}
          >
            Open
          </a>
        </div>
      </header>
    </li>
  );
}

function MessagePage({
  messageId,
  revealContract,
  nowSeconds,
  synced,
  txHash,
  txLink,
  onBack,
  onShare
}) {
  const [message, setMessage] = useState(null);
  const [privateText, setPrivateText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!revealContract) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const header = await revealContract.read.getMessageHeader([BigInt(messageId)]);
        const publicText = await revealContract.read.getPublicText([BigInt(messageId)]);
        if (!active) return;
        setMessage({
          id: Number(header.id),
          author: header.author,
          createdAt: Number(header.createdAt),
          revealAt: Number(header.revealAt),
          publicText
        });
      } catch (err) {
        console.error(err);
        if (active) setError('Unable to load this message. Check permissions and the message id.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [messageId, revealContract]);

  useEffect(() => {
    if (!revealContract || !message) return;
    if (nowSeconds < message.revealAt) return;
    if (privateText) return;
    let active = true;
    const loadPrivate = async () => {
      try {
        const text = await revealContract.read.getPrivateText([BigInt(messageId)]);
        if (active) setPrivateText(text);
      } catch (err) {
        console.warn('Private text still locked', err);
      }
    };
    loadPrivate();
    return () => {
      active = false;
    };
  }, [messageId, message, nowSeconds, privateText, revealContract]);

  if (loading) {
    return (
      <section className="panel">
        <button className="secondary" onClick={onBack}>
          ← Back
        </button>
        <p className="hint">Loading message…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <button className="secondary" onClick={onBack}>
          ← Back
        </button>
        <p className="error">{error}</p>
      </section>
    );
  }

  if (!message) return null;

  const isRevealed = nowSeconds >= message.revealAt;
  const countdown = formatCountdown(message.revealAt, nowSeconds);

  return (
    <section className="panel message-panel">
      <div className="message-header">
        <button className="secondary" onClick={onBack}>
          ← Back
        </button>
        <button className="secondary" onClick={onShare}>
          Share
        </button>
      </div>

      <h2 className="message-title">{message.publicText}</h2>
      <p className="hint">
        {isRevealed ? 'Revealed to everyone.' : `Unlocks in ${countdown}.`}{' '}
        {!synced && <span className="subtle">(based on local clock)</span>}
      </p>

      <div className="metadata">
        <div>
          <span className="label">Author</span>
          <span>{message.author}</span>
        </div>
        <div>
          <span className="label">Created</span>
          <span>
            {formatTimestamp(message.createdAt)} · {timeAgo(message.createdAt, nowSeconds)}
          </span>
        </div>
        <div>
          <span className="label">Reveal at</span>
          <span>
            {formatTimestamp(message.revealAt)} · {formatRelative(message.revealAt, nowSeconds)}
          </span>
        </div>
        <div>
          <span className="label">Tx hash</span>
          <span>
            {txHash ? (
              txLink ? (
                <a href={txLink} target="_blank" rel="noreferrer">
                  {txHash}
                </a>
              ) : (
                txHash
              )
            ) : (
              'Not available'
            )}
          </span>
        </div>
      </div>

      <div className="private-block">
        <h3>Private reveal</h3>
        {isRevealed ? (
          <p className="private-text">{privateText || 'Fetching private text…'}</p>
        ) : (
          <div className="note">
            <p className="note-text placeholder">🔒 Private text stored on-chain but unreadable until reveal time.</p>
            <p className="note-meta">Prividium enforces access based on block time — no manual reveal transaction.</p>
          </div>
        )}
      </div>

      <TeachingPanel compact />
    </section>
  );
}

export default function App() {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [address, setAddress] = useState('');
  const [publicText, setPublicText] = useState('');
  const [privateText, setPrivateText] = useState('');
  const [delaySelection, setDelaySelection] = useState(String(DELAY_OPTIONS[0].seconds));
  const [customMinutes, setCustomMinutes] = useState('10');
  const [activeTab, setActiveTab] = useState('upcoming');
  const [feed, setFeed] = useState([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
  const [txById, setTxById] = useState({});
  const [shareNotice, setShareNotice] = useState('');

  const explorerBase = prividium.chain.blockExplorers?.default?.url;

  useEffect(() => {
    setIsAuthorized(prividium.isAuthorized());
  }, []);

  useEffect(() => {
    const handlePop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  const rpcClient = useMemo(() => {
    const account = address || ZERO_ADDRESS;
    return createPrividiumClient({
      chain: prividium.chain,
      transport: prividium.transport,
      account
    });
  }, [address]);

  const revealContract = useMemo(() => {
    if (!CONTRACT_ADDRESS) return null;
    return getContract({
      address: CONTRACT_ADDRESS,
      abi: REVEAL_SOON_ABI,
      client: rpcClient
    });
  }, [rpcClient]);

  const { nowSeconds, synced } = useChainNow(rpcClient, isAuthorized);

  const loadFeed = useCallback(async () => {
    if (!CONTRACT_ADDRESS) {
      setError('Missing VITE_REVEAL_SOON_CONTRACT_ADDRESS env var.');
      return;
    }
    if (!revealContract) {
      setError('Contract client not ready.');
      return;
    }

    setLoadingFeed(true);
    setError('');

    try {
      const total = Number(await revealContract.read.getMessagesCount());
      if (total === 0) {
        setFeed([]);
        return;
      }

      const count = Math.min(total, FEED_PAGE_SIZE);
      const start = total - count;
      const headers = await revealContract.read.getMessagesRange([BigInt(start), BigInt(count)]);

      const items = await Promise.all(
        headers.map(async (header) => {
          const id = Number(header.id);
          const publicTextValue = await revealContract.read.getPublicText([header.id]);
          return {
            id: `message-${id}`,
            messageId: id,
            author: header.author,
            createdAt: Number(header.createdAt),
            revealAt: Number(header.revealAt),
            publicText: publicTextValue
          };
        })
      );

      setFeed(items);
    } catch (err) {
      console.error(err);
      setError('Failed to load messages. Check your Prividium auth and contract permissions.');
    } finally {
      setLoadingFeed(false);
    }
  }, [revealContract]);

  useEffect(() => {
    if (isAuthorized) {
      loadFeed();
    }
  }, [isAuthorized, loadFeed]);

  const handleAuthorizeRead = async () => {
    setError('');
    try {
      await prividium.authorize();
      setIsAuthorized(true);
    } catch (err) {
      console.error(err);
      setError('Read-only sign-in failed.');
    }
  };

  const handleAuthorizeWrite = async () => {
    setError('');
    try {
      await prividium.authorize({
        scopes: ['wallet:required', 'network:required']
      });
      setIsAuthorized(true);
    } catch (err) {
      console.error(err);
      setError('Write access sign-in failed.');
    }
  };

  const connectWallet = async () => {
    setError('');
    if (!window.ethereum) {
      setError('No injected wallet found. Install MetaMask or a compatible wallet.');
      return;
    }
    try {
      const walletClient = createWalletClient({
        chain: prividium.chain,
        transport: custom(window.ethereum)
      });
      const [walletAddress] = await walletClient.requestAddresses();
      setAddress(walletAddress);
    } catch (err) {
      console.error(err);
      setError('Wallet connection failed.');
    }
  };

  const delaySeconds =
    delaySelection === 'custom'
      ? Math.max(Number(customMinutes || 0), 1) * 60
      : Number(delaySelection);

  const sendMessage = async () => {
    if (!publicText.trim() || !privateText.trim()) return;
    if (!address) {
      setError('Connect your wallet to write.');
      return;
    }
    if (!CONTRACT_ADDRESS) {
      setError('Missing VITE_REVEAL_SOON_CONTRACT_ADDRESS env var.');
      return;
    }
    if (!revealContract) {
      setError('Contract client not ready.');
      return;
    }

    setSubmitting(true);
    setError('');
    setReceipt(null);

    try {
      const walletClient = createWalletClient({
        chain: prividium.chain,
        transport: custom(window.ethereum)
      });

      const data = encodeFunctionData({
        abi: REVEAL_SOON_ABI,
        functionName: 'createMessage',
        args: [publicText.trim(), privateText.trim(), delaySeconds]
      });

      const nonce = await rpcClient.getTransactionCount({ address });
      const gasPrice = await rpcClient.getGasPrice();
      const gas = await rpcClient.estimateGas({
        account: address,
        to: CONTRACT_ADDRESS,
        data
      });

      const request = await walletClient.prepareTransactionRequest({
        account: address,
        to: CONTRACT_ADDRESS,
        data,
        value: 0n,
        gas,
        gasPrice,
        nonce
      });

      await prividium.authorizeTransaction({
        walletAddress: address,
        toAddress: CONTRACT_ADDRESS,
        nonce: Number(request.nonce),
        calldata: request.data,
        value: request.value
      });

      await walletClient.switchChain({ id: prividium.chain.id });

      const hash = await walletClient.sendTransaction(request);
      await rpcClient.waitForTransactionReceipt({ hash });

      const total = Number(await revealContract.read.getMessagesCount());
      const messageId = total > 0 ? total - 1 : null;
      const header = messageId !== null ? await revealContract.read.getMessageHeader([BigInt(messageId)]) : null;

      const receiptPayload = {
        status: 'Submitted',
        messageId,
        createdAt: header ? Number(header.createdAt) : Math.floor(Date.now() / 1000),
        revealAt: header ? Number(header.revealAt) : Math.floor(Date.now() / 1000) + delaySeconds,
        txHash: hash,
        explorerUrl: explorerTxUrl(prividium.chain, hash)
      };

      setTxById((prev) => (messageId !== null ? { ...prev, [messageId]: hash } : prev));
      setReceipt(receiptPayload);
      setPublicText('');
      setPrivateText('');
      await loadFeed();
    } catch (err) {
      console.error(err);
      setError('Transaction failed. Check permissions and wallet configuration.');
    } finally {
      setSubmitting(false);
    }
  };

  const sortedFeed = useMemo(() => {
    return [...feed].sort((a, b) => a.revealAt - b.revealAt);
  }, [feed]);

  const loginLabel = isAuthorized ? 'Signed in' : 'Sign in for read access';

  const navigate = useCallback((path) => {
    window.history.pushState({}, '', path);
    setRoute(parseRoute(path));
  }, []);

  const openMessage = useCallback(
    (messageId) => {
      navigate(`/message/${messageId}`);
    },
    [navigate]
  );

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareNotice('Link copied.');
      window.setTimeout(() => setShareNotice(''), 2000);
    } catch (err) {
      console.error(err);
      setShareNotice('Copy failed.');
    }
  };

  if (route.view === 'message' && route.messageId !== null) {
    const txHash = txById[route.messageId];
    const txLink = txHash ? explorerTxUrl(prividium.chain, txHash) : '';
    return (
      <div className="app">
        <header className="app-header">
          <div>
            <h1>RevealSoon</h1>
            <p className="subtitle">Public teaser now, private reveal later.</p>
          </div>
          <div className="header-actions">
            <button className="secondary" onClick={handleAuthorizeRead} disabled={isAuthorized}>
              {loginLabel}
            </button>
            <button className="secondary" onClick={handleAuthorizeWrite}>
              Enable write
            </button>
          </div>
        </header>

        {error && <div className="error">{error}</div>}

        <MessagePage
          messageId={route.messageId}
          revealContract={revealContract}
          nowSeconds={nowSeconds}
          synced={synced}
          txHash={txHash}
          txLink={txLink}
          onBack={() => navigate('/')}
          onShare={handleShare}
        />
        {shareNotice && <p className="hint">{shareNotice}</p>}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>RevealSoon</h1>
          <p className="subtitle">Public teaser now, private reveal later.</p>
        </div>
        <div className="header-actions">
          <button className="secondary" onClick={handleAuthorizeRead} disabled={isAuthorized}>
            {loginLabel}
          </button>
          <button className="secondary" onClick={handleAuthorizeWrite}>
            Enable write
          </button>
        </div>
      </header>

      <TeachingPanel />

      {error && <div className="error">{error}</div>}

      <div className="tabs">
        <button className={activeTab === 'upcoming' ? 'tab active' : 'tab'} onClick={() => setActiveTab('upcoming')}>
          Upcoming Unlocks
        </button>
        <button className={activeTab === 'create' ? 'tab active' : 'tab'} onClick={() => setActiveTab('create')}>
          Create
        </button>
      </div>

      <main className="main-grid">
        {activeTab === 'upcoming' && (
          <section className="panel">
            <div className="feed-header">
              <h2>Upcoming unlocks</h2>
              <button className="secondary" onClick={loadFeed} disabled={loadingFeed || !isAuthorized}>
                {loadingFeed ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
            <p className="hint">
              Sorted by soonest reveal time.{' '}
              {synced ? 'Countdowns synced to chain time.' : 'Countdowns use local time; refresh to resync.'}
            </p>

            {!isAuthorized && (
              <p className="hint">
                Sign in to load the feed. This demo uses Prividium read access even for public metadata.
              </p>
            )}

            {loadingFeed && <p className="hint">Loading feed…</p>}

            {sortedFeed.length === 0 && !loadingFeed ? (
              <p className="hint">No messages yet.</p>
            ) : (
              <ul className="activity-list">
                {sortedFeed.map((item) => (
                  <MessageRow key={item.id} item={item} nowSeconds={nowSeconds} onOpen={openMessage} />
                ))}
              </ul>
            )}
          </section>
        )}

        {activeTab === 'create' && (
          <section className="panel">
            <h2>Create</h2>
            <div className="wallet-row">
              <span>{address ? `Wallet: ${formatAddress(address)}` : 'Wallet: not connected'}</span>
              <button className="secondary" onClick={connectWallet}>
                Connect wallet
              </button>
            </div>
            <p className="hint">Login state: {isAuthorized ? 'Authorized' : 'Not signed in'}</p>

            <label className="field">
              <span>Public teaser</span>
              <input
                value={publicText}
                onChange={(event) => setPublicText(event.target.value)}
                placeholder="e.g. The project launches next week."
                maxLength={120}
                disabled={!address}
              />
              <span className="hint">{PUBLIC_TEXT_HINT}</span>
            </label>

            <label className="field">
              <span>Private reveal</span>
              <textarea
                value={privateText}
                onChange={(event) => setPrivateText(event.target.value)}
                placeholder="Full reveal details live here."
                disabled={!address}
              />
            </label>

            <label className="field">
              <span>Reveal delay</span>
              <select
                value={delaySelection}
                onChange={(event) => setDelaySelection(event.target.value)}
                disabled={!address}
              >
                {DELAY_OPTIONS.map((option) => (
                  <option key={option.label} value={option.seconds}>
                    {option.label}
                  </option>
                ))}
              </select>
              {delaySelection === 'custom' && (
                <input
                  type="number"
                  min="1"
                  value={customMinutes}
                  onChange={(event) => setCustomMinutes(event.target.value)}
                  placeholder="Minutes"
                  disabled={!address}
                />
              )}
            </label>

            <button
              onClick={sendMessage}
              disabled={!address || submitting || !publicText.trim() || !privateText.trim()}
            >
              {submitting ? 'Storing…' : 'Create message'}
            </button>

            {receipt && (
              <div className="receipt">
                <h3>Receipt</h3>
                <ul>
                  <li>
                    <strong>Message ID:</strong> {receipt.messageId ?? 'Pending'}
                  </li>
                  <li>
                    <strong>Created:</strong> {formatTimestamp(receipt.createdAt)}
                  </li>
                  <li>
                    <strong>Reveal at:</strong> {formatTimestamp(receipt.revealAt)}
                  </li>
                  <li>
                    <strong>Tx:</strong>{' '}
                    {receipt.explorerUrl ? (
                      <a href={receipt.explorerUrl} target="_blank" rel="noreferrer">
                        {receipt.txHash}
                      </a>
                    ) : (
                      receipt.txHash
                    )}
                  </li>
                </ul>
                {receipt.messageId !== null && (
                  <button className="secondary" onClick={() => openMessage(receipt.messageId)}>
                    Open message page
                  </button>
                )}
                <p className="hint">
                  Both teaser + reveal are stored on-chain immediately, but Prividium keeps the private text unreadable
                  until reveal time.
                </p>
              </div>
            )}

            {explorerBase && <p className="hint">Explorer base: {explorerBase}</p>}
          </section>
        )}
      </main>
    </div>
  );
}
