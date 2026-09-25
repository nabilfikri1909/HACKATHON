import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Clock3,
  Copy,
  ExternalLink,
  Flame,
  Info,
  Link2,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  TriangleAlert,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useHabitStake } from "./hooks/useHabitStake.js";
import {
  countdown,
  dateTime,
  displayState,
  formatBOT,
  shortAddress,
  validateCommitment,
} from "./lib/habit.js";
import {
  Celebration,
  Dialog,
  MotionButton,
  Panel,
  ProgressRing,
  Spinner,
  StreakGrid,
  Toast,
} from "./components/UI.jsx";

const STATE_COPY = {
  empty: {
    label: "Not started",
    title: "Make room for a better you.",
    description:
      "Choose a duration, commit a little BOT, and give your next habit a reason to stick.",
  },
  ready: {
    label: "Check-in open",
    title: "A small action. A kept promise.",
    description:
      "Your next window is open. Check in before the countdown reaches zero.",
  },
  waiting: {
    label: "Checked in",
    title: "You showed up today.",
    description:
      "Your check-in is confirmed on-chain. Come back when the next window opens.",
  },
  complete: {
    label: "Streak complete",
    title: "Every promise, kept.",
    description:
      "All check-ins are complete. Your principal unlocks when the full commitment period ends.",
  },
  refundable: {
    label: "Refund available",
    title: "You earned your own stake back.",
    description:
      "Your full commitment is complete. Claim your original principal; gas fees are separate.",
  },
  failed: {
    label: "Window missed",
    title: "A window closed. A lesson stays.",
    description:
      "A required check-in was missed. This commitment’s BOT is permanently locked and cannot be recovered.",
  },
  claimed: {
    label: "Refund claimed",
    title: "Commitment complete.",
    description:
      "Your principal was returned. Keep the momentum going with another commitment whenever you are ready.",
  },
};

function Brand() {
  return (
    <a
      href="#dashboard"
      className="flex items-center gap-3 rounded-xl"
      aria-label="HabitStake dashboard"
    >
      <span className="brand-mark">
        <Zap size={24} strokeWidth={2.3} />
      </span>
      <span className="text-xl font-semibold tracking-tight text-white">
        Habit<span className="text-[#00ff00]">Stake</span>
        <span className="mt-0.5 hidden text-xs font-normal tracking-[0.14em] text-zinc-500 sm:block">
          SHOW UP. STAY COMMITTED.
        </span>
      </span>
    </a>
  );
}

function Metric({ icon: Icon, label, children, note, accent = false, delay }) {
  return (
    <Panel delay={delay} className="metric-card">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-zinc-400">{label}</span>
        <Icon
          size={18}
          className={accent ? "text-[#00ff00]" : "text-zinc-500"}
        />
      </div>
      <div className="flex items-baseline gap-2 font-mono text-2xl font-medium tracking-tight text-white">
        {children}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-zinc-500">{note}</p>
    </Panel>
  );
}

function Rules() {
  return (
    <div className="space-y-5 text-sm leading-6 text-zinc-300">
      <div className="risk-note">
        <TriangleAlert size={20} className="mt-0.5 shrink-0" />
        <p>
          <strong>Miss one window, lose access to the entire stake.</strong>{" "}
          Nobody—including the developer—can recover it. Start on testnet. This
          contract is unaudited.
        </p>
      </div>
      <ol className="list-decimal space-y-4 pl-5 marker:text-[#00ff00]">
        <li>
          Choose 1–90 days and a positive BOT amount. Your stake is the amount
          sent with <code>createHabit</code>; keep additional BOT in your wallet
          for gas.
        </li>
        <li>
          Your first window starts when creation is mined. You must press{" "}
          <strong>Check in today</strong> inside that first window. Creation is
          not a check-in.
        </li>
        <li>
          Each window lasts exactly 24 hours from the original start time. Local
          midnight and your last check-in do not reset the schedule.
        </li>
        <li>
          Every required window needs one mined check-in. Its end is exclusive.
          A pending wallet request is not a confirmed check-in.
        </li>
        <li>
          After all check-ins <em>and</em> the full duration, claim your
          original stake. No interest, rewards, or gas reimbursement are paid.
        </li>
        <li>
          A failed commitment can be replaced. Its lost stake remains
          permanently in the contract. A completed one must be refunded before
          replacement.
        </li>
      </ol>
      <p className="rounded-2xl border border-white/8 bg-white/[0.025] p-4 text-zinc-400">
        Check-ins are self-reported. HabitStake cannot verify that you
        exercised, studied, or performed any real-world activity. No personal
        habit details are stored on-chain.
      </p>
    </div>
  );
}

export default function App() {
  const web3 = useHabitStake();
  const [amount, setAmount] = useState("0.01");
  const [days, setDays] = useState(7);
  const [riskAccepted, setRiskAccepted] = useState(false);
  const [mainnetAccepted, setMainnetAccepted] = useState(false);
  const [selectedDay, setSelectedDay] = useState(0);
  const [modal, setModal] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [addressError, setAddressError] = useState("");
  const [draft, setDraft] = useState(null);
  const [formTouched, setFormTouched] = useState(false);
  const habit = web3.snapshot;
  const state = displayState(habit, web3.now);
  const copy = STATE_COPY[state];
  const hasHabit = !!habit?.stake;
  const completed = habit?.completedDays || 0;
  const previewDays = Math.min(90, Math.max(1, Number(days) || 7));
  const totalDays = habit?.totalDays || previewDays;
  const isMainnet = web3.selectedChainId === 677;
  const validation = validateCommitment(amount, days);
  const canReplace = ["empty", "failed", "claimed"].includes(state);
  const canWrite =
    web3.account &&
    web3.contractState === "ready" &&
    !web3.wrongNetwork &&
    !web3.stale &&
    !web3.busy;
  const primaryReady = canWrite && ["ready", "refundable"].includes(state);
  const targetTime =
    state === "ready"
      ? habit?.deadline
      : state === "waiting"
        ? habit?.nextCheckInAt
        : ["complete", "refundable"].includes(state)
          ? habit?.unlockAt
          : 0;

  useEffect(() => {
    setSelectedDay(Math.min(completed, totalDays - 1));
  }, [completed, totalDays, habit?.id]);
  useEffect(() => {
    if (!web3.notice || web3.notice.type === "error") return;
    const timeout = setTimeout(web3.dismissNotice, 8000);
    return () => clearTimeout(timeout);
  }, [web3.notice, web3.dismissNotice]);
  useEffect(() => {
    setRiskAccepted(false);
    setMainnetAccepted(false);
    setDraft(null);
  }, [web3.selectedChainId, web3.account, web3.contractAddress]);

  function openSettings() {
    setAddressInput(web3.contractAddress);
    setAddressError("");
    setModal("settings");
  }
  function saveAddress(event) {
    event.preventDefault();
    try {
      web3.saveContract(addressInput);
      setModal("");
    } catch (error) {
      setAddressError(error.message);
    }
  }
  function prepareCommitment(event) {
    event.preventDefault();
    setFormTouched(true);
    if (validation.error || !riskAccepted || !canWrite || !canReplace) return;
    setDraft({
      amount,
      days: Number(days),
      account: web3.account,
      chainId: web3.selectedChainId,
      contract: web3.contractAddress,
    });
    setMainnetAccepted(false);
    setModal("confirm");
  }
  async function confirmCommitment() {
    if (!draft || (isMainnet && !mainnetAccepted)) return;
    if (
      draft.account !== web3.account ||
      draft.chainId !== web3.selectedChainId ||
      draft.contract !== web3.contractAddress
    ) {
      web3.notify(
        "error",
        "Wallet configuration changed. Review the commitment again.",
      );
      setModal("");
      return;
    }
    setModal("");
    await web3.submit("create", draft);
    setRiskAccepted(false);
  }
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(web3.account);
      web3.notify("success", "Wallet address copied.");
    } catch {
      web3.notify(
        "error",
        "Clipboard access is unavailable. Copy the address from MetaMask.",
      );
    }
  }

  let checkInLabel = "Check in today";
  let CheckInIcon = Flame;
  if (!web3.account) {
    checkInLabel = "Connect wallet to begin";
    CheckInIcon = Wallet;
  } else if (!hasHabit) {
    checkInLabel = "Create your first commitment";
    CheckInIcon = Target;
  } else if (state === "waiting") {
    checkInLabel = "Today’s promise, kept";
    CheckInIcon = CheckCheck;
  } else if (state === "complete") {
    checkInLabel = "Streak complete · awaiting unlock";
    CheckInIcon = LockKeyhole;
  } else if (state === "refundable") {
    checkInLabel = "Claim your refund";
    CheckInIcon = ArrowDownLeft;
  } else if (state === "failed") {
    checkInLabel = "Stake permanently locked";
    CheckInIcon = LockKeyhole;
  } else if (state === "claimed") {
    checkInLabel = "Refund received";
    CheckInIcon = CheckCheck;
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#dashboard">
        Skip to dashboard
      </a>
      <header className="site-header">
        <div className="page-width flex min-h-24 flex-wrap items-center justify-between gap-5 py-5">
          <Brand />
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <MotionButton
              className="icon-button hidden sm:inline-flex"
              aria-label="Read commitment rules"
              onClick={() => setModal("rules")}
            >
              <CircleHelp size={19} />
            </MotionButton>
            <MotionButton
              className="icon-button"
              aria-label="Configure contract"
              disabled={web3.busy}
              onClick={openSettings}
            >
              <Settings2 size={19} />
            </MotionButton>
            <div className="network-select">
              <span
                className={`network-dot ${isMainnet ? "network-dot-mainnet" : ""}`}
              />
              <select
                aria-label="BOT Chain network"
                value={web3.selectedChainId}
                disabled={web3.busy}
                onChange={(event) =>
                  web3.selectNetwork(Number(event.target.value))
                }
              >
                <option value={968}>BOT Testnet</option>
                <option value={677}>BOT Mainnet</option>
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none text-zinc-400"
              />
            </div>
            <MotionButton
              className={
                web3.account
                  ? "wallet-connected"
                  : "button-primary wallet-connect"
              }
              onClick={web3.account ? () => setModal("wallet") : web3.connect}
              disabled={web3.busy}
            >
              {web3.connecting ? (
                <Spinner className="h-4 w-4" />
              ) : web3.account ? (
                <span className="h-2 w-2 rounded-full bg-[#00ff00] shadow-[0_0_10px_#00ff00]" />
              ) : (
                <Wallet size={17} />
              )}
              <span>
                {web3.connecting
                  ? "Connecting…"
                  : web3.account
                    ? shortAddress(web3.account)
                    : "Connect wallet"}
              </span>
            </MotionButton>
          </div>
        </div>
      </header>

      <main id="dashboard" className="page-width pb-8 pt-9 sm:pt-11">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow mb-3">
              <span className="h-px w-6 bg-[#00ff00]" /> YOUR COMMITMENT SPACE
            </p>
            <h1 className="text-[clamp(1.9rem,4vw,2.55rem)] font-medium leading-tight tracking-[-0.045em]">
              Build the habit.
              <span className="text-zinc-500"> Keep your word.</span>
            </h1>
          </div>
          <MotionButton
            onClick={web3.refresh}
            disabled={web3.refreshing || !web3.contractAddress}
            className="button-quiet text-sm"
            aria-label="Refresh on-chain data"
          >
            {web3.refreshing ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <RefreshCw size={15} />
            )}{" "}
            Refresh data
          </MotionButton>
        </div>

        <AnimatePresence mode="wait">
          {web3.contractState === "unconfigured" && (
            <motion.div
              key="unconfigured"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="setup-banner mb-6"
            >
              <div className="flex items-start gap-3">
                <Link2 size={18} className="mt-0.5 shrink-0 text-[#00ff00]" />
                <div>
                  <p className="text-sm font-medium">
                    One setup step before your first commitment.
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                    Add your deployed HabitStake contract. No stake or check-in
                    data is simulated.
                  </p>
                </div>
              </div>
              <MotionButton
                onClick={openSettings}
                className="button-outline shrink-0 text-sm"
              >
                Set contract <ArrowUpRight size={15} />
              </MotionButton>
            </motion.div>
          )}
          {web3.contractState === "checking" && (
            <motion.div
              key="checking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="setup-banner mb-6"
              role="status"
            >
              <div className="flex items-center gap-3">
                <Spinner className="h-5 w-5 text-[#00ff00]" />
                <p className="text-sm">
                  Verifying smart contract on {web3.chain.name}…
                </p>
              </div>
            </motion.div>
          )}
          {web3.contractState === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="risk-note mb-6"
              role="alert"
            >
              <TriangleAlert size={20} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm">{web3.readError}</p>
                <div className="mt-2 flex flex-wrap gap-4">
                  <MotionButton
                    className="text-sm underline underline-offset-4"
                    onClick={web3.refresh}
                  >
                    Retry connection
                  </MotionButton>
                  <MotionButton
                    className="text-sm underline underline-offset-4"
                    onClick={openSettings}
                    disabled={web3.busy}
                  >
                    Check address
                  </MotionButton>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {web3.wrongNetwork && (
          <div className="risk-note mb-6" role="alert">
            <TriangleAlert size={20} className="shrink-0" />
            <div className="flex-1 text-sm">
              MetaMask is on a different network. Data below belongs to{" "}
              {web3.chain.name}.
            </div>
            <MotionButton
              disabled={web3.busy}
              className="text-sm font-medium underline underline-offset-4"
              onClick={() => web3.selectNetwork(web3.selectedChainId)}
            >
              Switch wallet
            </MotionButton>
          </div>
        )}
        {web3.contractState === "ready" && web3.stale && web3.account && (
          <div className="risk-note mb-6">
            <Clock3 size={18} />
            <p className="text-sm">
              On-chain data is stale. Refresh before taking an action.
            </p>
          </div>
        )}

        {web3.busy && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="transaction-banner mb-6"
            role="status"
            aria-live="polite"
          >
            <span className="loading-halo">
              <Spinner className="h-6 w-6 text-[#00ff00]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {web3.connecting
                  ? "Connecting to BOT Chain…"
                  : web3.transaction.phase === "signature"
                    ? "Verifying transaction · review MetaMask"
                    : "Transaction submitted · awaiting confirmation"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                {web3.transaction.phase === "pending"
                  ? "Submission is not success. Your on-chain deadline continues while this transaction is pending."
                  : "Check the network, contract, amount, and gas before approving."}
              </p>
            </div>
            {web3.transaction.hash && (
              <div className="flex shrink-0 items-center gap-3">
                <a
                  className="text-sm text-[#00ff00] underline underline-offset-4"
                  href={`${web3.transaction.chainId === 968 ? "https://scan.bohr.life" : "https://scan.botchain.ai"}/tx/${web3.transaction.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Explorer
                </a>
                <MotionButton
                  aria-label="Manage pending transaction"
                  className="icon-button"
                  onClick={() => setModal("pending")}
                >
                  <Info size={17} />
                </MotionButton>
              </div>
            )}
          </motion.div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
          <Panel
            className="relative overflow-hidden p-6 sm:p-8"
            delay={0.04}
            aria-label="Active habit status"
          >
            <Celebration trigger={web3.celebration} />
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2.5 text-base font-semibold">
                <Target size={18} className="text-[#00ff00]" />
                Your daily commitment
              </h2>
              <span
                className={`status-badge ${state === "failed" ? "status-failed" : state === "empty" ? "status-neutral" : ""}`}
              >
                {["waiting", "claimed"].includes(state) && <Check size={12} />}
                {copy.label}
              </span>
            </div>
            <div className="mb-7 grid items-center gap-6 sm:grid-cols-[190px_minmax(0,1fr)]">
              <ProgressRing
                completed={completed}
                total={totalDays}
                state={state}
              />
              <div className="text-center sm:text-left">
                <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.035] px-2.5 py-1 text-xs text-zinc-400">
                  <Flame size={13} className="text-[#00ff00]" />
                  {hasHabit
                    ? `Commitment #${habit.id}`
                    : "Consistency starts with one day"}
                </div>
                <h3 className="text-2xl font-medium leading-[1.2] tracking-[-0.035em] sm:text-[1.7rem]">
                  {copy.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  {copy.description}
                </p>
              </div>
            </div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-[0.15em] text-zinc-500">
                {hasHabit ? "Your streak" : "Streak preview"}
              </span>
              <span className="text-xs text-zinc-500">
                {totalDays} × 24 hours
              </span>
            </div>
            <StreakGrid
              habit={habit}
              days={previewDays}
              state={state}
              selectedDay={selectedDay}
              onSelect={setSelectedDay}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/7 pt-4">
              <span className="flex items-center gap-2 text-sm text-zinc-400">
                <Clock3 size={15} />
                {state === "ready"
                  ? "Current window closes in"
                  : state === "waiting"
                    ? "Next window opens in"
                    : state === "complete"
                      ? "Principal unlocks in"
                      : state === "refundable"
                        ? "Ready to claim"
                        : "One check-in per window"}
              </span>
              <span
                className={`font-mono text-base ${targetTime ? "text-[#00ff00]" : "text-zinc-500"}`}
              >
                {targetTime ? countdown(targetTime, web3.now) : "24:00:00"}
              </span>
            </div>
            <MotionButton
              disabled={web3.account ? !primaryReady : web3.busy}
              onClick={
                !web3.account
                  ? web3.connect
                  : () =>
                      web3.submit(state === "refundable" ? "refund" : "checkIn")
              }
              className={`check-in-button mt-5 ${["waiting", "claimed", "complete"].includes(state) ? "check-in-complete" : ""}`}
            >
              <CheckInIcon size={24} strokeWidth={2.1} />
              <span>{checkInLabel}</span>
              {primaryReady && <ArrowRight className="ml-auto" size={21} />}
            </MotionButton>
            <p className="mt-3 text-center text-xs leading-relaxed text-zinc-500">
              {state === "ready"
                ? "Check in well before the deadline. Network delays do not extend a window."
                : state === "refundable"
                  ? "Original principal only. Keep some BOT in your wallet for claim gas."
                  : "A promise to yourself, recorded on-chain."}
            </p>
            <p className="mt-8 text-center text-sm text-zinc-500">
              HabitStake is officially launched on <a href="https://botchain.ai" target="_blank" className="underline">BOT Chain Mainnet</a>.
              <br />
              <a href="https://scan.botchain.ai" target="_blank" className="underline mt-2 inline-block">View on Explorer</a>
            </p>
          </Panel>

          <Panel
            id="new-commitment"
            delay={0.1}
            className="create-panel flex flex-col p-6 sm:p-7"
            aria-label="Start new habit"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="icon-tile">
                <Sparkles size={20} />
              </span>
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                Make it count
              </span>
            </div>
            <h2 className="mt-4 text-xl font-medium tracking-tight">
              Start a new habit
            </h2>
            <p className="mb-6 mt-2 text-sm leading-6 text-zinc-400">
              A little commitment. A reason to show up.
            </p>
            <form
              onSubmit={prepareCommitment}
              className="flex flex-1 flex-col"
              noValidate
            >
              <label
                htmlFor="stake-amount"
                className="mb-2 flex items-center justify-between text-sm text-zinc-300"
              >
                <span>Commitment amount</span>
                <span
                  className={
                    isMainnet
                      ? "text-xs text-amber-400"
                      : "text-xs text-zinc-500"
                  }
                >
                  {isMainnet ? "Real funds" : "Test tokens"}
                </span>
              </label>
              <div className="amount-input-wrap">
                <input
                  id="stake-amount"
                  name="amount"
                  inputMode="decimal"
                  type="text"
                  autoComplete="off"
                  value={amount}
                  disabled={web3.busy || !canReplace}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setRiskAccepted(false);
                  }}
                  onBlur={() => setFormTouched(true)}
                  aria-invalid={formTouched && !!validation.error}
                  aria-describedby="amount-hint"
                />
                <span className="token-badge">
                  <span className="token-symbol">B</span> BOT
                </span>
              </div>
              <div
                id="amount-hint"
                className="mb-5 mt-2 flex items-center justify-between gap-2 text-xs text-zinc-500"
              >
                <span>Balance: {formatBOT(web3.balance)} BOT</span>
                <span>Reserve BOT for gas</span>
              </div>
              <label htmlFor="duration" className="mb-2 text-sm text-zinc-300">
                Commitment duration
              </label>
              <div className="mb-3 grid grid-cols-3 gap-2">
                {[7, 14, 21].map((value) => (
                  <MotionButton
                    key={value}
                    onClick={() => {
                      setDays(value);
                      setRiskAccepted(false);
                    }}
                    disabled={web3.busy || !canReplace}
                    aria-pressed={Number(days) === value}
                    className={`duration-button ${Number(days) === value ? "duration-selected" : ""}`}
                  >
                    {value}
                    <span className="ml-1 text-xs font-normal">days</span>
                  </MotionButton>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/15 px-3 py-2.5">
                <label htmlFor="duration" className="text-sm text-zinc-400">
                  Or choose 1–90 days
                </label>
                <input
                  id="duration"
                  type="number"
                  min="1"
                  max="90"
                  step="1"
                  value={days}
                  disabled={web3.busy || !canReplace}
                  onChange={(event) => {
                    setDays(event.target.value);
                    setRiskAccepted(false);
                  }}
                  className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-right font-mono text-sm text-white"
                />
              </div>
              <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-[#00ff00]/10 bg-[#00ff00]/[0.035] p-3.5">
                <ShieldCheck
                  size={17}
                  className="mt-0.5 shrink-0 text-[#00ff00]"
                />
                <p className="text-xs leading-5 text-zinc-400">
                  Complete every check-in and the full duration to recover{" "}
                  <span className="text-zinc-200">100% of your principal</span>.
                  No yield. Gas is separate.
                </p>
              </div>
              <label className="risk-checkbox mt-5">
                <input
                  type="checkbox"
                  checked={riskAccepted}
                  disabled={web3.busy || !canReplace}
                  onChange={(event) => setRiskAccepted(event.target.checked)}
                />
                <span>
                  I understand: missing one 24-hour window permanently locks my
                  entire stake.
                </span>
              </label>
              {formTouched && validation.error && (
                <p className="mt-3 text-sm text-amber-300" role="alert">
                  {validation.error}
                </p>
              )}
              {!canReplace && (
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  Finish and refund your current commitment before starting
                  another.
                </p>
              )}
              <div className="mt-auto pt-5">
                <MotionButton
                  type="submit"
                  disabled={
                    !canWrite ||
                    !canReplace ||
                    !riskAccepted ||
                    !!validation.error
                  }
                  className="button-primary w-full py-3.5"
                >
                  <LockKeyhole size={17} />
                  Start commitment
                  <ArrowUpRight size={17} className="ml-auto" />
                </MotionButton>
              </div>
            </form>
            <MotionButton
              className="mx-auto mt-4 flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200"
              onClick={() => setModal("rules")}
            >
              <CircleHelp size={13} />
              Understand the commitment rules
            </MotionButton>
          </Panel>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          <Metric
            icon={LockKeyhole}
            label={
              state === "claimed"
                ? "Principal returned"
                : state === "failed"
                  ? "Permanently locked"
                  : "Committed principal"
            }
            note="Your original stake. Gas fees are separate."
            accent
            delay={0.14}
          >
            {hasHabit ? formatBOT(habit.stake) : "—"}
            <span className="text-sm font-normal text-zinc-500">BOT</span>
          </Metric>
          <Metric
            icon={CalendarDays}
            label="Commitment ends"
            note={
              hasHabit
                ? "Local time · contract timestamps are authoritative"
                : "Your start time is recorded when creation is mined."
            }
            delay={0.19}
          >
            {hasHabit ? (
              <span className="text-lg">{dateTime(habit.unlockAt)}</span>
            ) : (
              "—"
            )}
          </Metric>
          <Metric
            icon={Flame}
            label="Promises kept"
            note={
              hasHabit
                ? "Self-reported daily check-ins, not real-world verification."
                : "Your first check-in is separate from creating a habit."
            }
            delay={0.24}
          >
            {hasHabit ? completed : "—"}
            <span className="text-sm font-normal text-zinc-500">
              {hasHabit ? `of ${totalDays} check-ins` : "check-ins"}
            </span>
          </Metric>
        </div>

        <Panel
          delay={0.28}
          className="mt-5 flex flex-col gap-5 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3.5">
            <span className="rounded-xl border border-white/8 bg-white/3 p-2.5 text-zinc-400">
              <ShieldCheck size={20} />
            </span>
            <div>
              <h2 className="text-sm font-medium">
                Your commitment. Transparent rules.
              </h2>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                No admin withdrawals. No interest. No hidden recovery path.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {web3.chain.faucet && (
              <a
                className="button-quiet"
                href={web3.chain.faucet}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get test BOT <ArrowUpRight size={15} />
              </a>
            )}
            {web3.contractAddress ? (
              <a
                className="button-outline text-sm"
                href={`${web3.chain.explorer}/address/${web3.contractAddress}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View contract <ExternalLink size={14} />
              </a>
            ) : (
              <MotionButton
                className="button-outline text-sm"
                onClick={openSettings}
              >
                Contract setup <Settings2 size={15} />
              </MotionButton>
            )}
          </div>
        </Panel>

        {(web3.lastTransaction || web3.permanentlyLocked > 0n) && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {web3.lastTransaction && (
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                <p className="mb-2 text-xs text-zinc-500">
                  Most recent transaction in this session
                </p>
                <a
                  className="inline-flex items-center gap-2 font-mono text-sm text-[#00ff00]"
                  href={`${web3.lastTransaction.chainId === 968 ? "https://scan.bohr.life" : "https://scan.botchain.ai"}/tx/${web3.lastTransaction.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {shortAddress(web3.lastTransaction.hash)}
                  <ExternalLink size={14} />
                </a>
                <p className="mt-2 text-xs text-zinc-500">
                  {web3.lastTransaction.success
                    ? "Confirmed successfully"
                    : "Reverted"}{" "}
                  ·{" "}
                  {web3.lastTransaction.chainId === 968 ? "Testnet" : "Mainnet"}
                </p>
              </div>
            )}
            {web3.permanentlyLocked > 0n && (
              <div className="rounded-2xl border border-amber-400/15 bg-amber-400/3 p-4">
                <p className="text-xs text-amber-300">
                  Total permanently locked for this wallet
                </p>
                <p className="mt-2 font-mono text-lg">
                  {formatBOT(web3.permanentlyLocked)} BOT
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Includes previously missed commitments on this contract.
                </p>
              </div>
            )}
          </div>
        )}

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/6 pt-5 text-xs text-zinc-500">
          <p>
            HabitStake <span className="mx-2 text-zinc-700">/</span> Show up for
            yourself.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${web3.contractState === "ready" ? "bg-[#00ff00]" : "bg-zinc-600"}`}
              />
              {web3.contractState === "ready"
                ? "Contract responding"
                : "Not connected to contract"}
            </span>
            <span>Chain {web3.selectedChainId}</span>
            <MotionButton
              className="hover:text-white"
              onClick={() => setModal("rules")}
            >
              Rules & risks
            </MotionButton>
          </div>
        </footer>
      </main>

      <Dialog
        open={modal === "rules"}
        onClose={() => setModal("")}
        title="A commitment with clear rules"
      >
        <Rules />
      </Dialog>
      <Dialog
        open={modal === "settings"}
        onClose={() => setModal("")}
        title="Connect your contract"
      >
        <p className="mb-5 text-sm leading-6 text-zinc-400">
          Use the HabitStake address deployed on{" "}
          <strong className="text-zinc-200">{web3.chain.name}</strong> (chain{" "}
          {web3.selectedChainId}). This setting is saved only on this device.
          For a public release, configure the address in the build environment.
        </p>
        <form onSubmit={saveAddress}>
          <label className="mb-2 block text-sm" htmlFor="contract-address">
            Deployed contract address
          </label>
          <input
            autoFocus
            id="contract-address"
            value={addressInput}
            onChange={(event) => setAddressInput(event.target.value)}
            spellCheck="false"
            autoComplete="off"
            className="text-field font-mono text-sm"
            aria-invalid={!!addressError}
            aria-describedby="address-note"
          />
          <p id="address-note" className="mt-2 text-xs leading-5 text-zinc-500">
            Copy the complete 0x address from Remix or the official explorer.
            Never enter a recovery phrase or private key.
          </p>
          {addressError && (
            <p role="alert" className="mt-3 text-sm text-amber-400">
              {addressError}
            </p>
          )}
          <MotionButton
            type="submit"
            className="button-primary mt-6 w-full"
            disabled={web3.busy}
          >
            Save & verify contract <ArrowRight size={17} />
          </MotionButton>
        </form>
        <a
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 underline underline-offset-4"
          href="https://remix.ethereum.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open Remix IDE <ExternalLink size={14} />
        </a>
      </Dialog>
      <Dialog
        open={modal === "wallet"}
        onClose={() => setModal("")}
        title="Your connected wallet"
      >
        <div className="mb-5 rounded-2xl border border-white/10 bg-white/3 p-4">
          <p className="text-xs text-zinc-500">
            MetaMask ·{" "}
            {web3.wrongNetwork ? "Network mismatch" : web3.chain.name}
          </p>
          <p className="mt-3 break-all font-mono text-sm leading-6 text-white">
            {web3.account}
          </p>
          <p className="mt-3 font-mono text-lg text-[#00ff00]">
            {formatBOT(web3.balance, 6)} BOT
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MotionButton
            className="button-outline justify-center"
            onClick={copyAddress}
          >
            <Copy size={16} />
            Copy address
          </MotionButton>
          <MotionButton
            className="button-outline justify-center"
            disabled={web3.busy}
            onClick={() => {
              web3.disconnect();
              setModal("");
            }}
          >
            <LogOut size={16} />
            Disconnect
          </MotionButton>
        </div>
        <p className="mt-5 text-xs leading-5 text-zinc-500">
          Disconnecting does not pause the habit or its deadlines. On mobile,
          open this site inside MetaMask’s browser.
        </p>
      </Dialog>
      <Dialog
        open={modal === "confirm" && !!draft}
        onClose={() => setModal("")}
        title="Ready to keep your word?"
      >
        {draft && (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/3 p-4">
                <span className="text-xs text-zinc-400">Principal at risk</span>
                <p className="mt-2 font-mono text-xl">
                  {draft.amount}{" "}
                  <span className="text-sm text-zinc-500">BOT</span>
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/3 p-4">
                <span className="text-xs text-zinc-400">Full duration</span>
                <p className="mt-2 font-mono text-xl">
                  {draft.days}{" "}
                  <span className="text-sm text-zinc-500">days</span>
                </p>
              </div>
            </div>
            <div className="risk-note">
              <TriangleAlert size={20} className="mt-0.5 shrink-0" />
              <p className="text-sm leading-6">
                The first check-in is <strong>not automatic</strong>. Missing
                any window permanently locks the full {draft.amount} BOT. There
                is no cancellation, grace period, or administrator recovery.
              </p>
            </div>
            <p className="mt-4 break-all text-xs leading-5 text-zinc-500">
              Network: {web3.chain.name}
              <br />
              Contract: {draft.contract}
              <br />
              Wallet: {draft.account}
            </p>
            {isMainnet && (
              <label className="risk-checkbox mt-5">
                <input
                  type="checkbox"
                  checked={mainnetAccepted}
                  onChange={(event) => setMainnetAccepted(event.target.checked)}
                />
                <span>
                  I understand this uses real BOT on mainnet, and the contract
                  is not independently audited.
                </span>
              </label>
            )}
            <MotionButton
              disabled={web3.busy || (isMainnet && !mainnetAccepted)}
              onClick={confirmCommitment}
              className="button-primary mt-6 w-full"
            >
              <LockKeyhole size={17} />
              {isMainnet
                ? "Lock real BOT in MetaMask"
                : "Commit test BOT in MetaMask"}
            </MotionButton>
            <p className="mt-3 text-center text-xs text-zinc-500">
              Review the final transaction and gas inside your wallet.
            </p>
          </>
        )}
      </Dialog>
      <Dialog
        open={modal === "pending"}
        onClose={() => setModal("")}
        title="A transaction is still pending"
      >
        <p className="text-sm leading-6 text-zinc-300">
          HabitStake is waiting for a real receipt. If you sped up or cancelled
          this transaction and the interface has not updated, verify its final
          status in MetaMask and the explorer.
        </p>
        <p className="mt-4 text-sm leading-6 text-amber-300">
          Stopping tracking does not cancel a transaction. It may still be mined
          and change your commitment.
        </p>
        <MotionButton
          className="button-outline mt-6 w-full justify-center"
          onClick={() => {
            web3.stopTracking();
            setModal("");
          }}
        >
          I checked my wallet · stop tracking
        </MotionButton>
      </Dialog>
      <Toast notice={web3.notice} onDismiss={web3.dismissNotice} />
    </div>
  );
}
