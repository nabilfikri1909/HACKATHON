# Security and deployment boundaries

HabitStake is an unaudited hackathon implementation. Run the automated tests and the complete BOT Testnet flow before considering any mainnet deployment. No public deployment is claimed in this package.

## Contract protections

- Exact, positive native-token principal and bounded durations.
- One unfinished habit per account; no caller can claim another account's stake.
- Timestamp-derived failure with exclusive deadlines and no late recovery.
- Original-principal refunds only; no yield or pooled reward liabilities.
- Checks-effects-interactions and a reentrancy guard on state-changing functions.
- Failed transfers revert the claim atomically.
- No owner, proxy, upgrade hook, arbitrary withdrawal, or recovery function.
- Unsolicited direct transfers are rejected. Forced native-token transfers can still increase contract balance; they do not create refund rights.

The contract relies on the underlying network's timestamp and execution rules. It cannot verify real-world habits or prevent a user from reporting completion without performing the activity. Public addresses, stakes, timestamps, and check-ins are visible on-chain.

## Wallet and frontend

The frontend never asks for private keys or recovery phrases. MetaMask handles authorization and signing. Frontend environment variables, saved addresses, and transaction hashes are public information. User-provided contract addresses must be independently verified; reading compatible constants and functions does not prove code authenticity.

A successful receipt is required before showing transaction success. One confirmation is used for this hackathon UI; it is not an independent guarantee of finality. The interface refreshes contract state periodically, and its countdown is an estimate anchored to the most recent chain timestamp. The contract decides whether a transaction is valid when mined.

Pending transaction recovery stores the public hash locally. Speed-up/cancellation tracking is best effort and depends on the wallet/provider. After a reload, an old replaced hash may require manual inspection in MetaMask and the explorer. Stopping UI tracking does not cancel a transaction.

## Development dependencies

Dependency versions are pinned, with a lockfile included. `ethers` and `vite` were updated to patched releases during preparation. Solidity's temporary-file helper is overridden to patched `tmp` 0.2.6 while keeping compiler 0.8.30 reproducible. Framer Motion's supporting packages are pinned to compatible versions to avoid a tested build failure from incompatible transitive versions.

Ganache is used only by automated tests. Its bundled dependency tree contains upstream security advisories, and some Node versions use its JavaScript fallback instead of an optional native module. Do not expose a Ganache RPC server publicly or use its development accounts on a public chain. Test code binds its temporary HTTP server to `127.0.0.1` and closes it after each test. Ganache, jsdom, and solc are not included in the generated frontend bundles.

Review current dependency advisories before a public launch. Do not run `npm audit fix --force` blindly; it can replace tested dependencies with incompatible major versions. Automated testing and dependency scanning do not replace an independent contract and application review.

## Known irreversible behavior

Missing one required 24-hour window permanently locks the entire habit's principal. The money remains inside the contract; nobody has a supported withdrawal path for it. An outage, rejected signature, insufficient gas, or delayed transaction does not extend the deadline. Use testnet tokens to learn the rules.
