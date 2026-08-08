import { useMidnight } from './hooks/useMidnight';
import { WalletConnect } from './components/WalletConnect';
import { FlashLoanFeature } from './components/FlashLoanFeature';
import { CONTRACT_ADDRESS, NETWORK_ID } from './config';
import { fmt } from './format';
import { Activity, AlertTriangle, Bolt, Lock, ShieldCheck } from './components/icons';

export default function App() {
  const { status, wallets, ledger, ledgerError, session, connect, disconnect, refreshLedger } = useMidnight();
  const connected = status.state === 'connected' && session !== null;

  return (
    <div className="app-shell">
      <nav className="nav">
        <div className="nav-inner">
          <div className="brand">
            <span className="brand-mark">
              <Bolt size={18} />
            </span>
            <span className="brand-name">
              Midnight <span>Flash</span>
            </span>
          </div>
          <div className="nav-right">
            <span className="pill pill-network" title="Network">
              {NETWORK_ID}
            </span>
            {ledger && (
              <span className="pill pill-vault" title="Available liquidity">
                Vault {fmt(ledger.vaultBalance)}
              </span>
            )}
            <WalletConnect
              status={status}
              wallets={wallets}
              onConnect={(wallet) => void connect(wallet)}
              onDisconnect={disconnect}
            />
          </div>
        </div>
      </nav>

      <header className="hero">
        <p className="eyebrow">Zero-knowledge DeFi · Midnight Network</p>
        <h1>Flash loans, without the collateral.</h1>
        <p className="hero-sub">
          Borrow from the vault, arbitrage and repay inside one transaction — while your trade strategy
          stays a private witness that never touches the ledger.
        </p>
        <div className="chips">
          <span className="chip">
            <ShieldCheck size={14} /> Atomic repay-or-revert
          </span>
          <span className="chip">
            <Lock size={14} /> Private trade witness
          </span>
          <span className="chip">
            <Activity size={14} /> 0.1% base + 10% performance fee
          </span>
        </div>
      </header>

      <main className="dashboard">
        {connected ? (
          <FlashLoanFeature session={session} ledger={ledger} onLedgerChanged={refreshLedger} />
        ) : (
          <div className="empty-state">
            <span className="empty-icon">
              <Bolt size={26} />
            </span>
            <h3>Ready when your wallet is</h3>
            <p>
              Connect a Midnight wallet to fund the vault, execute a flash loan, and watch the public
              ledger update. No accounts, no signup — the DApp Connector API handles it.
            </p>
            <div className="empty-steps">
              <div className="empty-step">
                <span className="empty-step-num">1</span>
                <b>Connect</b>
                <span>
                  Approve the prompt in 1AM or Lace — the demo connects over <code>window.midnight</code>,
                  no backend required.
                </span>
              </div>
              <div className="empty-step">
                <span className="empty-step-num">2</span>
                <b>Fund the vault</b>
                <span>Deposit liquidity that flash loans borrow from.</span>
              </div>
              <div className="empty-step">
                <span className="empty-step-num">3</span>
                <b>Execute</b>
                <span>Run a private arbitrage and repay atomically in the same block.</span>
              </div>
            </div>
            <p className="hint hint-center">
              Contract <code>{CONTRACT_ADDRESS.slice(0, 18)}…</code>
            </p>
          </div>
        )}

        {ledgerError && (
          <div className="alert alert-error ledger-error" role="alert">
            <AlertTriangle size={16} />
            <div>
              <strong>Ledger sync failed:</strong> {ledgerError}
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>
          Educational demo for the SPPU bootcamp — INTO the Midnight. The trade strategy is a private
          witness and never leaves your browser.
        </p>
      </footer>
    </div>
  );
}
