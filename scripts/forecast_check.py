"""기관 전망 수치 일관성 검사 (docs/index.html)

전망 숫자는 페이지 여러 곳에 들어가 있다. 이 스크립트는 다음이 서로 맞는지 확인하고, 올바른 평균값을 출력한다.
  1) JS 의 INST 객체 (2페이지 차트·툴팁이 쓰는 원본)
  2) 3페이지 외국계·국내 마스터 테이블의 분기 수치
  3) 2페이지 분기별 평균 표, 상단 카드(4Q26·4Q27), 블룸버그 비교표의 '이 자료의 기관 평균' 행

사용: python scripts/forecast_check.py      (불일치가 있으면 종료 코드 1)
"""
import json
import math
import re
import sys
from pathlib import Path

HTML = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "docs" / "index.html"
s = HTML.read_text(encoding="utf-8")
problems = []


def num(x):
    m = re.search(r"\d[\d,]*(?:\.\d+)?", x or "")
    return float(m.group().replace(",", "")) if m else None


def r0(x):  # JS Math.round 과 같은 반올림
    return int(math.floor(x + 0.5))


# 1) INST 객체
js = s[s.index("var INST={"):]
js = js[:js.index("};") + 1]
groups = {}
for g in ("f", "d"):
    body = re.search(g + r":\{(.*?)\}", js, re.S).group(1)
    groups[g] = {k: [None if v == "null" else float(v) for v in vals.split(",")]
                 for k, vals in re.findall(r'"([^"]+)":\[([^\]]*)\]', body)}

# 2) 3페이지 마스터 테이블 (각 절의 첫 번째 표)
for g, sec in (("f", "foreign"), ("d", "domestic")):
    part = s[s.index(f'<section id="{sec}">'):]
    table = part[part.index("<tbody>"):part.index("</tbody>")]
    rows = re.findall(r"<tr>(.*?)</tr>", table, re.S)
    seen = set()
    for row in rows:
        name = re.sub(r"<[^>]+>", "", re.search(r'<td class="inst">(.*?)(?:<span|</td>)', row, re.S).group(1)).strip()
        cells = re.findall(r'<td class="n[^"]*">(.*?)</td>', row, re.S)
        vals = [num(re.sub(r"<span.*", "", c, flags=re.S)) for c in cells[:5]]
        seen.add(name)
        if name not in groups[g]:
            problems.append(f"[{sec}] 표에 있는 '{name}' 이(가) INST 에 없음")
            continue
        if vals != groups[g][name]:
            problems.append(f"[{sec}] '{name}' 표 {vals} != INST {groups[g][name]}")
    for k in groups[g]:
        if k not in seen:
            problems.append(f"[{sec}] INST 의 '{k}' 이(가) 표에 없음")

# 평균 계산
Q = ["4Q26", "1Q27", "2Q27", "3Q27", "4Q27"]
qm = re.search(r'var QL=\[(.*?)\]', s)
if qm:
    Q = json.loads("[" + qm.group(1) + "]")
stats = {}
for g in ("f", "d"):
    stats[g] = []
    for i in range(len(Q)):
        v = sorted(x[i] for x in groups[g].values() if x[i] is not None)
        n = len(v)
        if not n:
            stats[g].append(None)
            continue
        med = v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2
        stats[g].append({"mean": r0(sum(v) / n), "med": r0(med), "lo": r0(v[0]), "hi": r0(v[-1]), "n": n})

# 3) 2페이지 평균 표
avg = s[s.index('<section id="avg">'):]
avg = avg[:avg.index("</table>")]
for row in re.findall(r'<tr><td class="q">(.*?)</td>(.*?)</tr>', avg, re.S):
    q, rest = row
    cells = [re.sub(r"<[^>]+>", "", c) for c in re.findall(r"<td[^>]*>(.*?)</td>", rest, re.S)]
    i = Q.index(q)
    for g, off in (("f", 0), ("d", 4)):
        st = stats[g][i]
        want = [f"{st['mean']:,}", f"{st['med']:,}", f"{st['lo']:,}~{st['hi']:,}", str(st["n"])] if st else ["–"] * 4
        got = [c.strip() for c in cells[off:off + 4]]
        if got != want:
            problems.append(f"[평균 표] {q} {'외국계' if g == 'f' else '국내'} 표 {got} != 계산 {want}")

# 상단 카드 (4Q26, 4Q27)
for label, i in (("2026년 4분기 평균 전망", 0), ("2027년 4분기 평균 전망", len(Q) - 1)):
    if label not in s:
        continue
    blk = s[s.index(label):]
    blk = blk[:blk.index('<span class="foot"')]
    pairs = re.findall(r'\((\d+)곳\)</span><span class="v">([\d,]+)</span>', blk)
    for (n, v), g in zip(pairs, ("f", "d")):
        st = stats[g][i]
        if int(n) != st["n"] or num(v) != st["mean"]:
            problems.append(f"[상단 카드] {label} {'외국계' if g == 'f' else '국내'} ({n}곳, {v}) != 계산 ({st['n']}곳, {st['mean']:,})")

# 블룸버그 비교표의 '이 자료의 기관 평균' 행
for row, g in zip(re.findall(r'<tr class="ours">(.*?)</tr>', s, re.S), ("f", "d")):
    vals = [num(c) for c in re.findall(r'<td class="n">(.*?)</td>', row, re.S)][:len(Q)]
    want = [st["mean"] if st else None for st in stats[g]]
    if vals != want:
        problems.append(f"[블룸버그 비교표] {'외국계' if g == 'f' else '국내'} 평균 행 {vals} != 계산 {want}")

print("분기:", " ".join(Q))
for g, nm in (("f", "외국계"), ("d", "국내")):
    print(nm, " | ".join(f"{q} 평균 {st['mean']:,} 중앙 {st['med']:,} {st['lo']:,}~{st['hi']:,} N{st['n']}" if st else f"{q} –"
                         for q, st in zip(Q, stats[g])))
if problems:
    print("\n불일치", len(problems), "건:")
    for p in problems:
        print(" -", p)
    sys.exit(1)
print("\n모든 수치 일치")
