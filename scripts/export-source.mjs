import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sections = [
  ["1. Smart contract", ["contracts/HabitStake.sol"]],
  [
    "2. Frontend UI and animation",
    [
      "src/App.jsx",
      "src/components/UI.jsx",
      "src/styles.css",
      "src/main.jsx",
      "index.html",
      "public/favicon.svg",
    ],
  ],
  [
    "3. Complete Web3 logic",
    ["src/hooks/useHabitStake.js", "src/lib/chains.js", "src/lib/habit.js"],
  ],
  ["4. README and security notes", ["README.md", "SECURITY.md", "LICENSE"]],
  [
    "5. Project configuration and build scripts",
    [
      "package.json",
      "vite.config.js",
      ".env.example",
      ".gitignore",
      "scripts/compile.mjs",
      "scripts/export-source.mjs",
    ],
  ],
  [
    "6. Complete tests and QA fixture",
    [
      "tests/contract.test.mjs",
      "tests/RefundReceiver.sol",
      "tests/frontend.test.mjs",
      "tests/web3.test.mjs",
      "tests/responsive.html",
    ],
  ],
];
const languages = {
  ".sol": "solidity",
  ".jsx": "jsx",
  ".js": "javascript",
  ".mjs": "javascript",
  ".css": "css",
  ".html": "html",
  ".svg": "xml",
  ".json": "json",
  ".md": "markdown",
  ".example": "dotenv",
};
let output = "# HabitStake — complete source code\n\n";
output +=
  "Every authored file is included below in full, including all UI styling, animation, wallet logic, tests, and setup instructions. No implementation sections are abbreviated.\n\n";
output +=
  "The downloadable project also includes the machine-generated dependency lockfile and compiled Solidity artifacts. Install with `npm ci`; run with `npm run dev`. No public contract has been deployed.\n\n";
let count = 0;
for (const [heading, files] of sections) {
  output += `## ${heading}\n\n`;
  for (const name of files) {
    const source = fs.readFileSync(path.join(root, name), "utf8");
    const longestFence = Math.max(
      0,
      ...Array.from(source.matchAll(/`+/g), (match) => match[0].length),
    );
    const fence = "`".repeat(Math.max(3, longestFence + 1));
    output += `### ${name}\n\n${fence}${languages[path.extname(name)] || "text"}\n${source}${source.endsWith("\n") ? "" : "\n"}${fence}\n\n`;
    count++;
  }
}
fs.writeFileSync(path.join(root, "FULL_SOURCE.md"), output);
console.log(
  `Exported ${count} complete files to FULL_SOURCE.md (${Buffer.byteLength(output)} bytes).`,
);
