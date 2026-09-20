# HabitStake

**Show up. Keep your word. Earn your own stake back.**

HabitStake is a daily commitment DApp for BOT Chain. Commit native BOT, record one check-in in each consecutive 24-hour window, and reclaim your original principal after completing the entire commitment. Missing a required window permanently locks that habit's stake.

Built for Build Week Hackathon Vol.2 with React, Tailwind CSS, ethers.js, Framer Motion, Lucide, Solidity, and MetaMask.

## Features

- Native BOT commitments lasting 1–90 days; no token approval transaction.
- Manual daily check-ins with deadlines calculated by the smart contract.
- Full principal refund after every check-in **and** the complete duration.
- One unfinished commitment per account, with independent account balances.
- MetaMask discovery, connection, BOT network addition/switching, and account change handling.
- Transaction simulation, gas estimation, receipt tracking, and recovery of pending transaction tracking after a reload.
- Clear wallet rejection, wrong network, insufficient funds, stale data, and invalid contract states.
- Charcoal and neon green bento dashboard with translucent glass panels, spring buttons, progress ring, interactive streak grid, loading states, and confirmed check-in celebrations.
- Responsive layout, keyboard focus styles, accessible dialogs, and reduced-motion support.
- No owner withdrawals, upgrade mechanism, interest, reward token, or recovery backdoor.

## Run locally

Install Node.js **22.12 or newer**, npm, and the MetaMask browser extension. On mobile, open the served app inside MetaMask's in-app browser.

Extract the project, open a terminal in the `habitstake` directory, and run:

```bash
npm ci
npm run dev
```

Open [http://localhost:4173](http://localhost:4173). The dashboard works before deployment, but contract transactions stay disabled until you configure a real deployed contract. The initial streak is explicitly labeled as a preview.

Two configuration methods are supported:

1. **One device:** deploy the contract, choose BOT Testnet in the dashboard, open **Configure contract**, and paste its complete deployed address. The address is saved locally for that network.
2. **Every visitor:** copy `.env.example` to `.env`, enter the actual deployment address in `VITE_BOT_TESTNET_CONTRACT_ADDRESS`, and restart the development server or rebuild. Use `VITE_BOT_MAINNET_CONTRACT_ADDRESS` only for an actual mainnet deployment.

The `.env.example` addresses are intentionally empty because no public deployment has been performed. Do not invent an address. All `VITE_` variables are public frontend configuration; never put a private key, seed phrase, or mnemonic there. A locally saved address takes precedence over the environment address on that device.

## BOT Chain configuration

| Setting         | Testnet                                                | Mainnet                                      |
| --------------- | ------------------------------------------------------ | -------------------------------------------- |
| Chain ID        | 968 (`0x3c8`)                                          | 677 (`0x2a5`)                                |
| Native currency | BOT, 18 decimals                                       | BOT, 18 decimals                             |
| RPC             | [rpc.bohr.life](https://rpc.bohr.life)                 | [rpc.botchain.ai](https://rpc.botchain.ai)   |
| Explorer        | [scan.bohr.life](https://scan.bohr.life)               | [scan.botchain.ai](https://scan.botchain.ai) |
| Faucet          | [BOT Testnet Faucet](https://faucet.botchain.ai/basic) | Not applicable                               |

Testnet is the default. The wallet integration adds an unknown network with `wallet_addEthereumChain` and verifies the selected chain after switching. Optional public RPC overrides are included in `.env.example`.

## Deployment

**Testnet Contract Address: Not deployed.**

**Mainnet Contract Address: Not deployed.**

This source package does not claim a deployment or contain invented transaction hashes. Record the actual address and deployment transaction here after deploying.

### Deploy with Remix and MetaMask

1. Add/select BOT Chain Testnet in MetaMask and obtain test BOT from the faucet. Keep test BOT available for deployment and subsequent gas fees.
2. Open the official [Remix IDE](https://remix.ethereum.org/). Create `HabitStake.sol` and copy the **entire** contents of `contracts/HabitStake.sol`. It has no external Solidity imports.
3. In **Solidity Compiler**, select **0.8.30**, enable optimization with **200 runs**, and select **Paris** as the EVM version in advanced settings. Compile `HabitStake.sol`.
4. In **Deploy & Run Transactions**, choose the injected MetaMask/browser provider. Verify in MetaMask that the chain is **968**, and choose the `HabitStake` contract.
5. Leave deployment value at **0**. There are no constructor arguments. Deploy and review the wallet transaction.
6. Wait for the confirmed deployment. Copy the contract address from Remix, confirm its deployment on the testnet explorer, and enter it in the dashboard's contract settings.
7. Connect MetaMask. Confirm that the dashboard verifies the contract and displays your real wallet balance.
8. Use a small amount of test BOT to run the manual test below. Deployment alone does not prove the complete app works on the public network.

The frontend checks that code exists, its `DAY` equals 86,400 seconds, and its `MAX_DAYS` equals 90. These are compatibility checks, **not authentication of arbitrary code**. Use your own reviewed deployment and verify its source.

### Build the frontend

```bash
npm run build
npm run preview
```

The static frontend is generated in `dist/`. Serve that directory over HTTP(S); opening `index.html` through `file://` is unsupported. Contract environment variables are embedded at build time, so rebuild after changing them. No backend, database, API key, or server-side wallet is required. The production build uses relative asset paths and can be served from a subdirectory.

### Compile reproducible contract artifacts

```bash
npm run compile
```

This uses the pinned local Solidity compiler and writes:

- `artifacts/HabitStake.json`: complete ABI, creation bytecode, runtime bytecode, and compiler settings.
- `artifacts/standard-input.json`: complete Solidity standard JSON input for source verification.

The compiled contract targets EVM Paris and uses 200 optimizer runs. Confirm BOT Chain deployment compatibility on testnet before considering mainnet.

## Exact commitment rules

Creation **does not** check in automatically. The first window opens when the creation transaction is mined. Every transaction must be mined within its required window; signing or submitting it before the deadline is insufficient.

For a two-day commitment created Monday at 10:00:

| Action         | Required time                                             |
| -------------- | --------------------------------------------------------- |
| Day 1 check-in | Monday 10:00 inclusive through Tuesday 10:00 exclusive    |
| Day 2 check-in | Tuesday 10:00 inclusive through Wednesday 10:00 exclusive |
| Claim refund   | Wednesday 10:00 or later, after both check-ins            |

All windows are anchored to the original creation timestamp. They do not reset at local midnight or move after a late check-in. Two valid check-ins may be close together across adjacent window boundaries; this is **one per window**, not a minimum 24-hour interval between transactions.

Missing the exclusive end of any required window makes the entire principal permanently unclaimable. Failure is derived from chain time, so no keeper, cron job, or extra transaction is needed to enforce it. The stake remains in the contract; this implementation **locks it permanently and does not burn the token supply**. There is no grace period or admin recovery.

After every required check-in, the principal becomes claimable when `startedAt + totalDays * 86400` is reached. There is no expiry on an eligible refund. A one-day habit also waits the full 24 hours. Gas is separate from the original stake and is never refunded.

An active or completed-but-unclaimed habit cannot be replaced. A claimed or failed habit can be replaced; previously forfeited principal stays locked. Check-ins are self-reported and cannot prove completion of real-world exercise, study, or other behavior. No personal habit description is stored on-chain.

## Contract interface

| Function                                          | Behavior                                                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `createHabit(uint256 days_, uint256 stakeAmount)` | Payable; duration 1–90, positive stake in wei, `msg.value == stakeAmount`. Returns the new habit ID. |
| `checkIn()`                                       | Records the caller's next required check-in in the currently open window.                            |
| `claimRefund()`                                   | Returns the caller's principal once all check-ins and the full duration are complete.                |
| `getHabit(address user)`                          | Returns the habit, derived status, next window start, deadline, unlock time, and chain timestamp.    |
| `permanentlyLocked(address user)`                 | Returns all forfeited principal, including the latest failed habit.                                  |
| `forfeitedStake(address user)`                    | Returns principal from failed habits already replaced.                                               |
| `habitCount()`                                    | Returns the total number of habits ever created.                                                     |
| `DAY()` / `MAX_DAYS()`                            | Return the fixed timing and duration limits.                                                         |

The full frontend ABI includes the functions, emitted events, and custom errors. Automated tests compare it with the compiled contract ABI.

## Tests and validation

```bash
npm test
```

The suite contains **34 tests**:

- **22 contract tests:** actual Solidity execution on a local EVM, exact stake accounting, manual first check-in, duplicate rejection, deadline boundaries, missed windows, full-duration unlocks, repeated refund rejection, account isolation, replacement accounting, rejecting receivers, and attempted reentrancy.
- **10 frontend utility tests:** precise 18-decimal amounts, validation, network IDs, state transitions, countdowns, address validation, and actionable decoded errors.
- **2 React/Web3 integration tests:** the actual hook runs under React Strict Mode against a local JSON-RPC EVM. These cover wallet permissions, unknown-network addition, creation, rejected signing, check-in, early-refund rejection, successful refund, stored receipt recovery, rejected switching, and local disconnect.

Tests never spend public BOT. Local test chain time is advanced using development RPC methods; the deployed contract has no clock override. The wallet adapter used by integration tests simulates EIP-1193 permissions and request rejection. It is not a real MetaMask extension.

The production frontend build was checked. Browser checks covered the dashboard, duration selection, contract-address validation, dialogs, missing-wallet guidance, and mobile-width structure. Real MetaMask extension interaction, public BOT transactions, and final deployment still require the following manual test. This package has not had an independent security audit; passing tests are not a guarantee of zero bugs.

Ganache is a development-only local EVM. Some Node versions report an unavailable optional native µWS binary and fall back to JavaScript. Its bundled dependencies also contain upstream audit advisories. Ganache is not imported by the frontend and must not be exposed as a public service. See `SECURITY.md` for the deployment boundary.

### Manual BOT Testnet test

1. Connect MetaMask with the intended test account. Reject one connection/switch request and check that the UI recovers.
2. Configure your actual testnet deployment. Verify the chain ID, explorer address, and wallet balance.
3. Create a **one-day** habit using a small amount of test BOT. Confirm the amount and additional gas in MetaMask. Wait for the confirmed creation message.
4. Perform the first check-in. Confirm that the ring and grid update only after a successful receipt. Attempting a duplicate must fail without changing the streak.
5. Refresh the page and verify that the habit is read from the contract. Switch accounts and ensure each account sees only its own habit.
6. After the full 24 hours, claim the refund. Confirm a successful receipt and returned principal; the wallet's net balance also includes gas expenses.
7. With a different test account, create a one-day habit and skip its check-in. After the deadline, confirm that it is failed and cannot be refunded.

Do not wait until the last seconds of a window: inclusion time and RPC availability vary. A missed window cannot be recovered.

## Hackathon demo

Start the public one-day success and failure cases at least a day before recording. For a live presentation, use an already-completed testnet habit for the refund demonstration, and a separate account for fresh creation and check-in. Keep real explorer links to each transaction. The local test suite can demonstrate boundary cases immediately; clearly identify it as a local simulation.

Explain the product in one sentence: **HabitStake turns a daily promise into a verifiable financial commitment, with transparent rules enforced by a smart contract.**

Show the creation, check-in, and refund receipts. Explain why the contract uses fixed windows, why no owner can withdraw forfeited funds, and why self-reported check-ins are a limitation. Add your real repository, deployment addresses, demo recording, and team details to the submission after they exist.

## Project files

| File                         | Purpose                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `contracts/HabitStake.sol`   | Complete Solidity contract with NatSpec.                                     |
| `src/App.jsx`                | Full dashboard, forms, transaction views, and dialogs.                       |
| `src/styles.css`             | Tailwind entry, neon/glass visual system, and responsive styles.             |
| `src/components/UI.jsx`      | Animated buttons, panels, dialogs, ring, streak grid, confetti, and notices. |
| `src/hooks/useHabitStake.js` | Complete wallet, network, read, write, and receipt lifecycle.                |
| `src/lib/chains.js`          | BOT networks, full frontend ABI, and public configuration persistence.       |
| `src/lib/habit.js`           | Amount validation, chain-state mapping, time display, and decoded errors.    |
| `src/main.jsx`               | React entry, error boundary, and reduced-motion configuration.               |
| `scripts/compile.mjs`        | Reproducible Solidity compilation.                                           |
| `scripts/export-source.mjs`  | Exports every authored source file into complete Markdown code blocks.       |
| `tests/`                     | Contract, frontend, React/Web3 integration, and responsive QA fixtures.      |

Run `npm run source` to regenerate `FULL_SOURCE.md`. The Markdown export contains complete authored files, with no omitted functions or UI sections. The ZIP also contains `package-lock.json` and compiled artifacts; dependencies and build output can be regenerated with the commands above.

## Troubleshooting

| Symptom                           | Action                                                                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MetaMask not found                | Install the extension or use MetaMask's mobile browser. Another injected wallet is not automatically treated as MetaMask.                                                                              |
| No contract at this address       | Verify the complete address and selected network. Testnet and mainnet deployments are independent.                                                                                                     |
| RPC read fails                    | Retry, check your network, or configure a working BOT RPC endpoint. Reads are refreshed every 15 seconds and when the tab regains focus.                                                               |
| Stale countdown                   | Refresh the on-chain snapshot. The UI blocks normal write controls when the snapshot is over 90 seconds old; the contract always enforces the actual block timestamp.                                  |
| Insufficient BOT                  | Reduce the commitment amount or add funds; leave enough BOT for creation, check-ins, and the final refund transaction.                                                                                 |
| Pending after reload              | The app restores the saved public transaction hash and checks its actual receipt. Consult MetaMask and the explorer before retrying.                                                                   |
| Replaced or cancelled transaction | In-session tracking follows replacement receipts when available. After a reload, inspect MetaMask/explorer if only the original hash remains pending. Stopping tracking does not cancel a transaction. |
| Expected refund is unavailable    | Confirm every check-in and the full duration. A missed window is irreversible.                                                                                                                         |

## References

- [Build Week Hackathon Vol.2 guidebook](https://www.girlmeetstech.org/guidebook-build-week-hackathon-vol2)
- [BOT Chain](https://botchain.ai/)
- [MetaMask Wallet API](https://docs.metamask.io/wallet/reference/)
- [ethers v6 documentation](https://docs.ethers.org/v6/)
- [Solidity security considerations](https://docs.soliditylang.org/en/latest/security-considerations.html)
- [Remix documentation](https://remix-ide.readthedocs.io/en/latest/)
- [Tailwind CSS Vite integration](https://tailwindcss.com/docs/installation/using-vite)
- [Motion for React documentation](https://motion.dev/docs/react)

## License

MIT. See `LICENSE`.
