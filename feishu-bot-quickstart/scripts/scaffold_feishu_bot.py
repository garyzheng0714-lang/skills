#!/usr/bin/env python3

import argparse
import os
import shutil
import sys
from pathlib import Path


def eprint(msg: str) -> None:
    print(msg, file=sys.stderr)


def is_dir_empty(p: Path) -> bool:
    if not p.exists():
        return True
    if not p.is_dir():
        return False
    return next(p.iterdir(), None) is None


def copy_tree(src: Path, dst: Path) -> None:
    # Python 3.9: avoid copytree(dirs_exist_ok=True) to keep behavior explicit.
    for root, dirs, files in os.walk(src):
        rel = Path(root).relative_to(src)
        out_dir = dst / rel
        out_dir.mkdir(parents=True, exist_ok=True)
        for d in dirs:
            (out_dir / d).mkdir(parents=True, exist_ok=True)
        for f in files:
            s = Path(root) / f
            t = out_dir / f
            # Do not overwrite existing files; scaffold should target a new/empty dir.
            if t.exists():
                raise RuntimeError(f"Refusing to overwrite existing file: {t}")
            shutil.copy2(s, t)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Scaffold a runnable Feishu long-connection bot service into the current repo."
    )
    parser.add_argument(
        "--out",
        help="Output directory. If omitted and ./package.json exists, defaults to ./feishu-bot-service",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Allow writing into an existing EMPTY directory (non-empty dirs are always refused).",
    )
    parser.add_argument(
        "--pm",
        choices=["npm", "pnpm", "yarn"],
        default="npm",
        help="Package manager to suggest in next steps (default: npm).",
    )
    args = parser.parse_args()

    cwd = Path.cwd()
    has_pkg_json = (cwd / "package.json").exists()

    out = Path(args.out) if args.out else None
    if out is None:
        if not has_pkg_json:
            eprint("ERROR: --out is required when no package.json is found in the current directory.")
            eprint("Hint: run this from your repo root, or pass --out <dir>.")
            return 2
        out = cwd / "feishu-bot-service"

    out = out.resolve()
    if out.exists():
        if not out.is_dir():
            eprint(f"ERROR: output path exists and is not a directory: {out}")
            return 2
        if not is_dir_empty(out):
            eprint(f"ERROR: output directory is not empty; refusing to overwrite: {out}")
            return 2
        if not args.force:
            # Writing to an empty directory is safe even without --force; keep UX simple.
            pass
    else:
        out.mkdir(parents=True, exist_ok=True)

    skill_dir = Path(__file__).resolve().parents[1]
    template_dir = skill_dir / "assets" / "feishu-bot-service"
    if not template_dir.exists():
        eprint(f"ERROR: template not found: {template_dir}")
        return 2

    copy_tree(template_dir, out)

    # Ensure a minimal, project-specific handler exists (safe to overwrite; out is empty).
    handler_path = out / "src" / "handler.ts"
    handler_path.parent.mkdir(parents=True, exist_ok=True)
    handler_path.write_text(
        """import type { TurnContext } from './types';
import { OpenAICompatibleLLM } from './llm/openai_compatible';

// Replace this with your business logic. Keep it deterministic and fast.
export async function handleTurn(ctx: TurnContext): Promise<{ text: string }> {
  const llm = OpenAICompatibleLLM.fromEnv();
  if (!llm) {
    return { text: `echo: ${ctx.text}` };
  }
  const text = await llm.chat({
    system: ctx.systemPrompt,
    messages: ctx.history,
    userText: ctx.text,
  });
  return { text };
}
""",
        encoding="utf-8",
    )

    pm = args.pm
    install_cmd = {"npm": "npm i", "pnpm": "pnpm i", "yarn": "yarn"}[pm]
    run_dev_cmd = {"npm": "npm run dev", "pnpm": "pnpm dev", "yarn": "yarn dev"}[pm]

    print(f"[OK] Scaffolded Feishu bot service to: {out}")
    print("")
    print("Next steps:")
    print(f"1) cd {out}")
    print(f"2) {install_cmd}")
    print("3) Export credentials (or set them in your shell profile):")
    print("   export FEISHU_APP_ID=...")
    print("   export FEISHU_APP_SECRET=...")
    print("4) (Optional) Check auth without sending messages:")
    print("   python3 /Users/simba/.codex/skills/feishu-bot-quickstart/scripts/feishu_auth_check.py")
    print(f"5) {run_dev_cmd}")
    print("")
    print("Notes:")
    print("- This scaffold does not write secrets to disk.")
    print("- For group chat replies, set FEISHU_REPLY_POLICY=mention_or_dm and FEISHU_BOT_OPEN_ID=<bot open_id>.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

