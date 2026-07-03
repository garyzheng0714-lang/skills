"""Award + product-name splitters for FBIF poster batch rendering — v18.

v18 changes vs v17:
- split_award now takes the FULL award text (e.g. '年度创新功能性食品奖（非胶囊类）'),
  no longer 'cat' that we wrap into 年度创新{cat}奖. The new Bitable column 「奖项」
  contains the complete award name.
- split_award now handles parenthetical suffix and 和/与/及 conjunction-aware midpoint.
- split_product_name brand-pivot lstrip adds '+' / '＋' (was just ' 　·-—/|、，').
"""

SINGLE_LINE_AWARD = 11     # 11 chars at 100pt overflows ~85px → renderer auto-shrinks ~9% to fit
SINGLE_LINE_PRODUCT = 10   # 87pt; >10 splits with brand-pivot preferred


def _is_cjk(c): return '\u4e00' <= c <= '\u9fff'
def _is_latin(c): return c.isascii() and (c.isalpha() or c.isdigit())


def split_award(award: str) -> str:
    """Wrap full award text. v18 takes full text directly (no 年度创新...奖 wrap).

    Rules:
    1. ≤ SINGLE_LINE_AWARD (11) → single line
    2. Contains '（' or '(' within first 11 chars → split before paren: "head" / "(suffix)"
    3. Else: midpoint, prefer natural boundary (whitespace/punct/和/与/及)
    """
    s = award.strip()
    if len(s) <= SINGLE_LINE_AWARD:
        return s
    for paren in ('（', '('):
        idx = s.find(paren)
        if idx > 0 and idx <= SINGLE_LINE_AWARD:
            head = s[:idx].rstrip()
            tail = s[idx:].lstrip()
            if head and tail:
                return f"{head}\n{tail}"
    target = len(s) // 2
    return _wrap_award_midpoint(s, target, max_dist=3)


def _wrap_award_midpoint(s: str, target: int, max_dist: int = 3) -> str:
    """Split award near target. Prefer breaking BEFORE 和/与/及 (conjunctions go to line 2),
    then standard punctuation/space boundaries, then exact target."""
    n = len(s)
    if n <= target:
        return s
    candidates = []
    for d in range(0, max_dist + 1):
        for i in (target + d, target - d):
            if 1 <= i < n and i not in candidates:
                candidates.append(i)
    # Pass 1: break BEFORE 和/与/及
    for i in candidates:
        if s[i] in '和与及':
            return f"{s[:i]}\n{s[i:]}"
    # Pass 2: standard boundary chars
    for i in candidates:
        prev, curr = s[i-1], s[i]
        if prev in ' 　·-—/|、，)）】' or curr in ' 　·-—/|、，(（【':
            line1 = s[:i].strip(' 　·-—/|')
            line2 = s[i:].strip(' 　·-—/|')
            if line1 and line2:
                return f"{line1}\n{line2}"
    # Pass 3: exact target
    return f"{s[:target]}\n{s[target:]}"


def strip_brand_prefix(brand: str, product: str) -> str:
    """Kept for backward compatibility; not used in current split rule."""
    p = product.strip()
    b = brand.strip()
    if b and p.lower().startswith(b.lower()):
        rest = p[len(b):].lstrip(' 　·-—/|、，+＋')
        if rest:
            return rest
    return p


def _wrap_around(s: str, target: int, max_dist: int = 3) -> str:
    """Split s into 2 lines near `target`. Prefer natural boundary in
    [target-max_dist, target+max_dist]; fall back to exact `target`.

    Boundary kinds (priority):
      - whitespace / punctuation just before or after the cut
      - script transition (Latin↔CJK)
    """
    n = len(s)
    if n <= target:
        return s
    candidates = []
    for d in range(0, max_dist + 1):
        for i in (target + d, target - d):
            if 1 <= i < n and i not in candidates:
                candidates.append(i)
    for i in candidates:
        prev, curr = s[i-1], s[i]
        if prev in ' 　·-—/|、，)）】' or curr in ' 　·-—/|、，(（【':
            line1 = s[:i].strip(' 　·-—/|')
            line2 = s[i:].strip(' 　·-—/|')
            if line1 and line2:
                return f"{line1}\n{line2}"
    for i in candidates:
        prev, curr = s[i-1], s[i]
        if (_is_latin(prev) and _is_cjk(curr)) or (_is_cjk(prev) and _is_latin(curr)):
            return f"{s[:i]}\n{s[i:]}"
    i = target
    while 1 <= i < n - 1 and _is_latin(s[i-1]) and _is_latin(s[i]):
        i += 1
    return f"{s[:i]}\n{s[i:]}"


def split_product_name(name: str, brand: str = "") -> str:
    """Wrap rules (v18):
    1. ≤ SINGLE_LINE_PRODUCT (10) → single line
    2. Else if brand prefix matches AND rest fits in single line
       (rest ≤ SINGLE_LINE_PRODUCT) → "{brand}\\n{rest}"
       (handles 吉香居咔吱脆风干萝卜干 → 吉香居 / 咔吱脆风干萝卜干)
       lstrip set includes '+/＋' (v18) so 利斯科纳+低GI小麦轻食拉面 → 利斯科纳 / 低GI小麦轻食拉面
    3. Else split near floor(N/2), prefer natural boundary
    Brand candidates: explicit brand → CJK-only brand → first whitespace token
    """
    s = name.strip()
    if len(s) <= SINGLE_LINE_PRODUCT:
        return s
    b = brand.strip()
    candidates = []
    if b:
        candidates.append(b)
    cjk_only = ''.join(c for c in b if _is_cjk(c))
    if cjk_only and cjk_only != b:
        candidates.append(cjk_only)
    for sep in (' ', '　'):
        if sep in s:
            head = s.split(sep, 1)[0].strip()
            if head and head not in candidates:
                candidates.append(head)
            break
    for cand in candidates:
        if cand and s.lower().startswith(cand.lower()):
            rest = s[len(cand):].lstrip(' 　·-—/|、，+＋')
            if rest and len(rest) <= SINGLE_LINE_PRODUCT:
                return f"{cand}\n{rest}"
    # v18.1: tail-suffix split — if name ends with a known marketing/design suffix,
    # cut before it. Both lines must be ≤ SINGLE_LINE_PRODUCT.
    TAIL_SUFFIXES = ('整合营销', '内容营销', '事件营销', '跨界营销', '数字营销',
                     '品牌建设', '包装设计', '产品设计', '标签设计', '全案设计',
                     '营销全案', 'Campaign', 'campaign', 'IMC',
                     '设计', '包装', '营销')
    for suf in TAIL_SUFFIXES:
        if s.endswith(suf) and len(s) - len(suf) > 0:
            head = s[:-len(suf)].rstrip(' 　·-—/|、，+＋_')
            tail = suf
            if 1 <= len(head) <= SINGLE_LINE_PRODUCT and len(tail) <= SINGLE_LINE_PRODUCT:
                return f"{head}\n{tail}"
    # v18.1: implicit pivot — first 2 CJK chars as line 1 if rest fits strictly
    if len(s) >= 4 and _is_cjk(s[0]) and _is_cjk(s[1]):
        rest = s[2:]
        if len(rest) <= SINGLE_LINE_PRODUCT:
            return f"{s[:2]}\n{rest}"
    target = len(s) // 2
    return _wrap_around(s, target, max_dist=3)


if __name__ == '__main__':
    cases_award = [
        ('年度创新功能性食品奖（非胶囊类）', '年度创新功能性食品奖\n（非胶囊类）'),
        ('年度创新功能性食品奖（胶囊类）', '年度创新功能性食品奖\n（胶囊类）'),
        ('年度创新果蔬汁和果味饮料奖', '年度创新果蔬汁\n和果味饮料奖'),
        ('年度创新乳粉及其他乳制品奖', '年度创新乳粉\n及其他乳制品奖'),
        ('年度创新酸奶和乳酸菌饮料奖', '年度创新酸奶\n和乳酸菌饮料奖'),
        ('年度创新酒与酒精饮料奖', '年度创新酒与酒精饮料奖'),
        ('年度创新植物基饮品奖', '年度创新植物基饮品奖'),
        ('年度最受消费者欢迎奖', '年度最受消费者欢迎奖'),
        ('最佳整合营销奖', '最佳整合营销奖'),
    ]
    cases_product = [
        ('旺仔五子棋小馒头', '旺仔', '旺仔五子棋小馒头'),
        ('加点滋味亚麻籽芝麻盐', '加点滋味', '加点滋味亚麻籽芝麻盐'),
        ('吉香居咔吱脆风干萝卜干', '吉香居', '吉香居\n咔吱脆风干萝卜干'),
        ('利斯科纳+低GI小麦轻食拉面', '利斯科纳', '利斯科纳\n低GI小麦轻食拉面'),
        ('野人日记+魔芋燕麦鸡胸肉蒸饺', '野人日记', '野人日记\n魔芋燕麦鸡胸肉蒸饺'),
        ('NICEGROW益生菌油滴液', 'NICEGROW', 'NICEGROW\n益生菌油滴液'),
        ('食验室钻石牛奶脆巧（丝绒厚奶味）', '食验室', '食验室钻石牛奶脆巧\n（丝绒厚奶味）'),
    ]
    print('=== split_award ===')
    for inp, want in cases_award:
        got = split_award(inp); ok = '✓' if got == want else '✗'
        print(f"{ok} {inp!r}")
        if got != want: print(f"   want: {want!r}\n   got:  {got!r}")
    print('=== split_product_name ===')
    for inp, brand, want in cases_product:
        got = split_product_name(inp, brand); ok = '✓' if got == want else '✗'
        print(f"{ok} {inp!r} | brand={brand!r}")
        if got != want: print(f"   want: {want!r}\n   got:  {got!r}")
