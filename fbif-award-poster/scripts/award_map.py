"""FBIF 年度创新奖项文案分拆规则。

单行极限：9 个中文字符（100pt Alibaba-PuHuiTi-Bold, 框宽 1015px）。
"""

SINGLE_LINE_CHAR_BUDGET = 9


def split_award(category: str) -> str:
    """Return award text, optionally with '\\n' for 2-line layout.

    Rules:
      - `A-B`  → "年度创新A" / "B奖"
      - len("年度创新{cat}奖") ≤ 9 → single line
      - otherwise split category so the two lines are balanced,
        keeping 年度创新 attached to the start of cat so line 1 is not
        isolated "年度创新".
    """
    cat = category.strip()
    if "-" in cat:
        a, b = [s.strip() for s in cat.split("-", 1)]
        return f"年度创新{a}\n{b}奖"
    full = f"年度创新{cat}奖"
    if len(full) <= SINGLE_LINE_CHAR_BUDGET:
        return full
    L = len(cat)
    k = max(1, (L - 3) // 2 + 1)
    return f"年度创新{cat[:k]}\n{cat[k:]}奖"
