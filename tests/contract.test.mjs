import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, beforeEach, test } from "node:test";
import ganache from "ganache";
import solc from "solc";
import {
  BrowserProvider,
  ContractFactory,
  Interface,
  parseEther,
} from "ethers";
import { CONTRACT_ABI } from "../src/lib/chains.js";

const artifact = JSON.parse(
  fs.readFileSync(new URL("../artifacts/HabitStake.json", import.meta.url)),
);
const DAY = 86400;
const STAKE = parseEther("0.01");
const fixtureInput = {
  language: "Solidity",
  sources: {
    "RefundReceiver.sol": {
      content: fs.readFileSync(
        new URL("./RefundReceiver.sol", import.meta.url),
        "utf8",
      ),
    },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "paris",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const fixtureOutput = JSON.parse(solc.compile(JSON.stringify(fixtureInput)));
if (fixtureOutput.errors?.some((error) => error.severity === "error"))
  throw new Error(JSON.stringify(fixtureOutput.errors));
const receiverArtifact =
  fixtureOutput.contracts["RefundReceiver.sol"].RefundReceiver;
let engine, provider, alice, bob, contract;

beforeEach(async () => {
  engine = ganache.provider({
    logging: { quiet: true },
    chain: {
      chainId: 968,
      hardfork: "shanghai",
      time: new Date("2026-09-19T00:00:00Z"),
    },
    miner: { timestampIncrement: 0 },
    wallet: { totalAccounts: 4, defaultBalance: 100 },
  });
  provider = new BrowserProvider(engine, "any", { cacheTimeout: 0 });
  alice = await provider.getSigner(0);
  bob = await provider.getSigner(1);
  contract = await new ContractFactory(
    artifact.abi,
    artifact.bytecode,
    alice,
  ).deploy();
  await contract.waitForDeployment();
});
afterEach(async () => {
  provider.destroy();
  await engine.disconnect();
});

async function mined(promise) {
  return (await promise).wait();
}
async function create(days = 7, signer = alice, amount = STAKE) {
  await mined(
    contract.connect(signer).createHabit(days, amount, { value: amount }),
  );
  return (await contract.getHabit(await signer.getAddress())).habit;
}
async function at(timestamp) {
  await engine.request({
    method: "evm_setTime",
    params: [Number(timestamp) * 1000],
  });
  await engine.request({ method: "evm_mine", params: [] });
}
async function rejected(promise, name) {
  await assert.rejects(promise, (error) => {
    if (!name) return true;
    assert.equal(
      error.revert?.name,
      name,
      `Expected ${name}, got ${error.shortMessage || error.message}`,
    );
    return true;
  });
}
async function finish(days = 2, signer = alice) {
  const habit = await create(days, signer);
  for (let day = 0; day < days; day++) {
    await at(habit.startedAt + BigInt(day * DAY));
    await mined(contract.connect(signer).checkIn());
  }
  return habit;
}

test("compiled ABI matches every frontend function, event, and custom error", () => {
  const actual = new Interface(artifact.abi);
  const frontend = new Interface(CONTRACT_ABI);
  for (const fragment of frontend.fragments) {
    const formatted = fragment.format("sighash");
    const match =
      fragment.type === "function"
        ? actual.getFunction(formatted)
        : fragment.type === "event"
          ? actual.getEvent(formatted)
          : actual.getError(formatted);
    assert.ok(match, formatted);
    if (fragment.type === "function")
      assert.equal(match.format("full"), fragment.format("full"));
  }
});
test("creation records exact principal without automatically checking in", async () => {
  const h = await create();
  assert.equal(h.stake, STAKE);
  assert.equal(h.totalDays, 7n);
  assert.equal(h.completedDays, 0n);
  assert.equal(await contract.DAY(), BigInt(DAY));
  assert.equal(await contract.MAX_DAYS(), 90n);
  assert.equal(await provider.getBalance(await contract.getAddress()), STAKE);
});
test("rejects zero, excessive, and mismatched stakes/durations", async () => {
  await rejected(
    contract.createHabit.staticCall(0, STAKE, { value: STAKE }),
    "InvalidDuration",
  );
  await rejected(
    contract.createHabit.staticCall(91, STAKE, { value: STAKE }),
    "InvalidDuration",
  );
  await rejected(contract.createHabit.staticCall(1, 0), "InvalidStake");
  await rejected(
    contract.createHabit.staticCall(1, STAKE, { value: STAKE + 1n }),
    "InvalidStake",
  );
  await rejected(
    contract.createHabit.staticCall(1, STAKE, { value: STAKE - 1n }),
    "InvalidStake",
  );
});
test("rejects a check-in or refund when no habit exists", async () => {
  await rejected(contract.checkIn.staticCall(), "NoHabit");
  await rejected(contract.claimRefund.staticCall(), "NoHabit");
});
test("allows exactly one check-in in a window", async () => {
  const h = await create();
  await mined(contract.checkIn());
  await rejected(contract.checkIn.staticCall(), "AlreadyCheckedIn");
  await at(h.startedAt + BigInt(DAY - 1));
  await rejected(contract.checkIn.staticCall(), "AlreadyCheckedIn");
  await at(h.startedAt + BigInt(DAY));
  await mined(contract.checkIn());
  assert.equal(
    (await contract.getHabit(await alice.getAddress())).habit.completedDays,
    2n,
  );
});
test("first window expires exactly at its exclusive deadline", async () => {
  const h = await create();
  await at(h.startedAt + BigInt(DAY));
  assert.equal((await contract.getHabit(await alice.getAddress())).status, 3n);
  await rejected(contract.checkIn.staticCall(), "MissedWindow");
  await rejected(contract.claimRefund.staticCall(), "MissedWindow");
});
test("allows check-ins at adjacent window boundaries without shifting the schedule", async () => {
  const h = await create(2);
  await at(h.startedAt + BigInt(DAY - 1));
  await mined(contract.checkIn());
  await at(h.startedAt + BigInt(DAY));
  await mined(contract.checkIn());
  const result = await contract.getHabit(await alice.getAddress());
  assert.equal(result.status, 2n);
  assert.equal(result.unlockAt, h.startedAt + 2n * BigInt(DAY));
});
test("a missed middle window cannot be recovered with late check-ins", async () => {
  const h = await create(7);
  await mined(contract.checkIn());
  await at(h.startedAt + BigInt(2 * DAY));
  await rejected(contract.checkIn.staticCall(), "MissedWindow");
  await rejected(contract.claimRefund.staticCall(), "MissedWindow");
  assert.equal(
    await contract.permanentlyLocked(await alice.getAddress()),
    STAKE,
  );
});
test("seven-day commitment completes and refunds only after seven full days", async () => {
  const h = await finish(7);
  await rejected(contract.claimRefund.staticCall(), "RefundNotReady");
  await at(h.startedAt + BigInt(7 * DAY - 1));
  await rejected(contract.claimRefund.staticCall(), "RefundNotReady");
  await at(h.startedAt + BigInt(7 * DAY));
  const before = await provider.getBalance(await alice.getAddress());
  const receipt = await mined(contract.claimRefund());
  const after = await provider.getBalance(await alice.getAddress());
  assert.equal(after + receipt.fee - before, STAKE);
  assert.equal(await provider.getBalance(await contract.getAddress()), 0n);
  assert.equal((await contract.getHabit(await alice.getAddress())).status, 4n);
});
test("one-day habit still locks funds for a full 24 hours", async () => {
  const h = await finish(1);
  await rejected(contract.claimRefund.staticCall(), "RefundNotReady");
  await at(h.startedAt + BigInt(DAY));
  await mined(contract.claimRefund());
});
test("completed commitments remain refundable long after the end", async () => {
  const h = await finish(1);
  await at(h.startedAt + BigInt(40 * DAY));
  assert.equal((await contract.getHabit(await alice.getAddress())).status, 2n);
  await mined(contract.claimRefund());
});
test("blocks a second refund and check-in after refund", async () => {
  const h = await finish(1);
  await at(h.startedAt + BigInt(DAY));
  await mined(contract.claimRefund());
  await rejected(contract.claimRefund.staticCall(), "AlreadyClaimed");
  await rejected(contract.checkIn.staticCall(), "AlreadyClaimed");
});
test("active and completed unclaimed habits cannot be overwritten", async () => {
  const h = await create(1);
  await rejected(
    contract.createHabit.staticCall(1, STAKE, { value: STAKE }),
    "UnfinishedHabit",
  );
  await mined(contract.checkIn());
  await rejected(contract.checkIn.staticCall(), "StreakAlreadyComplete");
  await at(h.startedAt + BigInt(DAY));
  await rejected(
    contract.createHabit.staticCall(1, STAKE, { value: STAKE }),
    "UnfinishedHabit",
  );
});
test("cannot refund an incomplete but still-active habit", async () => {
  await create(3);
  await mined(contract.checkIn());
  await rejected(contract.claimRefund.staticCall(), "IncompleteStreak");
});
test("replacing a failed habit cannot recover its forfeited principal", async () => {
  const first = await create(1);
  await at(first.startedAt + BigInt(DAY));
  const second = await create(1);
  assert.equal(second.id, first.id + 1n);
  assert.equal(await contract.forfeitedStake(await alice.getAddress()), STAKE);
  await mined(contract.checkIn());
  await at(second.startedAt + BigInt(DAY));
  await mined(contract.claimRefund());
  assert.equal(await provider.getBalance(await contract.getAddress()), STAKE);
  assert.equal(
    await contract.permanentlyLocked(await alice.getAddress()),
    STAKE,
  );
});
test("multiple failed habits accumulate without double-counting", async () => {
  const h = await create(1);
  await at(h.startedAt + BigInt(DAY));
  const next = await create(1);
  await at(next.startedAt + BigInt(DAY));
  assert.equal(
    await contract.permanentlyLocked(await alice.getAddress()),
    STAKE * 2n,
  );
  await create(1);
  assert.equal(
    await contract.permanentlyLocked(await alice.getAddress()),
    STAKE * 2n,
  );
});
test("users cannot check in or refund another wallet’s habit", async () => {
  await create(1);
  await rejected(contract.connect(bob).checkIn.staticCall(), "NoHabit");
  await rejected(contract.connect(bob).claimRefund.staticCall(), "NoHabit");
});
test("one user’s refund never spends another user’s commitment", async () => {
  const a = await create(1);
  await create(3, bob, STAKE * 3n);
  await mined(contract.checkIn());
  await at(a.startedAt + BigInt(DAY));
  await mined(contract.claimRefund());
  assert.equal(
    await provider.getBalance(await contract.getAddress()),
    STAKE * 3n,
  );
  assert.equal(
    (await contract.getHabit(await bob.getAddress())).habit.stake,
    STAKE * 3n,
  );
});
test("a claimed habit can be replaced by a new clean commitment", async () => {
  const h = await finish(1);
  await at(h.startedAt + BigInt(DAY));
  await mined(contract.claimRefund());
  const next = await create(90);
  assert.equal(next.totalDays, 90n);
  assert.equal(next.completedDays, 0n);
  assert.equal(next.claimed, false);
});
test("direct native-token transfers revert", async () => {
  await rejected(
    alice.sendTransaction({ to: await contract.getAddress(), value: STAKE }),
  );
  assert.equal(await provider.getBalance(await contract.getAddress()), 0n);
});
test("failed receiver reverts atomically and the refund remains claimable", async () => {
  const receiver = await new ContractFactory(
    receiverArtifact.abi,
    `0x${receiverArtifact.evm.bytecode.object}`,
    alice,
  ).deploy(await contract.getAddress());
  await receiver.waitForDeployment();
  await mined(receiver.create(1, { value: STAKE }));
  await mined(receiver.checkIn());
  const h = (await contract.getHabit(await receiver.getAddress())).habit;
  await at(h.startedAt + BigInt(DAY));
  await mined(receiver.configure(true, false));
  await rejected(receiver.claim.staticCall());
  assert.equal(
    (await contract.getHabit(await receiver.getAddress())).habit.claimed,
    false,
  );
  await mined(receiver.configure(false, false));
  await mined(receiver.claim());
  assert.equal(await provider.getBalance(await receiver.getAddress()), STAKE);
});
test("reentrant refund is blocked while the legitimate refund succeeds once", async () => {
  const receiver = await new ContractFactory(
    receiverArtifact.abi,
    `0x${receiverArtifact.evm.bytecode.object}`,
    alice,
  ).deploy(await contract.getAddress());
  await receiver.waitForDeployment();
  await mined(receiver.create(1, { value: STAKE }));
  await mined(receiver.checkIn());
  const h = (await contract.getHabit(await receiver.getAddress())).habit;
  await at(h.startedAt + BigInt(DAY));
  await mined(receiver.configure(false, true));
  await mined(receiver.claim());
  assert.equal(await receiver.nestedAttempted(), true);
  assert.equal(await receiver.nestedSucceeded(), false);
  assert.equal(await provider.getBalance(await receiver.getAddress()), STAKE);
  assert.equal(await provider.getBalance(await contract.getAddress()), 0n);
});
