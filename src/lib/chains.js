import { getAddress, isAddress, ZeroAddress } from "ethers";

const env = import.meta.env || {};
export const CHAINS = Object.freeze({
  968: {
    id: 968,
    hexId: "0x3c8",
    name: "BOT Chain Testnet",
    shortName: "Testnet",
    rpc: env.VITE_BOT_TESTNET_RPC_URL || "https://rpc.bohr.life",
    explorer: "https://scan.bohr.life",
    faucet: "https://faucet.botchain.ai/basic",
    configuredAddress: env.VITE_BOT_TESTNET_CONTRACT_ADDRESS || "",
  },
  677: {
    id: 677,
    hexId: "0x2a5",
    name: "BOT Chain Mainnet",
    shortName: "Mainnet",
    rpc: env.VITE_BOT_MAINNET_RPC_URL || "https://rpc.botchain.ai",
    explorer: "https://scan.botchain.ai",
    faucet: null,
    configuredAddress: env.VITE_BOT_MAINNET_CONTRACT_ADDRESS || "",
  },
});

export const DEFAULT_CHAIN_ID =
  Number(env.VITE_DEFAULT_CHAIN_ID) === 677 ? 677 : 968;
export const CONTRACT_ABI = [
  "function DAY() view returns (uint256)",
  "function MAX_DAYS() view returns (uint256)",
  "function habitCount() view returns (uint64)",
  "function createHabit(uint256 days_, uint256 stakeAmount) payable returns (uint64 habitId)",
  "function checkIn()",
  "function claimRefund()",
  "function permanentlyLocked(address user) view returns (uint256)",
  "function forfeitedStake(address) view returns (uint256)",
  "function getHabit(address user) view returns ((uint256 stake,uint64 startedAt,uint64 id,uint16 totalDays,uint16 completedDays,bool claimed) habit,uint8 status,uint256 nextCheckInAt,uint256 deadline,uint256 unlockAt,uint256 chainTimestamp)",
  "event HabitCreated(address indexed user,uint64 indexed habitId,uint256 stake,uint256 totalDays,uint256 startedAt)",
  "event CheckedIn(address indexed user,uint64 indexed habitId,uint256 dayNumber,uint256 timestamp)",
  "event StreakCompleted(address indexed user,uint64 indexed habitId,uint256 unlockAt)",
  "event RefundClaimed(address indexed user,uint64 indexed habitId,uint256 amount)",
  "event StakeForfeited(address indexed user,uint64 indexed habitId,uint256 amount)",
  "error InvalidDuration()",
  "error InvalidStake()",
  "error UnfinishedHabit()",
  "error NoHabit()",
  "error AlreadyCheckedIn(uint256 nextWindowAt)",
  "error MissedWindow()",
  "error StreakAlreadyComplete()",
  "error IncompleteStreak()",
  "error RefundNotReady(uint256 unlockAt)",
  "error AlreadyClaimed()",
  "error RefundTransferFailed()",
  "error ReentrantCall()",
  "error DirectTransfersDisabled()",
];

export function cleanAddress(value) {
  const input = String(value || "").trim();
  return isAddress(input) && input.toLowerCase() !== ZeroAddress
    ? getAddress(input)
    : "";
}

export function readLocal(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadAddress(chainId) {
  return cleanAddress(
    readLocal(`habitstake:contract:${chainId}`, "") ||
      CHAINS[chainId].configuredAddress,
  );
}

export function walletNetworkParameters(chain) {
  return {
    chainId: chain.hexId,
    chainName: chain.name,
    nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
    rpcUrls: [chain.rpc],
    blockExplorerUrls: [chain.explorer],
  };
}
