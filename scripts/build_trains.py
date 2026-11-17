"""JR九州の駅別時刻表から、九大学研都市駅に停まる筑肥線の列車（地下鉄空港線への直通を含む）を取得し、
app/data/trains.json を作る。

対象区間: 福岡空港〜（空港線）〜姪浜〜（筑肥線）〜九大学研都市
使い方:
  python scripts/build_trains.py 20261118 20261121 20261122   # 平日・土曜・日祝の代表日
"""
import datetime, html, json, pathlib, re, sys, time, urllib.parse, urllib.request

BASE = "https://www.jrkyushu-timetable.jp"
STATION_CODE = "29551"  # 九大学研都市
STATION_NAME = "九大学研都市駅"
KEEP = ["福岡空港", "東比恵", "博多", "祇園", "中洲川端", "天神", "赤坂", "大濠公園", "唐人町", "西新", "藤崎", "室見",
        "姪浜", "下山門", "今宿", "九大学研都市"]
SUBWAY = set(KEEP[:12])
UA = {"User-Agent": "Mozilla/5.0 (personal timetable app)"}


def fetch(url, data=None):
    for i in range(3):
        try:
            req = urllib.request.Request(url, data=data, headers=UA)
            t = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
            time.sleep(0.35)
            return t
        except Exception as e:
            print("retry", url, e)
            time.sleep(2)
    raise RuntimeError(url)


def station_page(date):
    form = {"c": STATION_CODE, "n": STATION_NAME, "pg": "0\t1", "dir_cnt": "", "all": "2",
            "year_month": date[:6], "date": str(int(date[6:])), "disp_tt": "1"}
    t = fetch(f"{BASE}/cgi-bin/jr-k_time/tt_dep.cgi", urllib.parse.urlencode(form).encode())
    shown = re.search(r"(\d{4})年(\d{2})月(\d{2})日 \(.\) の時刻表", re.sub(r"\s+", " ", re.sub("<[^>]+>", " ", t)))
    assert shown and "".join(shown.groups()) == date, f"date mismatch {date}"
    return sorted(set(html.unescape(u) for u in re.findall(r'href="(/jr-k_time/[^"]+\.html\?[^"]*)"', t)))


def to_min(hhmm):
    h, m = map(int, hhmm.split(":"))
    t = h * 60 + m
    # JR九州の時刻表は午前4時で日付が変わるので、0〜3時台は前日の24時以降として扱う
    return t + 1440 if t < 240 else t


def train_page(url):
    t = fetch(BASE + url)
    head = re.sub(r"\s+", " ", re.sub("<[^>]+>", " ", t))
    kind = "快速" if re.search(r"列車種\s+快速", head) else "普通"
    stops = []
    for row in re.findall(r"<tr>\s*<!-- 駅名 -->(.*?)</tr>", t, re.S):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        if not cells:
            continue
        name = re.sub(r"<[^>]+>|&nbsp;|\s", "", cells[0])
        times = " ".join(cells[1:])
        arr = re.findall(r"(\d\d:\d\d)\s*着", times)
        dep = re.findall(r"(\d\d:\d\d)\s*発", times)
        if not (arr or dep):
            continue  # 通過
        stops.append((name, to_min(arr[0]) if arr else None, to_min(dep[-1]) if dep else None))
    return kind, stops


def main():
    dates = sys.argv[1:] or ["20261118", "20261121", "20261122"]
    names, idx = [], {}
    def ni(n):
        if n not in idx: idx[n] = len(names); names.append(n)
        return idx[n]

    cache, trips = {}, []
    for d, date in enumerate(dates):
        urls = station_page(date)
        print(date, len(urls), "trains")
        for u in urls:
            key = u.split("?")[0]
            if key not in cache:
                cache[key] = train_page(u)
            kind, stops = cache[key]
            seq = [(n, a, dp) for n, a, dp in stops if n in KEEP]
            # 九大学研都市を含む区間だけ（列車が分割・併合されても範囲内の停車順で扱う）
            if len(seq) < 2:
                continue
            through = any(n in SUBWAY for n, _, _ in seq)
            s = []
            for k, (n, a, dp) in enumerate(seq):
                last = k == len(seq) - 1
                t_dep = a if last or dp is None else dp
                e = [ni(n + "駅"), t_dep, 0]
                if a is not None and a != t_dep:
                    e.append(a)  # 到着時刻が発車時刻と違う場合だけ持つ
                s.append(e)
            trips.append({"r": "筑肥線（空港線直通）" if through else "筑肥線", "k": kind, "d": d, "m": 1,
                          "h": stops[-1][0] + "駅", "s": s})  # h = 実際の行先
        print(" fetched", len(cache), "train pages so far")

    trips.sort(key=lambda t: (t["d"], t["s"][0][1]))
    data = {
        "source": "JR九州 駅別時刻表（九大学研都市駅に停車する筑肥線・空港線直通列車）",
        "dates": dates,
        "builtAt": datetime.datetime.now().isoformat(timespec="minutes"),
        "stops": names,
        "trips": trips,
    }
    p = pathlib.Path(__file__).resolve().parent.parent / "app" / "data" / "trains.json"
    p.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("wrote", p, len(names), "stations", len(trips), "trips")


if __name__ == "__main__":
    main()
