import React, { useState, useEffect } from 'react';
import { RoomState } from '../types';
import { 
  Wallet, 
  Terminal, 
  Plus, 
  Play, 
  RefreshCw, 
  Cpu, 
  Globe, 
  ArrowDownRight, 
  ArrowUpRight, 
  ShieldCheck, 
  CheckCircle2,
  Lock,
  TrendingUp,
  Award
} from 'lucide-react';

interface BettingDashboardProps {
  roomState: RoomState | null;
  currentUser: string;
  onSetUser: (username: string) => void;
  stake: number;
  onSetStake: (stake: number) => void;
  onJoinRoom: (roomId: string, autoJoinAI?: boolean | 'easy' | 'medium' | 'hard') => void;
  onJoinAI: (difficulty?: 'easy' | 'medium' | 'hard') => void;
  apiLogs: Array<{
    id: string;
    apiName: string;
    payload: any;
    response: any;
    timestamp: string;
  }>;
  laravelUsers: Array<{ id: string; username: string; balance: number }>;
  onRefreshUsers: () => void;
  onModifyBalance: (userId: string, amount: number) => void;
}

export default function BettingDashboard({
  roomState,
  currentUser,
  onSetUser,
  stake,
  onSetStake,
  onJoinRoom,
  onJoinAI,
  apiLogs,
  laravelUsers,
  onRefreshUsers,
  onModifyBalance,
}: BettingDashboardProps) {
  const [customUser, setCustomUser] = useState(currentUser);
  const [customRoom, setCustomRoom] = useState('Championship_Lounge');
  const [activeTab, setActiveTab] = useState<'matchmaker' | 'laravel' | 'users'>('matchmaker');
  
  // Custom states for interactive simulated payment gateways
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('100');
  const [depositMethod, setDepositMethod] = useState('visa');
  const [depositAddress, setDepositAddress] = useState('');
  
  const [withdrawAmount, setWithdrawAmount] = useState('50');
  const [withdrawMethod, setWithdrawMethod] = useState('bank');
  const [withdrawAddress, setWithdrawAddress] = useState('');

  // Success notifications
  const [notification, setNotification] = useState<string | null>(null);

  // Sync state updates
  useEffect(() => {
    setCustomUser(currentUser);
  }, [currentUser]);

  // Handle local amount inputs
  const [adjustAmounts, setAdjustAmounts] = useState<{ [key: string]: number }>({});
  const handleAmountChange = (userId: string, val: string) => {
    setAdjustAmounts({
      ...adjustAmounts,
      [userId]: parseFloat(val) || 0,
    });
  };

  const activeEscrow = roomState && roomState.status !== 'waiting' && roomState.status !== 'gameover'
    ? roomState.stake * 2
    : 0;

  const handleDepositSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(depositAmount) || 100;
    const userToFund = laravelUsers.find(u => u.username === currentUser);
    if (userToFund) {
      onModifyBalance(userToFund.id, amt);
      setNotification("Payment secure! Your simulated wallet has been funded successfully.");
      setIsDepositOpen(false);
      setTimeout(() => setNotification(null), 3500);
    }
  };

  const handleWithdrawSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(withdrawAmount) || 50;
    const userToDebit = laravelUsers.find(u => u.username === currentUser);
    if (userToDebit) {
      if (userToDebit.balance < amt) {
        alert('Insufficient funds to execute cashout');
        return;
      }
      onModifyBalance(userToDebit.id, -amt);
      setNotification("Cashout triggered! Your withdrawal request has been logged and is processing.");
      setIsWithdrawOpen(false);
      setTimeout(() => setNotification(null), 3500);
    }
  };

  const currentWalletObj = laravelUsers.find(u => u.username === currentUser);

  return (
    <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-5 shadow-xl flex flex-col gap-4 relative overflow-hidden">
      
      {/* Decorative top ribbon */}
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-500 via-yellow-400 to-emerald-500" />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-amber-500 animate-pulse" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-100 flex items-center gap-1.5 font-mono">
            <span>BETTING CONTROLS</span>
          </h2>
        </div>
      </div>

      {/* Wallet Action Float notifications */}
      {notification && (
        <div className="bg-emerald-950 border border-emerald-500/30 text-emerald-300 p-3 rounded-lg text-xs font-mono flex items-center gap-2 animate-fadeIn shadow-lg">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 animate-bounce shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Tabs list */}
      <div className="flex border-b border-slate-800 pb-2.5 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('matchmaker')}
          className={`px-3 py-1.5 rounded-lg font-mono text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'matchmaker'
              ? 'bg-amber-50/10 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-205'
          }`}
        >
          <Play className="w-3.5 h-3.5" /> 
          Lobby & Secure Escrow
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-3 py-1.5 rounded-lg font-mono text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'users'
              ? 'bg-amber-50/10 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-205'
          }`}
        >
          <Wallet className="w-3.5 h-3.5" /> 
          Wallets & Gateways
        </button>
        <button
          onClick={() => setActiveTab('laravel')}
          className={`px-3 py-1.5 rounded-lg font-mono text-[10px] sm:text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            activeTab === 'laravel'
              ? 'bg-amber-50/10 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-205'
          }`}
        >
          <Terminal className="w-3.5 h-3.5 text-orange-400" /> 
          Laravel API Logger
        </button>
      </div>

      {/* TAB 1: Matchmaker and Escrow */}
      {activeTab === 'matchmaker' && (
        <div className="flex flex-col gap-4">
          
          {/* Main User Balance Indicator */}
          {currentWalletObj && (
            <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-mono">My Net Balance:</div>
                  <div className="text-slate-200 font-mono text-xs font-bold">{currentUser}</div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-md sm:text-lg font-bold font-mono text-emerald-400">
                  ${currentWalletObj.balance.toFixed(2)}
                </span>
                <span className="text-[9px] text-slate-500 font-mono block">USD Escrow Capable</span>
              </div>
            </div>
          )}

          {/* Identity Entry Box */}
          <div className="grid grid-cols-1 gap-3.5 bg-slate-950/60 p-3.5 border border-slate-800 rounded-lg">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-mono text-slate-400">
                Player Network Identity Key:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customUser}
                  onChange={(e) => setCustomUser(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 flex-1 font-mono font-bold"
                />
                <button
                  onClick={() => onSetUser(customUser)}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer animate-pulse"
                >
                  Apply Identity
                </button>
              </div>
            </div>

            {/* Simple numeric stake configuration (Cleans up complicated slider presets) */}
            <div className="flex flex-col gap-1.5 border-t border-slate-900 pt-2.5">
              <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                <span>Configure Room Stake:</span>
                <span className="text-amber-400 font-extrabold font-mono text-sm">${stake} USD</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  max="1000"
                  value={stake}
                  onChange={(e) => onSetStake(Math.max(5, parseInt(e.target.value) || 5))}
                  className="bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 flex-1 font-mono font-bold"
                />
                <span className="text-[9px] text-slate-500 font-mono">Min $5 • Max $1000</span>
              </div>
            </div>
          </div>

          {/* Lobby Recruitment Actions */}
          {!roomState || roomState.status === 'gameover' ? (
            <div className="flex flex-col gap-3 font-mono">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-400 uppercase">Room ID / Cryptographic Access Code:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customRoom}
                    onChange={(e) => setCustomRoom(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 flex-1 font-mono font-bold text-amber-500"
                  />
                  <button
                    onClick={() => onJoinRoom(customRoom)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold font-mono px-3 py-1.5 text-[10px] rounded-lg flex items-center gap-1 shadow-md cursor-pointer border border-slate-700"
                  >
                    <Plus className="w-3.5 h-3.5" /> 
                    Reserve Seat
                  </button>
                </div>
              </div>

              {/* Direct Challenge Button - Defaults to Balanced Medium Match */}
              <button
                onClick={() => {
                  onJoinRoom(customRoom, 'medium');
                }}
                className="w-full py-2.5 bg-gradient-to-r from-amber-600/30 via-yellow-600/20 to-amber-700/30 hover:from-amber-600/40 hover:to-amber-700/40 border border-amber-500/30 hover:border-amber-500/50 text-amber-300 font-mono font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <Cpu className="w-4 h-4 text-amber-500 animate-pulse" />
                Spark Bot Challenge Match
              </button>
            </div>
          ) : (
            
            // Connected Active State Displays
            <div className="bg-slate-950 p-4 border border-slate-850 rounded-lg flex flex-col gap-3.5">
              <div className="flex justify-between items-center bg-slate-900/40 p-2.5 border border-slate-800 rounded-lg">
                <div>
                  <div className="text-[9px] text-slate-500 font-mono">Active Trading Room:</div>
                  <div className="text-xs font-semibold text-slate-300 font-mono">{roomState.name}</div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-500 font-mono text-right">Secured Escrow Trade Pool:</div>
                  <div className="text-xs font-bold text-emerald-400 font-mono text-right">${roomState.stake * 2} USD</div>
                </div>
              </div>

              {/* Live Escrow Card Proof */}
              {activeEscrow > 0 && (
                <div className="bg-emerald-950/20 border border-emerald-500/20 p-3.5 rounded-lg flex flex-col gap-3 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1 px-2 bg-emerald-500/10 text-emerald-400 rounded text-[10px] font-mono flex items-center gap-1 font-bold">
                        <Lock className="w-3 h-3 text-emerald-400" />
                        SECURED ESCROW
                      </div>
                    </div>
                    <span className="text-[9px] text-slate-550 font-mono uppercase tracking-wider bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">
                      Audited Match Live
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-300 leading-normal">
                    <div>
                      <span className="text-[9px] text-slate-500 block">Commission Rate:</span>
                      <span className="font-bold text-amber-500">5% (${(activeEscrow * 0.05).toFixed(2)})</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block">Net Payout Prize:</span>
                      <span className="font-extrabold text-emerald-400">${(activeEscrow * 0.95).toFixed(2)} USD</span>
                    </div>
                  </div>

                  {/* Hash Value Display */}
                  {roomState.escrowHash && (
                    <div className="border-t border-slate-900 pt-2.5 flex flex-col gap-1">
                      <span className="text-[8px] text-slate-500 font-mono flex items-center gap-1 font-bold">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        Verification Integrity Signature (SHA256):
                      </span>
                      <span className="text-[8.5px] text-emerald-500 bg-slate-950 p-1 px-1.5 rounded border border-emerald-500/10 font-mono tracking-normal select-all">
                        {roomState.escrowHash}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Seating Layout Presence List */}
              <div className="flex flex-col gap-2">
                <span className="text-[9px] font-mono text-slate-500 tracking-wider flex items-center gap-1 uppercase font-bold">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  Reserved Table Seating (Max 2 User Clients):
                </span>

                {roomState.players.map((p, i) => (
                  <div key={p.id} className="flex items-center justify-between bg-slate-900/60 p-2 border border-slate-800/80 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-[8.5px] font-mono text-slate-400 bg-slate-950 border border-slate-800 px-1 py-0.5 rounded">
                        SEAT {i + 1}
                      </span>
                      <span className="text-xs font-bold text-slate-200 font-mono flex items-center gap-1">
                        {p.username}
                        {p.username.startsWith('Bot_') && <Cpu className="w-3 h-3 text-amber-500 shrink-0" />}
                      </span>
                      {p.side && (
                        <span className={`text-[8px] font-extrabold px-1.5 rounded uppercase ${
                          p.side === 'solids' ? 'bg-amber-500/10 text-amber-400 font-mono' : 'bg-blue-500/10 text-blue-400 font-mono'
                        }`}>
                          {p.side}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-bold font-mono text-emerald-400">
                      ${p.walletBalance.toFixed(2)}
                    </span>
                  </div>
                ))}

                {roomState.players.length === 1 && (
                  <div className="flex flex-col gap-2 border border-dashed border-slate-800 bg-slate-950/20 p-2.5 rounded-lg text-slate-500 animate-pulse text-[11px] font-mono">
                    <span>Waiting for player 2 with match stake to join...</span>
                    <button
                      onClick={() => onJoinAI('medium')}
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-bold font-mono py-1 rounded transition-colors cursor-pointer text-center uppercase"
                    >
                      Summon Bot Instantly
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Wallets, deposits and withdrawals */}
      {activeTab === 'users' && (
        <div className="flex flex-col gap-4">
          
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-xs font-mono text-slate-400">Simulated Financial Gateways</span>
            <button
              onClick={onRefreshUsers}
              className="p-1 px-2.5 text-[10px] font-bold text-slate-300 hover:text-white hover:bg-slate-800 bg-slate-950 border border-slate-800 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <RefreshCw className="w-3 h-3 text-amber-500" />
              Reload
            </button>
          </div>

          <p className="text-[10px] text-slate-400 leading-normal">
            Simulate secure payment processing checkout gateway routes and cashouts to top up balances before live wagering.
          </p>

          {/* Quick interactive buttons for Deposit/Withdrawals */}
          <div className="grid grid-cols-2 gap-3 pb-1 font-mono">
            <button
              onClick={() => {
                setIsDepositOpen(true);
                setIsWithdrawOpen(false);
              }}
              className="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-extrabold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowDownRight className="w-4 h-4" />
              Deposit Funds
            </button>
            <button
              onClick={() => {
                setIsWithdrawOpen(true);
                setIsDepositOpen(false);
              }}
              className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-755"
            >
              <ArrowUpRight className="w-4 h-4 text-red-500" />
              Withdraw Cashout
            </button>
          </div>

          {/* Deposit Interactive Form Modal */}
          {isDepositOpen && (
            <form onSubmit={handleDepositSubmit} className="bg-slate-950 p-4 border border-emerald-500/20 rounded-lg flex flex-col gap-3 animate-fadeIn">
              <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 font-bold">
                <ArrowDownRight className="w-4 h-4" />
                DEPOSIT SIMULATION GATEWAY
              </span>

              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400 font-bold">
                <button
                  type="button"
                  onClick={() => setDepositMethod('visa')}
                  className={`py-1.5 rounded border text-center ${
                    depositMethod === 'visa' ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : 'border-slate-800 text-slate-500'
                  }`}
                >
                  Visa/MasterCard
                </button>
                <button
                  type="button"
                  onClick={() => setDepositMethod('crypto')}
                  className={`py-1.5 rounded border text-center ${
                    depositMethod === 'crypto' ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : 'border-slate-800 text-slate-500'
                  }`}
                >
                  Crypto TRC20 Wallet
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-500 font-mono">Credit Card or Blockchain Wallet Reference:</label>
                <input
                  type="text"
                  required
                  placeholder={depositMethod === 'visa' ? "4000 1234 5678 9010" : "TY7v89wUn7VscE89w7vUnHsuj298wha"}
                  value={depositAddress}
                  onChange={(e) => setDepositAddress(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-1.5 font-mono text-xs text-slate-300 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] text-slate-500 font-mono">Amount (USD):</label>
                  <input
                    type="number"
                    required
                    min="10"
                    placeholder="100"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded px-2 py-1 font-mono text-xs text-slate-100"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-[10px] rounded"
                  >
                    Authorize Deposit Payment
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Withdrawal Interactive Form Modal */}
          {isWithdrawOpen && (
            <form onSubmit={handleWithdrawSubmit} className="bg-slate-950 p-4 border border-red-500/20 rounded-lg flex flex-col gap-3 animate-fadeIn">
              <span className="text-[10px] font-mono text-red-400 flex items-center gap-1 font-bold">
                <ArrowUpRight className="w-4 h-4" />
                WITHDRAWAL PAYOUT PATHWAY
              </span>

              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400 font-bold">
                <button
                  type="button"
                  onClick={() => setWithdrawMethod('bank')}
                  className={`py-1.5 rounded border text-center ${
                    withdrawMethod === 'bank' ? 'border-red-500 text-red-400 bg-red-500/5' : 'border-slate-800 text-slate-500'
                  }`}
                >
                  Local Bank Transfer
                </button>
                <button
                  type="button"
                  onClick={() => setWithdrawMethod('usdt')}
                  className={`py-1.5 rounded border text-center ${
                    withdrawMethod === 'usdt' ? 'border-red-500 text-red-400 bg-red-500/5' : 'border-slate-800 text-slate-500'
                  }`}
                >
                  USDT Tether (TRC20)
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-500 font-mono">
                  {withdrawMethod === 'bank' 
                    ? "International Bank Account (IBAN):"
                    : "Receiving USDT ERC20/TRC20 Wallet:"
                  }
                </label>
                <input
                  type="text"
                  required
                  placeholder={withdrawMethod === 'bank' ? "AE50 1200 4567 8901 2345 67" : "T9yD14Nj9X7x...USDT"}
                  value={withdrawAddress}
                  onChange={(e) => setWithdrawAddress(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-1.5 font-mono text-xs text-slate-300 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] text-slate-500 font-mono">Amount (USD):</label>
                  <input
                    type="number"
                    required
                    min="10"
                    placeholder="50"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded px-2 py-1 font-mono text-xs text-slate-100"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] rounded"
                  >
                    Execute Fast Withdrawal Path
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Detailed ledger databases for checking users */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[9px] font-mono text-slate-500 tracking-wider font-bold">DATABASE WALLET RECORDS:</span>
            {laravelUsers.map((user) => (
              <div key={user.id} className="p-3 bg-slate-950/80 border border-slate-850 hover:border-slate-800 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-2.5 transition-colors">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-300 font-mono flex items-center gap-1 font-black">
                    {user.username}
                    {user.id === 'ai-bot' && <Cpu className="w-3 text-amber-500" />}
                    {user.username === currentUser && <Award className="w-3 h-3 text-amber-550 shrink-0" />}
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono">DB UID: {user.id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-emerald-400 mr-1 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800/40 font-black">
                    ${user.balance.toFixed(2)} USD
                  </span>
                  <div className="flex items-center gap-1 bg-slate-900 border border-slate-800/80 rounded-md p-0.5">
                    <input
                      type="number"
                      placeholder="+50"
                      onChange={(e) => handleAmountChange(user.id, e.target.value)}
                      className="w-12 bg-transparent border-none text-slate-100 placeholder-slate-600 text-[10px] text-right focus:outline-none font-mono"
                    />
                    <button
                      onClick={() => {
                        const amt = adjustAmounts[user.id] || 50;
                        onModifyBalance(user.id, amt);
                      }}
                      className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[9px] font-extrabold px-1.5 rounded cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Secure Escrow Auto System Description */}
          <div className="p-3.5 bg-slate-950 rounded-lg border border-slate-850 flex flex-col gap-2">
            <span className="text-[9px] font-mono text-slate-400 font-bold flex items-center gap-1 uppercase">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Automated Escrow Routing
            </span>
            <p className="text-[10px] text-slate-500 leading-normal font-mono">
              Once the black 8-ball is pocketed legally, peer checking registers payouts directly onto winner accounts.
            </p>
          </div>
        </div>
      )}

      {/* TAB 3: Laravel web API logs */}
      {activeTab === 'laravel' && (
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center bg-slate-950/40 p-1.5 border border-slate-850 rounded-lg">
            <span className="text-xs font-mono text-slate-400">HTTP ENDPOINT ROUTE INTERPRETER</span>
            <span className="text-[10px] bg-slate-800 text-emerald-400 px-2 py-0.5 rounded font-mono border border-emerald-500/10">
              Live API Sink
            </span>
          </div>

          <div className="bg-slate-950 border border-slate-850 rounded-lg p-3 font-mono text-xs max-h-[300px] overflow-auto flex flex-col gap-3.5">
            {apiLogs.length === 0 ? (
              <span className="text-slate-600 italic">No Laravel API interactions tracked yet in this session. Start a pool match to trigger database escrow locks.</span>
            ) : (
              apiLogs.map((log, idx) => (
                <div key={log.id || `log-${idx}`} className="border-b border-slate-900 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between text-[11px] mb-1.5">
                    <span className="text-amber-400 font-bold">{log.apiName}</span>
                    <span className="text-slate-500 font-mono text-[9px]">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[9px] bg-slate-900/60 p-2 rounded border border-slate-900">
                    <div>
                      <div className="text-slate-500 mb-0.5 text-[8px] uppercase">REQUEST PAYLOAD:</div>
                      <pre className="text-slate-300 whitespace-pre-wrap font-mono">{JSON.stringify(log.payload, null, 2)}</pre>
                    </div>
                    <div>
                      <div className="text-slate-550 mb-0.5 text-[8px] uppercase font-bold">LARAVEL DB RESPONSE:</div>
                      <pre className="text-emerald-300 whitespace-pre-wrap font-mono">{JSON.stringify(log.response, null, 2)}</pre>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
