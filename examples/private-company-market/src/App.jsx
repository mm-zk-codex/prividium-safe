import { useCallback, useEffect, useMemo, useState } from 'react';
import { createWalletClient, custom, encodeFunctionData, getContract, parseEther } from 'viem';
import { createPrividiumClient } from 'prividium';
import { prividium } from './prividium';
import { PRIVATE_MARKET_ABI } from './marketAbi';
import {
  ZERO_ADDRESS,
  formatAddress,
  formatCountdown,
  formatEth,
  formatTimestamp,
  percentShare
} from './utils';

const CONTRACT_ADDRESS = import.meta.env.VITE_PRIVATE_MARKET_CONTRACT_ADDRESS;
const PAGE_SIZE = 20n;

const STATUS_LABELS = ['Open', 'Closed', 'Resolved', 'Cancelled'];
const OUTCOME_LABELS = ['Unresolved', 'YES', 'NO'];

function StatusBadge({ status }) {
  const label = STATUS_LABELS[status] || 'Unknown';
  const className = label.toLowerCase();
  return <span className={`badge ${className}`}>{label}</span>;
}

function MarketCard({ market, onSelect }) {
  const { yes, no } = percentShare(market.totalYes, market.totalNo);

  return (
    <div className="market-card">
      <div className="inline">
        <StatusBadge status={market.status} />
        <span className="hint">{formatCountdown(market.closeTime)}</span>
      </div>
      <h3>{market.question}</h3>
      <div className="market-meta">
        <span>Total pool: {formatEth(market.totalYes + market.totalNo)}</span>
        <span>Close time: {formatTimestamp(market.closeTime)}</span>
      </div>
      <div className="market-bars">
        <div>
          <div className="inline">
            <strong>YES</strong>
            <span className="hint">{yes.toFixed(1)}%</span>
          </div>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${yes}%` }} />
          </div>
        </div>
        <div>
          <div className="inline">
            <strong>NO</strong>
            <span className="hint">{no.toFixed(1)}%</span>
          </div>
          <div className="bar">
            <div className="bar-fill no" style={{ width: `${no}%` }} />
          </div>
        </div>
      </div>
      <div className="market-actions">
        <span className="hint">Probability is derived from the totals.</span>
        <button className="secondary" onClick={() => onSelect(market.id)}>
          View market
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [address, setAddress] = useState('');
  const [markets, setMarkets] = useState([]);
  const [selectedMarketId, setSelectedMarketId] = useState(null);
  const [marketDetail, setMarketDetail] = useState(null);
  const [position, setPosition] = useState({ yes: 0n, no: 0n });
  const [quote, setQuote] = useState(0n);
  const [claimed, setClaimed] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [isResolver, setIsResolver] = useState(false);
  const [betAmount, setBetAmount] = useState('');
  const [createQuestion, setCreateQuestion] = useState('');
  const [createCloseTime, setCreateCloseTime] = useState('');
  const [loadingMarkets, setLoadingMarkets] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setIsAuthorized(prividium.isAuthorized());
  }, []);

  const rpcClient = useMemo(() => {
    const account = address || ZERO_ADDRESS;
    return createPrividiumClient({
      chain: prividium.chain,
      transport: prividium.transport,
      account
    });
  }, [address]);

  const marketContract = useMemo(() => {
    if (!CONTRACT_ADDRESS) return null;
    return getContract({
      address: CONTRACT_ADDRESS,
      abi: PRIVATE_MARKET_ABI,
      client: rpcClient
    });
  }, [rpcClient]);

  const refreshPermissions = useCallback(async () => {
    if (!marketContract || !address) return;
    try {
      const [member, creator, resolver] = await Promise.all([
        marketContract.read.isMember([address]),
        marketContract.read.isCreator([address]),
        marketContract.read.isResolver([address])
      ]);
      setIsMember(Boolean(member));
      setIsCreator(Boolean(creator));
      setIsResolver(Boolean(resolver));
      return { member: Boolean(member), creator: Boolean(creator), resolver: Boolean(resolver) };
    } catch (err) {
      console.error(err);
      setIsMember(false);
      setIsCreator(false);
      setIsResolver(false);
      return { member: false, creator: false, resolver: false };
    }
  }, [address, marketContract]);

  const loadMarkets = useCallback(async () => {
    if (!CONTRACT_ADDRESS) {
      setError('Missing VITE_PRIVATE_MARKET_CONTRACT_ADDRESS env var.');
      return;
    }
    if (!marketContract) return;
    if (!address) {
      setError('Connect a wallet to access member-only markets.');
      return;
    }
    setLoadingMarkets(true);
    setError('');
    setNotice('');

    try {
      const permissions = await refreshPermissions();
      if (!permissions?.member) {
        setError('This wallet is not on the member allowlist.');
        setMarkets([]);
        return;
      }

      const total = await marketContract.read.getMarketsCount();
      if (total === 0n) {
        setMarkets([]);
        return;
      }
      const list = await marketContract.read.getRecentMarkets([PAGE_SIZE, 0n]);
      const parsed = list.map((market) => ({
        id: Number(market.id),
        question: market.question,
        closeTime: Number(market.closeTime),
        status: Number(market.status),
        totalYes: BigInt(market.totalYes),
        totalNo: BigInt(market.totalNo),
        outcome: Number(market.outcome)
      }));
      setMarkets(parsed);
    } catch (err) {
      console.error(err);
      setError('Failed to load markets. Make sure your wallet is a member.');
    } finally {
      setLoadingMarkets(false);
    }
  }, [address, marketContract, refreshPermissions]);

  const loadMarketDetail = useCallback(
    async (marketId) => {
      if (!CONTRACT_ADDRESS) {
        setError('Missing VITE_PRIVATE_MARKET_CONTRACT_ADDRESS env var.');
        return;
      }
      if (!marketContract) return;
      setLoadingDetail(true);
      setError('');
      setNotice('');
      try {
        const permissions = address ? await refreshPermissions() : { member: false };
        if (!permissions.member) {
          setError('This wallet is not on the member allowlist.');
          setMarketDetail(null);
          return;
        }

        const market = await marketContract.read.getMarket([BigInt(marketId)]);
        const detail = {
          id: Number(market.id),
          question: market.question,
          closeTime: Number(market.closeTime),
          status: Number(market.status),
          totalYes: BigInt(market.totalYes),
          totalNo: BigInt(market.totalNo),
          outcome: Number(market.outcome)
        };
        setMarketDetail(detail);

        if (address && permissions.member) {
          const [positionData, payoutQuote, claimStatus] = await Promise.all([
            marketContract.read.getMyPosition([BigInt(marketId)]),
            marketContract.read.quotePayout([BigInt(marketId), address]),
            marketContract.read.getMyClaimStatus([BigInt(marketId)])
          ]);
          const yesAmount = positionData[0];
          const noAmount = positionData[1];

          setPosition({ yes: BigInt(yesAmount), no: BigInt(noAmount) });
          setQuote(BigInt(payoutQuote));
          setClaimed(Boolean(claimStatus));
        } else {
          setPosition({ yes: 0n, no: 0n });
          setQuote(0n);
          setClaimed(false);
        }
      } catch (err) {
        console.error(err);
        setError('Failed to load market details.');
      } finally {
        setLoadingDetail(false);
      }
    },
    [address, marketContract, refreshPermissions]
  );

  useEffect(() => {
    if (isAuthorized && marketContract && address) {
      loadMarkets();
    }
  }, [address, isAuthorized, loadMarkets, marketContract]);

  useEffect(() => {
    if (selectedMarketId != null && isAuthorized) {
      console.log("Loading details");
      loadMarketDetail(selectedMarketId);
    }
  }, [isAuthorized, loadMarketDetail, selectedMarketId]);

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
      await prividium.authorize(/*{
        scopes: ['wallet:required', 'network:required']
      }*/);
      //await prividium.addNetworkToWallet();
      setIsAuthorized(true);
      console.log("Is authorized");
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

  const sendTransaction = async ({ data, value }) => {
    if (!address || !marketContract) throw new Error('Wallet not connected.');
    if (!window.ethereum) throw new Error('No injected wallet available.');

    // Prividium 3-step write flow:
    // 1) Prefetch gas + nonce from authenticated RPC.
    // 2) Authorize the exact calldata with prividium.authorizeTransaction().
    // 3) Send with the same parameters from the wallet RPC.
    const walletClient = createWalletClient({
      chain: prividium.chain,
      transport: custom(window.ethereum)
    });

    const nonce = await rpcClient.getTransactionCount({ address });
    const gasPrice = await rpcClient.getGasPrice();
    const gas = await rpcClient.estimateGas({
      account: address,
      to: CONTRACT_ADDRESS,
      data,
      value
    });

    await prividium.authorizeTransaction({
      walletAddress: address,
      toAddress: CONTRACT_ADDRESS,
      nonce: Number(nonce),
      calldata: data,
      value
    });

    await walletClient.switchChain({ id: prividium.chain.id });

    return walletClient.sendTransaction({
      account: address,
      to: CONTRACT_ADDRESS,
      data,
      value,
      gas,
      gasPrice,
      nonce
    });
  };

  const placeBet = async (side) => {
    if (!betAmount) return;
    if (!marketDetail) return;

    setSubmitting(true);
    setError('');
    setNotice('');

    try {
      const data = encodeFunctionData({
        abi: PRIVATE_MARKET_ABI,
        functionName: side === 'yes' ? 'betYes' : 'betNo',
        args: [BigInt(marketDetail.id)]
      });
      const value = parseEther(betAmount);
      await sendTransaction({ data, value });
      setNotice('Bet submitted. Refreshing your position...');
      setBetAmount('');
      await loadMarketDetail(marketDetail.id);
      await loadMarkets();
    } catch (err) {
      console.error(err);
      setError('Bet failed. Make sure the market is still open and you are a member.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaim = async () => {
    if (!marketDetail) return;
    setSubmitting(true);
    setError('');
    setNotice('');

    try {
      const data = encodeFunctionData({
        abi: PRIVATE_MARKET_ABI,
        functionName: 'claim',
        args: [BigInt(marketDetail.id)]
      });
      await sendTransaction({ data, value: 0n });
      setNotice('Claim processed.');
      await loadMarketDetail(marketDetail.id);
      await loadMarkets();
    } catch (err) {
      console.error(err);
      setError('Claim failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (outcomeYes) => {
    if (!marketDetail) return;
    setSubmitting(true);
    setError('');
    setNotice('');

    try {
      const data = encodeFunctionData({
        abi: PRIVATE_MARKET_ABI,
        functionName: 'resolve',
        args: [BigInt(marketDetail.id), outcomeYes]
      });
      await sendTransaction({ data, value: 0n });
      setNotice('Market resolved.');
      await loadMarketDetail(marketDetail.id);
      await loadMarkets();
    } catch (err) {
      console.error(err);
      setError('Resolution failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!marketDetail) return;
    setSubmitting(true);
    setError('');
    setNotice('');

    try {
      const data = encodeFunctionData({
        abi: PRIVATE_MARKET_ABI,
        functionName: 'cancel',
        args: [BigInt(marketDetail.id)]
      });
      await sendTransaction({ data, value: 0n });
      setNotice('Market cancelled. Members can withdraw their bets.');
      await loadMarketDetail(marketDetail.id);
      await loadMarkets();
    } catch (err) {
      console.error(err);
      setError('Cancel failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateMarket = async () => {
    if (!createQuestion.trim() || !createCloseTime) return;
    setSubmitting(true);
    setError('');
    setNotice('');

    try {
      const closeTimestamp = Math.floor(new Date(createCloseTime).getTime() / 1000);
      const data = encodeFunctionData({
        abi: PRIVATE_MARKET_ABI,
        functionName: 'createMarket',
        args: [createQuestion.trim(), closeTimestamp]
      });
      await sendTransaction({ data, value: 0n });
      setNotice('Market created.');
      setCreateQuestion('');
      setCreateCloseTime('');
      await loadMarkets();
    } catch (err) {
      console.error(err);
      setError('Market creation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const loginLabel = isAuthorized ? 'Signed in' : 'Sign in for read access';

  const showDetail = selectedMarketId !== null && marketDetail;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>PrivateCompanyMarket</h1>
          <p className="subtitle">
            A friendly internal prediction market where individual bets stay private, but totals stay visible.
          </p>
        </div>
        <div className="header-actions">
          <button className="secondary" onClick={handleAuthorizeRead} disabled={isAuthorized}>
            {loginLabel}
          </button>
          <button className="secondary" onClick={handleAuthorizeWrite}>
            Enable write access
          </button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <section className="panel">
        <div className="wallet-row">
          <span>{address ? `Wallet: ${formatAddress(address)}` : 'Wallet: not connected'}</span>
          <button className="secondary" onClick={connectWallet}>
            Connect wallet
          </button>
        </div>
        <p className="hint">
          Markets are member-only. Sign in with Prividium, then connect a wallet to see your private position.
        </p>
      </section>

      {!showDetail && (
        <>
          <section className="panel">
            <div className="list-title">
              <h2>Markets</h2>
              <button className="secondary" onClick={loadMarkets} disabled={loadingMarkets || !isAuthorized}>
                {loadingMarkets ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
            {!isAuthorized && (
              <p className="hint">Sign in to load the markets. Reads always require authentication.</p>
            )}
            {loadingMarkets && <p className="hint">Loading markets…</p>}
            {markets.length === 0 && !loadingMarkets ? (
              <p className="hint">No markets yet. Ask a creator to open one.</p>
            ) : (
              <div className="market-grid">
                {markets.map((market) => (
                  <MarketCard key={market.id} market={market} onSelect={setSelectedMarketId} />
                ))}
              </div>
            )}
          </section>

          {isCreator && (
            <section className="panel">
              <h2>Create a market</h2>
              <p className="hint">
                Creators can open new markets. Close time locks betting, and a resolver will settle outcomes.
              </p>
              <div className="field">
                <label>
                  Question
                  <textarea
                    value={createQuestion}
                    onChange={(event) => setCreateQuestion(event.target.value)}
                    placeholder="Will Feature X ship by Friday?"
                  />
                </label>
              </div>
              <div className="field">
                <label>
                  Close time
                  <input
                    type="datetime-local"
                    value={createCloseTime}
                    onChange={(event) => setCreateCloseTime(event.target.value)}
                  />
                </label>
              </div>
              <button onClick={handleCreateMarket} disabled={submitting || !createQuestion || !createCloseTime}>
                {submitting ? 'Creating…' : 'Create market'}
              </button>
            </section>
          )}
        </>
      )}

      {showDetail && (
        <section className="panel">
          {loadingDetail && <p className="hint">Loading market details…</p>}
          <div className="market-detail-header">
            <div>
              <button className="ghost" onClick={() => setSelectedMarketId(null)}>
                ← Back to markets
              </button>
              <h2>{marketDetail.question}</h2>
            </div>
            <StatusBadge status={marketDetail.status} />
          </div>

          <div className="detail-grid">
            <div className="small-card">
              <strong>Close time</strong>
              <p className="copy">{formatTimestamp(marketDetail.closeTime)}</p>
              <p className="hint">{formatCountdown(marketDetail.closeTime)}</p>
            </div>
            <div className="small-card">
              <strong>Totals</strong>
              <p className="copy">YES: {formatEth(marketDetail.totalYes)}</p>
              <p className="copy">NO: {formatEth(marketDetail.totalNo)}</p>
            </div>
            <div className="small-card">
              <strong>Derived probability</strong>
              <p className="copy">YES {percentShare(marketDetail.totalYes, marketDetail.totalNo).yes.toFixed(1)}%</p>
              <p className="copy">NO {percentShare(marketDetail.totalYes, marketDetail.totalNo).no.toFixed(1)}%</p>
            </div>
            <div className="small-card">
              <strong>Outcome</strong>
              <p className="copy">{OUTCOME_LABELS[marketDetail.outcome] || 'Unset'}</p>
            </div>
          </div>

          <div className="divider" />

          <div className="detail-grid">
            <div className="small-card">
              <h3>Place a bet</h3>
              <p className="hint">Your individual bets are private. Only aggregated totals are visible to others.</p>
              <label className="field">
                <span>Amount ({prividium.chain.nativeCurrency?.symbol || 'ETH'})</span>
                <input
                  value={betAmount}
                  onChange={(event) => setBetAmount(event.target.value)}
                  placeholder="0.05"
                  disabled={!isMember || marketDetail.status !== 0}
                />
              </label>
              <div className="inline">
                <button
                  onClick={() => placeBet('yes')}
                  disabled={!isMember || marketDetail.status !== 0 || submitting || !betAmount}
                >
                  Bet YES
                </button>
                <button
                  onClick={() => placeBet('no')}
                  disabled={!isMember || marketDetail.status !== 0 || submitting || !betAmount}
                >
                  Bet NO
                </button>
              </div>
              {!isMember && <p className="hint">Only members can bet.</p>}
            </div>

            <div className="small-card">
              <h3>Your position</h3>
              {address && isMember ? (
                <div className="position-grid">
                  <div>
                    <strong>YES</strong>
                    <p className="copy">{formatEth(position.yes)}</p>
                  </div>
                  <div>
                    <strong>NO</strong>
                    <p className="copy">{formatEth(position.no)}</p>
                  </div>
                  <div>
                    <strong>Potential payout</strong>
                    <p className="copy">{formatEth(quote)}</p>
                  </div>
                </div>
              ) : (
                <p className="hint">Connect and sign in to see your private position.</p>
              )}
              <button
                onClick={handleClaim}
                disabled={
                  submitting ||
                  claimed ||
                  !isMember ||
                  ![2, 3].includes(marketDetail.status)
                }
              >
                {claimed ? 'Claimed' : 'Claim payout'}
              </button>
              <p className="hint">Claim is available after resolution or cancellation.</p>
            </div>

            {isResolver && (
              <div className="small-card">
                <h3>Resolver actions</h3>
                <p className="hint">Trusted resolvers settle outcomes after close.</p>
                <div className="inline">
                  <button
                    onClick={() => handleResolve(true)}
                    disabled={submitting || marketDetail.status === 2 || marketDetail.status === 3}
                  >
                    Resolve YES
                  </button>
                  <button
                    onClick={() => handleResolve(false)}
                    disabled={submitting || marketDetail.status === 2 || marketDetail.status === 3}
                  >
                    Resolve NO
                  </button>
                </div>
                <button
                  className="secondary"
                  onClick={handleCancel}
                  disabled={submitting || marketDetail.status === 2 || marketDetail.status === 3}
                >
                  Cancel market
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
