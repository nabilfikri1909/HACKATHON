import { formatEther, Interface, parseEther } from "ethers";
import { CONTRACT_ABI } from "./chains.js";

export const STATUS = Object.freeze({
  NONE: 0,
  ACTIVE: 1,
  COMPLETED: 2,
  FAILED: 3,
  CLAIMED: 4,
});
export const DAY_SECONDS = 86400;
const contractInterface = new Interface(CONTRACT_ABI);

export function normalizeHabit(result) {
  const h = result.habit;
  return {
    stake: h.stake,
    startedAt: Number(h.startedAt),
    id: Number(h.id),
    totalDays: Number(h.totalDays),
    completedDays: Number(h.completedDays),
    claimed: h.claimed,
    status: Number(result.status),
    nextCheckInAt: Number(result.nextCheckInAt),
    deadline: Number(result.deadline),
    unlockAt: Number(result.unlockAt),
    chainTimestamp: Number(result.chainTimestamp),
  };
}

export function displayState(habit, now) {
  if (!habit || habit.status === STATUS.NONE) return "empty";
  if (habit.status === STATUS.CLAIMED) return "claimed";
  if (habit.status === STATUS.FAILED) return "failed";
  if (habit.status === STATUS.COMPLETED)
    return now >= habit.unlockAt ? "refundable" : "complete";
  if (now >= habit.deadline) return "failed";
  return now >= habit.nextCheckInAt ? "ready" : "waiting";
}

export function validateCommitment(amount, days) {
  if (
    !Number.isInteger(Number(days)) ||
    Number(days) < 1 ||
    Number(days) > 90
  ) {
    return { error: "Choose a whole number of days from 1 to 90." };
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(String(amount).trim())) {
    return { error: "Enter a BOT amount with up to 18 decimal places." };
  }
  try {
    const value = parseEther(String(amount).trim());
    if (value <= 0n)
      return { error: "Your commitment must be greater than zero." };
    return { value, days: Number(days) };
  } catch {
    return { error: "This amount cannot be represented as a BOT transaction." };
  }
}

export function formatBOT(wei, digits = 4) {
  if (wei == null) return "—";
  const text = formatEther(wei);
  const [whole, decimal = ""] = text.split(".");
  if (wei > 0n && Number(text) < 10 ** -digits)
    return `<0.${"0".repeat(digits - 1)}1`;
  const trimmed = decimal.slice(0, digits).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export function shortAddress(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
}
export function countdown(until, now) {
  if (!until) return "—";
  const seconds = Math.max(0, Math.ceil(until - now));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
export function dateTime(timestamp) {
  return timestamp
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(timestamp * 1000))
    : "—";
}

export function friendlyError(error) {
  const codes = [
    error?.code,
    error?.error?.code,
    error?.info?.error?.code,
    error?.cause?.code,
  ];
  if (codes.some((code) => code === 4001 || code === "ACTION_REJECTED"))
    return "You declined the wallet request. Nothing was submitted.";
  if (codes.some((code) => code === -32002))
    return "A request is already open in MetaMask. Open your wallet to continue.";
  if (codes.includes("INSUFFICIENT_FUNDS"))
    return "Not enough BOT. Keep some BOT available for gas in addition to your stake.";
  if (codes.includes("NETWORK_ERROR"))
    return "The wallet network changed or the RPC is unavailable. Reconnect to your selected BOT network.";
  if (codes.includes("TIMEOUT"))
    return "Confirmation is taking longer than expected. Check the transaction in the explorer before retrying.";
  const messages = {
    InvalidDuration: "Choose between 1 and 90 days.",
    InvalidStake: "The stake must be positive and match the BOT sent.",
    UnfinishedHabit:
      "Finish your current commitment and claim its refund before starting another.",
    NoHabit: "Create your commitment first.",
    AlreadyCheckedIn:
      "This window is already checked in. Wait for the next window.",
    MissedWindow:
      "A required 24-hour window was missed. This stake is permanently locked.",
    StreakAlreadyComplete:
      "Every check-in is already complete. Wait for the refund unlock time.",
    IncompleteStreak: "Complete every required check-in before claiming.",
    RefundNotReady: "Your full commitment period has not ended yet.",
    AlreadyClaimed: "This refund has already been claimed.",
    RefundTransferFailed:
      "Your wallet could not receive the refund. The claim remains available.",
    ReentrantCall: "A nested transaction was blocked for safety.",
    DirectTransfersDisabled:
      "Use Start commitment instead of sending BOT directly.",
  };
  for (const data of [
    error?.data,
    error?.error?.data,
    error?.info?.error?.data?.result,
    error?.info?.error?.data,
  ]) {
    if (typeof data !== "string") continue;
    try {
      const name = contractInterface.parseError(data)?.name;
      if (messages[name]) return messages[name];
    } catch {
      /* Not ABI revert data. */
    }
  }
  if (error?.revert?.name && messages[error.revert.name])
    return messages[error.revert.name];
  if (/insufficient funds/i.test(error?.message || ""))
    return "Keep enough BOT in your wallet for both the stake and gas fees.";
  if (error?.isUserFacing) return error.message;
  return "The request could not be completed. Check your wallet, connection, and selected contract, then refresh.";
}

export function userError(message) {
  return Object.assign(new Error(message), { isUserFacing: true });
}
