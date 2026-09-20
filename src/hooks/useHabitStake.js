import { useCallback, useEffect, useRef, useState } from "react";
import {
  BrowserProvider,
  Contract,
  FetchRequest,
  JsonRpcProvider,
  ZeroAddress,
} from "ethers";
import {
  CHAINS,
  CONTRACT_ABI,
  DEFAULT_CHAIN_ID,
  cleanAddress,
  loadAddress,
  readLocal,
  walletNetworkParameters,
  writeLocal,
} from "../lib/chains.js";
import {
  friendlyError,
  normalizeHabit,
  userError,
  validateCommitment,
} from "../lib/habit.js";

const PENDING_KEY = "habitstake:pending";
const EMPTY_TX = {
  phase: "idle",
  kind: "",
  hash: "",
  chainId: null,
  account: "",
};

function readProvider(chainId) {
  const request = new FetchRequest(CHAINS[chainId].rpc);
  request.timeout = 10000;
  return new JsonRpcProvider(request, chainId, {
    staticNetwork: true,
    batchMaxCount: 1,
    cacheTimeout: 0,
  });
}

export function useHabitStake() {
  const [selectedChainId, setSelectedChainId] = useState(DEFAULT_CHAIN_ID);
  const [contractAddress, setContractAddress] = useState(() =>
    loadAddress(DEFAULT_CHAIN_ID),
  );
  const [rawWallet, setRawWallet] = useState(null);
  const [account, setAccount] = useState("");
  const [walletChainId, setWalletChainId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [balance, setBalance] = useState(null);
  const [permanentlyLocked, setPermanentlyLocked] = useState(0n);
  const [contractState, setContractState] = useState("unconfigured");
  const [readError, setReadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [transaction, setTransaction] = useState(() => {
    const saved = readLocal(PENDING_KEY);
    return saved &&
      /^0x[0-9a-f]{64}$/i.test(saved.hash) &&
      CHAINS[saved.chainId]
      ? { ...saved, phase: "pending" }
      : EMPTY_TX;
  });
  const [lastTransaction, setLastTransaction] = useState(null);
  const [notice, setNotice] = useState(null);
  const [celebration, setCelebration] = useState(0);
  const [tick, setTick] = useState(0);
  const inFlight = useRef(false);
  const walletWatcher = useRef(null);
  const trackedHash = useRef(transaction.hash);
  trackedHash.current = transaction.hash;
  const sequence = useRef(0);
  const activeContext = useRef("");
  const disconnected = useRef(readLocal("habitstake:disconnected", false));
  const context = `${selectedChainId}:${contractAddress}:${account}`;
  activeContext.current = context;
  const chain = CHAINS[selectedChainId];

  const notify = useCallback(
    (type, message, link) => setNotice({ type, message, link, id: Date.now() }),
    [],
  );
  const dismissNotice = useCallback(() => setNotice(null), []);
  const busy =
    connecting || ["signature", "pending"].includes(transaction.phase);

  useEffect(() => () => walletWatcher.current?.destroy(), []);

  useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // EIP-6963 prefers MetaMask when more than one injected wallet is installed.
  useEffect(() => {
    const choose = (provider) => {
      if (
        provider?.isMetaMask &&
        !provider.isBraveWallet &&
        !provider.isPhantom
      )
        setRawWallet(provider);
    };
    const announce = (event) => {
      if (event.detail?.info?.rdns === "io.metamask")
        choose(event.detail.provider);
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const candidates = window.ethereum?.providers || [window.ethereum];
    candidates.forEach(choose);
    return () =>
      window.removeEventListener("eip6963:announceProvider", announce);
  }, []);

  useEffect(() => {
    if (!rawWallet) return;
    let disposed = false;
    const accountsChanged = (accounts) => {
      if (disposed || disconnected.current) return;
      setAccount(cleanAddress(accounts?.[0] || ""));
      setSnapshot(null);
    };
    const chainChanged = (hexId) => {
      if (!disposed) {
        setWalletChainId(Number(hexId));
        setSnapshot(null);
      }
    };
    const walletDisconnected = () => {
      if (!disposed) {
        setAccount("");
        setWalletChainId(null);
        setSnapshot(null);
      }
    };
    rawWallet.on?.("accountsChanged", accountsChanged);
    rawWallet.on?.("chainChanged", chainChanged);
    rawWallet.on?.("disconnect", walletDisconnected);
    Promise.all([
      rawWallet.request({ method: "eth_accounts" }),
      rawWallet.request({ method: "eth_chainId" }),
    ])
      .then(([accounts, hexId]) => {
        accountsChanged(accounts);
        chainChanged(hexId);
      })
      .catch(() => {
        /* Silent discovery must never trigger an authorization popup. */
      });
    return () => {
      disposed = true;
      rawWallet.removeListener?.("accountsChanged", accountsChanged);
      rawWallet.removeListener?.("chainChanged", chainChanged);
      rawWallet.removeListener?.("disconnect", walletDisconnected);
    };
  }, [rawWallet]);

  const switchWallet = useCallback(
    async (target) => {
      if (!rawWallet)
        throw userError(
          "Install MetaMask, or open this site inside the MetaMask mobile browser.",
        );
      try {
        await rawWallet.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: target.hexId }],
        });
      } catch (error) {
        if (
          [
            error?.code,
            error?.data?.originalError?.code,
            error?.info?.error?.code,
          ].includes(4902)
        ) {
          await rawWallet.request({
            method: "wallet_addEthereumChain",
            params: [walletNetworkParameters(target)],
          });
          await rawWallet.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: target.hexId }],
          });
        } else throw error;
      }
      const actual = Number(await rawWallet.request({ method: "eth_chainId" }));
      setWalletChainId(actual);
      if (actual !== target.id)
        throw userError(`Select ${target.name} inside MetaMask to continue.`);
    },
    [rawWallet],
  );

  const connect = useCallback(async () => {
    if (busy) return;
    setConnecting(true);
    try {
      if (!rawWallet)
        throw userError(
          "MetaMask was not found. Install it on desktop, or use its in-app browser on mobile.",
        );
      const accounts = await rawWallet.request({
        method: "eth_requestAccounts",
      });
      const address = cleanAddress(accounts[0]);
      if (!address) throw userError("Choose an account in MetaMask.");
      disconnected.current = false;
      writeLocal("habitstake:disconnected", false);
      setAccount(address);
      await switchWallet(chain);
      notify("success", `Connected to ${chain.name}.`);
    } catch (error) {
      notify("error", friendlyError(error));
    } finally {
      setConnecting(false);
    }
  }, [busy, rawWallet, switchWallet, chain, notify]);

  const disconnect = useCallback(() => {
    if (busy) return;
    disconnected.current = true;
    writeLocal("habitstake:disconnected", true);
    setAccount("");
    setSnapshot(null);
    setBalance(null);
    notify(
      "info",
      "Disconnected from this interface. Manage site permissions separately in MetaMask.",
    );
  }, [busy, notify]);

  const selectNetwork = useCallback(
    async (id) => {
      const target = CHAINS[Number(id)];
      if (!target || busy) return;
      if (account) {
        setConnecting(true);
        try {
          await switchWallet(target);
        } catch (error) {
          notify("error", friendlyError(error));
          return;
        } finally {
          setConnecting(false);
        }
      }
      setSelectedChainId(target.id);
      setContractAddress(loadAddress(target.id));
      setSnapshot(null);
      setBalance(null);
    },
    [account, busy, switchWallet, notify],
  );

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    const requestContext = context;
    setRefreshing(true);
    setReadError("");
    if (!contractAddress) {
      setContractState("unconfigured");
      setSnapshot(null);
      setBalance(null);
      setRefreshing(false);
      return;
    }
    setContractState((previous) =>
      previous === "ready" ? previous : "checking",
    );
    const reader = readProvider(selectedChainId);
    try {
      const contract = new Contract(contractAddress, CONTRACT_ABI, reader);
      const code = await reader.getCode(contractAddress);
      if (code === "0x")
        throw userError(
          `No contract exists at this address on ${chain.name}. Check your deployment and selected network.`,
        );
      const [day, maxDays, result, funds, lost] = await Promise.all([
        contract.DAY(),
        contract.MAX_DAYS(),
        contract.getHabit(account || ZeroAddress),
        account ? reader.getBalance(account) : Promise.resolve(null),
        account ? contract.permanentlyLocked(account) : Promise.resolve(0n),
      ]);
      if (day !== 86400n || maxDays !== 90n)
        throw userError(
          "This contract has different commitment rules. Use the supplied 24-hour HabitStake contract.",
        );
      if (
        request !== sequence.current ||
        requestContext !== activeContext.current
      )
        return;
      setContractState("ready");
      setBalance(funds);
      setPermanentlyLocked(lost);
      setSnapshot({
        ...normalizeHabit(result),
        sampledAt: performance.now(),
        context: requestContext,
      });
    } catch (error) {
      if (
        request !== sequence.current ||
        requestContext !== activeContext.current
      )
        return;
      setContractState("error");
      setReadError(friendlyError(error));
    } finally {
      reader.destroy();
      if (request === sequence.current) setRefreshing(false);
    }
  }, [context, contractAddress, selectedChainId, account, chain.name]);

  useEffect(() => {
    setSnapshot(null);
    setBalance(null);
    setContractState(contractAddress ? "checking" : "unconfigured");
    refresh();
    const interval = setInterval(refresh, 15000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      sequence.current++;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, contractAddress]);

  const saveContract = useCallback(
    (value) => {
      if (busy)
        throw userError(
          "Finish the current wallet operation before changing the contract.",
        );
      const address = cleanAddress(value);
      if (!address)
        throw userError("Enter a valid nonzero EVM contract address.");
      const stored = writeLocal(
        `habitstake:contract:${selectedChainId}`,
        address,
      );
      setContractAddress(address);
      setSnapshot(null);
      notify(
        "info",
        stored
          ? "Address saved on this device. Checking the contract now…"
          : "Using this address for this session; browser storage is unavailable.",
      );
    },
    [busy, selectedChainId, notify],
  );

  const completeTransaction = useCallback(
    async (receipt, tx) => {
      writeLocal(PENDING_KEY, null);
      trackedHash.current = "";
      walletWatcher.current?.destroy();
      walletWatcher.current = null;
      inFlight.current = false;
      setTransaction(EMPTY_TX);
      setLastTransaction({
        ...tx,
        hash: receipt.hash || tx.hash,
        success: Number(receipt.status) === 1,
      });
      if (Number(receipt.status) !== 1) {
        notify(
          "error",
          "The transaction was mined but reverted. No contract state changed; gas was spent.",
          `${CHAINS[tx.chainId].explorer}/tx/${receipt.hash || tx.hash}`,
        );
      } else {
        const messages = {
          create:
            "Commitment created. Your first 24-hour window is open—check in now.",
          checkIn: "Check-in confirmed. Another promise kept.",
          refund: "Principal returned to your wallet. Commitment complete.",
        };
        notify(
          "success",
          messages[tx.kind] || "Transaction confirmed.",
          `${CHAINS[tx.chainId].explorer}/tx/${receipt.hash || tx.hash}`,
        );
        if (tx.kind === "checkIn" || tx.kind === "refund")
          setCelebration((value) => value + 1);
      }
      await refresh();
    },
    [notify, refresh],
  );

  // Resume receipt tracking after a reload. Stored data is only a public tx hash,
  // not fabricated chain state. Failed reads keep the pending state conservative.
  useEffect(() => {
    if (transaction.phase !== "pending" || !transaction.hash) return;
    let disposed = false;
    let polling = false;
    const rpc = readProvider(transaction.chainId);
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const receipt = await rpc.getTransactionReceipt(transaction.hash);
        if (receipt && !disposed)
          await completeTransaction(receipt, transaction);
      } catch {
        /* Keep the explorer link and pending state until a real receipt exists. */
      } finally {
        polling = false;
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      disposed = true;
      clearInterval(interval);
      rpc.destroy();
    };
  }, [transaction, completeTransaction]);

  const submit = useCallback(
    async (kind, options = {}) => {
      if (inFlight.current || busy) return false;
      inFlight.current = true;
      let submitted = false;
      let walletProvider;
      const sentContext = context;
      try {
        if (!rawWallet || !account) throw userError("Connect MetaMask first.");
        if (!contractAddress || contractState !== "ready")
          throw userError("Configure and verify your deployed contract first.");
        const accounts = await rawWallet.request({ method: "eth_accounts" });
        const actualChain = Number(
          await rawWallet.request({ method: "eth_chainId" }),
        );
        if (actualChain !== selectedChainId)
          throw userError(`Switch your wallet to ${chain.name}.`);
        if (accounts[0]?.toLowerCase() !== account.toLowerCase())
          throw userError(
            "Your wallet account changed. Refresh before continuing.",
          );
        setTransaction({
          ...EMPTY_TX,
          phase: "signature",
          kind,
          chainId: selectedChainId,
          account,
        });
        walletProvider = new BrowserProvider(rawWallet, "any", {
          cacheTimeout: 0,
        });
        const signer = await walletProvider.getSigner(account);
        const contract = new Contract(contractAddress, CONTRACT_ABI, signer);
        let method;
        let args;
        let value = 0n;
        if (kind === "create") {
          const validation = validateCommitment(options.amount, options.days);
          if (validation.error) throw userError(validation.error);
          value = validation.value;
          method = contract.createHabit;
          args = [validation.days, value, { value }];
        } else if (kind === "checkIn") {
          method = contract.checkIn;
          args = [];
        } else if (kind === "refund") {
          method = contract.claimRefund;
          args = [];
        } else throw userError("Unknown contract action.");

        await method.staticCall(...args);
        const estimatedGas = await method.estimateGas(...args);
        const gasLimit = estimatedGas + estimatedGas / 5n;
        const [funds, fees] = await Promise.all([
          walletProvider.getBalance(account),
          walletProvider.getFeeData(),
        ]);
        const gasPrice = fees.maxFeePerGas ?? fees.gasPrice;
        if (gasPrice != null && funds < value + gasLimit * gasPrice)
          throw userError(
            "Not enough BOT for this stake plus estimated gas. Reduce the amount or fund your wallet.",
          );
        if (activeContext.current !== sentContext)
          throw userError(
            "Your account, network, or contract changed. Please try again.",
          );
        if (
          Number(await rawWallet.request({ method: "eth_chainId" })) !==
          selectedChainId
        )
          throw userError("The wallet network changed before submission.");
        const currentAccounts = await rawWallet.request({
          method: "eth_accounts",
        });
        if (currentAccounts[0]?.toLowerCase() !== account.toLowerCase())
          throw userError("The wallet account changed before submission.");
        const tx =
          kind === "create"
            ? await method(options.days, value, { value, gasLimit })
            : await method({ gasLimit });
        const pending = {
          phase: "pending",
          kind,
          hash: tx.hash,
          chainId: selectedChainId,
          account,
        };
        writeLocal(PENDING_KEY, pending);
        trackedHash.current = pending.hash;
        walletWatcher.current = walletProvider;
        setTransaction(pending);
        submitted = true;
        // Follow MetaMask replacement/speed-up receipts in this browser session.
        tx.wait(1)
          .then((receipt) => {
            if (trackedHash.current !== pending.hash) return;
            // The polling effect handles normal receipts; this handles replacements.
            if (receipt && receipt.hash !== tx.hash)
              setTransaction({ ...pending, hash: receipt.hash });
          })
          .catch((error) => {
            if (trackedHash.current !== pending.hash) return;
            if (error.code === "TRANSACTION_REPLACED" && error.receipt) {
              if (error.cancelled) {
                trackedHash.current = "";
                writeLocal(PENDING_KEY, null);
                setTransaction(EMPTY_TX);
                inFlight.current = false;
                notify(
                  "info",
                  "The pending operation was replaced or cancelled. Refresh to see the current on-chain state.",
                );
                refresh();
              } else {
                const replacement = { ...pending, hash: error.receipt.hash };
                trackedHash.current = replacement.hash;
                writeLocal(PENDING_KEY, replacement);
                setTransaction(replacement);
              }
            }
          })
          .finally(() => {
            walletProvider.destroy();
            if (walletWatcher.current === walletProvider)
              walletWatcher.current = null;
          });
        return true;
      } catch (error) {
        setTransaction(EMPTY_TX);
        notify("error", friendlyError(error));
        return false;
      } finally {
        if (!submitted) {
          inFlight.current = false;
          walletProvider?.destroy();
        }
      }
    },
    [
      busy,
      context,
      rawWallet,
      account,
      contractAddress,
      contractState,
      selectedChainId,
      chain.name,
      notify,
      refresh,
    ],
  );

  const stopTracking = useCallback(() => {
    if (transaction.phase !== "pending") return;
    trackedHash.current = "";
    walletWatcher.current?.destroy();
    walletWatcher.current = null;
    writeLocal(PENDING_KEY, null);
    setTransaction(EMPTY_TX);
    inFlight.current = false;
    notify(
      "info",
      "Tracking stopped, not the transaction. It can still be mined. Check your wallet before starting another operation.",
    );
    refresh();
  }, [transaction.phase, notify, refresh]);

  const current = snapshot?.context === context ? snapshot : null;
  const elapsed = current ? (performance.now() - current.sampledAt) / 1000 : 0;
  // tick rerenders this estimate; the contract, not the device clock, is authoritative.
  void tick;
  const now = current ? current.chainTimestamp + elapsed : 0;
  const stale = !current || elapsed > 90;
  return {
    chain,
    selectedChainId,
    contractAddress,
    account,
    walletChainId,
    balance,
    permanentlyLocked,
    hasMetaMask: !!rawWallet,
    connecting,
    busy,
    snapshot: account ? current : null,
    now,
    stale,
    contractState,
    readError,
    refreshing,
    transaction,
    lastTransaction,
    notice,
    celebration,
    wrongNetwork: !!account && walletChainId !== selectedChainId,
    connect,
    disconnect,
    selectNetwork,
    refresh,
    saveContract,
    submit,
    stopTracking,
    dismissNotice,
    notify,
  };
}
