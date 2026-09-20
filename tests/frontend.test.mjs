import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEther, Interface } from "ethers";
import {
  CHAINS,
  CONTRACT_ABI,
  cleanAddress,
  walletNetworkParameters,
} from "../src/lib/chains.js";
import {
  STATUS,
  countdown,
  displayState,
  formatBOT,
  friendlyError,
  validateCommitment,
} from "../src/lib/habit.js";

test("network switching parameters use the correct BOT Chain IDs", () => {
  assert.equal(walletNetworkParameters(CHAINS[968]).chainId, "0x3c8");
  assert.equal(walletNetworkParameters(CHAINS[677]).chainId, "0x2a5");
  assert.equal(
    walletNetworkParameters(CHAINS[677]).nativeCurrency.decimals,
    18,
  );
});
test("rejects fake, malformed, and zero contract addresses", () => {
  for (const value of [
    "",
    "not-deployed",
    "0x123",
    "0x0000000000000000000000000000000000000000",
  ])
    assert.equal(cleanAddress(value), "");
  assert.ok(cleanAddress("0x0000000000000000000000000000000000000001"));
});
test("stake parsing preserves exact 18-decimal precision", () => {
  assert.equal(validateCommitment("0.000000000000000001", 7).value, 1n);
  assert.equal(
    validateCommitment("12.345678901234567891", 90).value,
    parseEther("12.345678901234567891"),
  );
});
test("rejects invalid financial input and fractional durations", () => {
  for (const amount of [
    "0",
    "-1",
    "NaN",
    "Infinity",
    "1e3",
    "1,5",
    "1.0000000000000000001",
    "",
  ])
    assert.ok(validateCommitment(amount, 7).error, amount);
  for (const days of [0, 91, 1.5, "abc"])
    assert.ok(validateCommitment("0.01", days).error);
});
test("window display respects open and exclusive close boundaries", () => {
  const h = { status: STATUS.ACTIVE, nextCheckInAt: 100, deadline: 200 };
  assert.equal(displayState(h, 99), "waiting");
  assert.equal(displayState(h, 100), "ready");
  assert.equal(displayState(h, 199), "ready");
  assert.equal(displayState(h, 200), "failed");
});
test("finished streak waits for full-duration refund unlock", () => {
  const h = { status: STATUS.COMPLETED, unlockAt: 300 };
  assert.equal(displayState(h, 299), "complete");
  assert.equal(displayState(h, 300), "refundable");
  assert.equal(displayState({ status: STATUS.CLAIMED }, 999), "claimed");
});
test("missing state is not fabricated as a live commitment", () => {
  assert.equal(displayState(null, 0), "empty");
  assert.equal(displayState({ status: STATUS.NONE }, 0), "empty");
  assert.equal(formatBOT(null), "—");
});
test("countdown never goes negative and can show more than 24 hours", () => {
  assert.equal(countdown(10, 11), "00:00:00");
  assert.equal(countdown(90000, 0), "25:00:00");
});
test("small BOT values are not misleadingly displayed as zero", () => {
  assert.equal(formatBOT(1n), "<0.0001");
  assert.equal(formatBOT(parseEther("0.0100")), "0.01");
});
test("wallet rejection, pending prompts, and decoded reverts are actionable", () => {
  assert.match(friendlyError({ code: 4001 }), /declined/);
  assert.match(
    friendlyError({ info: { error: { code: -32002 } } }),
    /already open/,
  );
  const iface = new Interface(CONTRACT_ABI);
  assert.match(
    friendlyError({ data: iface.encodeErrorResult("MissedWindow") }),
    /permanently locked/,
  );
  assert.match(
    friendlyError({ data: iface.encodeErrorResult("RefundNotReady", [123n]) }),
    /not ended/,
  );
});
