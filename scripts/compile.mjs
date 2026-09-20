import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(
  path.join(root, "contracts/HabitStake.sol"),
  "utf8",
);
const settings = {
  optimizer: { enabled: true, runs: 200 },
  evmVersion: "paris",
  outputSelection: {
    "*": {
      "*": [
        "abi",
        "evm.bytecode.object",
        "evm.deployedBytecode.object",
        "metadata",
      ],
    },
  },
};
const input = {
  language: "Solidity",
  sources: { "HabitStake.sol": { content: source } },
  settings,
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
for (const diagnostic of output.errors || []) {
  console[diagnostic.severity === "error" ? "error" : "warn"](
    diagnostic.formattedMessage,
  );
}
if (output.errors?.some((error) => error.severity === "error")) process.exit(1);
const contract = output.contracts["HabitStake.sol"].HabitStake;
const artifact = {
  contractName: "HabitStake",
  compiler: solc.version(),
  evmVersion: "paris",
  optimizerRuns: 200,
  abi: contract.abi,
  bytecode: `0x${contract.evm.bytecode.object}`,
  deployedBytecode: `0x${contract.evm.deployedBytecode.object}`,
};
fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
fs.writeFileSync(
  path.join(root, "artifacts/HabitStake.json"),
  `${JSON.stringify(artifact, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(root, "artifacts/standard-input.json"),
  `${JSON.stringify(input, null, 2)}\n`,
);
console.log(
  `HabitStake compiled with ${artifact.compiler}; EVM Paris; ${artifact.deployedBytecode.slice(2).length / 2} runtime bytes.`,
);
