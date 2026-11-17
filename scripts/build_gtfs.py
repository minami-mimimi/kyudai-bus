"""昭和バスの公式オープンデータ（GTFS-JP）から app/data/timetable.json を作る。

データ: 佐賀県バスオープンデータ（昭和自動車株式会社 ほか） CC BY 4.0
        http://opendata.sagabus.info/  （saga-current.zip）

使い方:
  python scripts/build_gtfs.py                 # 最新の zip をダウンロードして変換
  python scripts/build_gtfs.py path/to/zip     # 手元の zip を変換
"""
import csv, io, json, re, sys, zipfile, datetime, pathlib, urllib.request, collections

URL = "http://opendata.sagabus.info/saga-current.zip"
ROUTE_IDS = {"3九州大学線", "3九州大学線（糸島）"}
DAY_OF_SERVICE = {"3_平日": 0, "3_土曜": 1, "3_日祝": 2}


def load_zip():
    if len(sys.argv) > 1:
        return zipfile.ZipFile(sys.argv[1])
    print("downloading", URL)
    req = urllib.request.Request(URL, headers={"User-Agent": "kyudai-bus-timetable"})
    return zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(req, timeout=120).read()))


def rows(z, name):
    return csv.DictReader(io.TextIOWrapper(z.open(name), encoding="utf-8-sig"))


def route_label(route_id, headsign):
    if route_id == "3九州大学線（糸島）":
        return "糸島（前原）"
    h = re.sub(r"^\S+　", "", headsign)  # 先頭の系統番号を除く
    if headsign.startswith("3快速"):
        return "快速"
    for key, label in (("学園通", "学園通経由"), ("周船寺", "周船寺経由"), ("横浜西", "横浜西経由")):
        if key in h:
            return label
    # 経由表記が無い便は系統番号で判定（1=周船寺, 2=横浜西, 3/4=学園通）
    num = headsign.split("　")[0]
    return {"1": "周船寺経由", "2": "横浜西経由", "3": "学園通経由", "4": "学園通経由"}.get(re.sub(r"[A-Z]$", "", num), "学園通経由")


def platform_label(stop_name, stop_id):
    m = re.search(r"(\d+)番乗り場", stop_name) or re.search(r"\((\d+)\)$", stop_name)
    if m:
        return f"{int(m.group(1))}番"
    if "降車場" in stop_name:
        return "降車場"
    return ""


def to_min(t):
    h, m, _ = t.split(":")
    return int(h) * 60 + int(m)


def main():
    z = load_zip()
    feed = next(rows(z, "feed_info.txt"))

    stops = {s["stop_id"]: s for s in rows(z, "stops.txt")}
    parent_name = lambda sid: stops[stops[sid]["parent_station"]]["stop_name"] if stops[sid]["parent_station"] else stops[sid]["stop_name"]

    trips = {}
    for t in rows(z, "trips.txt"):
        if t["route_id"] in ROUTE_IDS and t["service_id"] in DAY_OF_SERVICE:
            trips[t["trip_id"]] = {"r": route_label(t["route_id"], t["trip_headsign"]), "d": DAY_OF_SERVICE[t["service_id"]],
                                   "route_id": t["route_id"], "st": []}
    for st in rows(z, "stop_times.txt"):
        t = trips.get(st["trip_id"])
        if t:
            t["st"].append((int(st["stop_sequence"]), st["stop_id"], to_min(st["departure_time"] or st["arrival_time"])))

    names, plats = [], [""]
    name_idx, plat_idx = {}, {"": 0}
    def ni(n):
        if n not in name_idx: name_idx[n] = len(names); names.append(n)
        return name_idx[n]
    def pi(p):
        if p not in plat_idx: plat_idx[p] = len(plats); plats.append(p)
        return plat_idx[p]

    out = []
    for t in trips.values():
        seq = sorted(t["st"])
        s = []
        for _, sid, m in seq:
            p = pi(platform_label(stops[sid]["stop_name"], sid))
            s.append([ni(parent_name(sid)), m, p] if p else [ni(parent_name(sid)), m])
        out.append({"r": t["r"], "d": t["d"], "s": s})
    out.sort(key=lambda t: (t["d"], t["s"][0][1]))

    # 運賃（のりば違いでも同額なので停留所単位にまとめる）
    fares = {}
    price = {f["fare_id"]: int(f["price"]) for f in rows(z, "fare_attributes.txt")}
    for f in rows(z, "fare_rules.txt"):
        if f["route_id"] in ROUTE_IDS and f["origin_id"] in stops and f["destination_id"] in stops:
            a, b = parent_name(f["origin_id"]), parent_name(f["destination_id"])
            if a in name_idx and b in name_idx:
                fares[f"{name_idx[a]},{name_idx[b]}"] = price[f["fare_id"]]

    # 祝日・年末年始などで別ダイヤになる日
    overrides = {}
    for c in rows(z, "calendar_dates.txt"):
        if c["service_id"] in DAY_OF_SERVICE and c["exception_type"] == "1":
            overrides[c["date"]] = DAY_OF_SERVICE[c["service_id"]]

    data = {
        "source": "昭和自動車 GTFS-JP（佐賀県バスオープンデータ・CC BY 4.0）",
        "fetchedFor": feed["feed_start_date"],
        "validUntil": feed["feed_end_date"],
        "feedVersion": feed["feed_version"],
        "builtAt": datetime.datetime.now().isoformat(timespec="minutes"),
        "stops": names,
        "plats": plats,
        "fares": fares,
        "dayOverrides": overrides,
        "trips": out,
    }
    p = pathlib.Path(__file__).resolve().parent.parent / "app" / "data" / "timetable.json"
    p.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    c = collections.Counter((t["d"], t["r"]) for t in out)
    print("wrote", p, len(names), "stops", len(out), "trips", len(fares), "fares", len(overrides), "override days")
    print(sorted(c.items()))
    print("plats:", plats)


if __name__ == "__main__":
    main()
