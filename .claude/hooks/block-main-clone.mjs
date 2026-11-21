// PreToolUse hook: refuse file edits inside the main clone, which must stay a
// clean checkout of `main` (see .claude/rules/worktrees.md). Exit code 2 blocks
// the tool call and shows stderr to Claude.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const filePath = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
if (!filePath) process.exit(0);

// A new file's directory may not exist yet; git needs a real directory to run in.
let dir = dirname(resolve(filePath));
while (!existsSync(dir) && dir !== dirname(dir)) dir = dirname(dir);

const git = (...args) => {
  try {
    return execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
};

const top = git("rev-parse", "--show-toplevel");
const commonDir = git(
  "rev-parse",
  "--path-format=absolute",
  "--git-common-dir",
);
if (!top || !commonDir) process.exit(0);

// The main clone is the checkout whose toplevel owns the shared .git directory;
// a worktree's toplevel is somewhere else.
if (resolve(top) === dirname(commonDir)) {
  console.error(
    `Blocked: ${filePath} is in the main clone, which stays on main. ` +
      "Run `stx wt create <branch> --print-path` and edit the file in that worktree instead.",
  );
  process.exit(2);
}
