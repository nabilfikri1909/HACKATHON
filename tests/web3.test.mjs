import assert from "node:assert/strict";
import fs from "node:fs";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import ganache from "ganache";
import { BrowserProvider, ContractFactory, parseEther } from "ethers";
import { CHAINS } from "../src/lib/chains.js";
import { useHabitStake } from "../src/hooks/useHabitStake.js";

// This exercises the actual React hook against an actual local EVM. The
// EIP-1193 adapter simulates wallet permissions, not contract results or receipts.
// A real MetaMask extension and public BOT RPC still require a manual smoke test.
const artifact = JSON.parse(
  fs.readFileSync(new URL("../artifacts/HabitStake.json", import.meta.url)),
);
const originalRpc = CHAINS[968].rpc;
let server, provider, signer, contract, dom, root, wallet, api;
const globals = new Map();

class TestWallet extends EventEmitter {
  isMetaMask = true;
  authorized = false;
  networkAdded = false;
  rejectTransaction = false;
  rejectSwitch = false;
  requests = [];

  async request(request) {
    this.requests.push(request.method);
    if (request.method === "eth_accounts" && !this.authorized) return [];
    if (request.method === "eth_requestAccounts") {
      this.authorized = true;
      return server.provider.request({ method: "eth_accounts" });
    }
    if (request.method === "wallet_switchEthereumChain") {
      if (this.rejectSwitch)
        throw Object.assign(new Error("User rejected network change"), {
          code: 4001,
        });
      if (!this.networkAdded)
        throw Object.assign(new Error("Unknown chain"), { code: 4902 });
      assert.equal(request.params[0].chainId, "0x3c8");
      return null;
    }
    if (request.method === "wallet_addEthereumChain") {
      assert.equal(request.params[0].chainId, "0x3c8");
      assert.equal(request.params[0].nativeCurrency.symbol, "BOT");
      this.networkAdded = true;
      return null;
    }
    if (request.method === "eth_sendTransaction" && this.rejectTransaction) {
      throw Object.assign(new Error("User rejected transaction"), {
        code: 4001,
      });
    }
    return server.provider.request(request);
  }
}

function Probe() {
  api = useHabitStake();
  return null;
}

async function until(predicate, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await act(async () => {
      await delay(40);
    });
    if (predicate()) return;
  }
  assert.fail(
    `${label}; current error: ${api?.notice?.message || api?.readError || "none"}`,
  );
}

async function mount() {
  root = createRoot(document.getElementById("root"));
  await act(async () => {
    root.render(
      React.createElement(React.StrictMode, null, React.createElement(Probe)),
    );
  });
  await until(() => api.hasMetaMask, "Wallet discovery");
}

async function connect() {
  await act(async () => {
    await api.connect();
  });
  await until(
    () => api.account && api.contractState === "ready" && api.snapshot,
    "Wallet connection and contract read",
  );
}

async function submit(kind, options) {
  let submitted;
  await act(async () => {
    submitted = await api.submit(kind, options);
  });
  return submitted;
}

beforeEach(async () => {
  server = ganache.server({
    logging: { quiet: true },
    chain: {
      chainId: 968,
      hardfork: "shanghai",
      time: new Date("2026-09-19T00:00:00Z"),
    },
    miner: { timestampIncrement: 0 },
    wallet: { totalAccounts: 3, defaultBalance: 100 },
  });
  await server.listen(0, "127.0.0.1");
  CHAINS[968].rpc = `http://127.0.0.1:${server.address().port}`;
  provider = new BrowserProvider(server.provider, "any", { cacheTimeout: 0 });
  signer = await provider.getSigner(0);
  contract = await new ContractFactory(
    artifact.abi,
    artifact.bytecode,
    signer,
  ).deploy();
  await contract.waitForDeployment();
  dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: "http://localhost/",
  });
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    localStorage: dom.window.localStorage,
    Event: dom.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  wallet = new TestWallet();
  window.ethereum = wallet;
  localStorage.setItem(
    "habitstake:contract:968",
    JSON.stringify(await contract.getAddress()),
  );
  api = null;
});

afterEach(async () => {
  if (root)
    await act(async () => {
      root.unmount();
      await delay(30);
    });
  root = null;
  provider?.destroy();
  await server?.close();
  dom?.window.close();
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  globals.clear();
  CHAINS[968].rpc = originalRpc;
});

test("React hook connects, adds BOT network, handles rejection, checks in, and refunds through real EVM receipts", async () => {
  await mount();
  assert.equal(api.account, "");
  assert.ok(
    !wallet.requests.includes("eth_requestAccounts"),
    "Passive discovery must not ask for authorization",
  );
  await connect();
  assert.equal(api.account, await signer.getAddress());
  assert.ok(wallet.requests.includes("wallet_addEthereumChain"));
  assert.equal(api.snapshot.stake, 0n);

  assert.equal(await submit("create", { amount: "0.01", days: 1 }), true);
  await until(
    () =>
      api.transaction.phase === "idle" &&
      api.snapshot?.stake === parseEther("0.01"),
    "Confirmed creation",
  );
  assert.equal(api.snapshot.completedDays, 0);
  assert.equal(api.lastTransaction.success, true);
  assert.equal(api.celebration, 0);
  assert.equal(localStorage.getItem("habitstake:pending"), null);

  wallet.rejectTransaction = true;
  assert.equal(await submit("checkIn"), false);
  assert.match(api.notice.message, /declined/);
  assert.equal(api.snapshot.completedDays, 0);
  assert.equal(api.celebration, 0);
  assert.equal(api.busy, false);

  wallet.rejectTransaction = false;
  assert.equal(await submit("checkIn"), true);
  await until(
    () => api.transaction.phase === "idle" && api.snapshot?.completedDays === 1,
    "Confirmed check-in",
  );
  assert.equal(api.celebration, 1);
  assert.equal(await submit("refund"), false);
  assert.match(api.notice.message, /not ended/);

  const unlockAt = api.snapshot.unlockAt;
  await server.provider.request({
    method: "evm_setTime",
    params: [unlockAt * 1000],
  });
  await server.provider.request({ method: "evm_mine", params: [] });
  await act(async () => {
    await api.refresh();
  });
  assert.equal(await submit("refund"), true);
  await until(
    () => api.transaction.phase === "idle" && api.snapshot?.claimed,
    "Confirmed refund",
  );
  assert.equal(api.celebration, 2);
  assert.equal(await provider.getBalance(await contract.getAddress()), 0n);
});

test("React hook resumes a saved transaction hash and preserves network selection after rejection", async () => {
  const value = parseEther("0.01");
  const tx = await contract.createHabit(7, value, { value });
  await tx.wait();
  const saved = {
    phase: "pending",
    kind: "create",
    hash: tx.hash,
    chainId: 968,
    account: await signer.getAddress(),
  };
  localStorage.setItem("habitstake:pending", JSON.stringify(saved));
  wallet.authorized = true;
  await mount();
  await until(
    () => api.transaction.phase === "idle" && api.snapshot?.stake === value,
    "Restored transaction receipt",
  );
  assert.equal(api.lastTransaction.hash, tx.hash);
  assert.equal(api.lastTransaction.success, true);
  assert.equal(localStorage.getItem("habitstake:pending"), null);

  wallet.rejectSwitch = true;
  await act(async () => {
    await api.selectNetwork(677);
  });
  assert.equal(api.selectedChainId, 968);
  assert.match(api.notice.message, /declined/);
  assert.equal(api.connecting, false);

  await act(async () => {
    api.disconnect();
  });
  assert.equal(api.account, "");
  assert.equal(api.snapshot, null);
  assert.equal(
    JSON.parse(localStorage.getItem("habitstake:disconnected")),
    true,
  );
});
