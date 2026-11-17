from PIL import Image, ImageDraw
import pathlib
out = pathlib.Path(__file__).resolve().parent.parent / "app" / "icons"
out.mkdir(parents=True, exist_ok=True)
def icon(size, maskable=False):
    s = size; im = Image.new("RGBA", (s, s), (0,0,0,0)); d = ImageDraw.Draw(im)
    bg = (138, 63, 176, 255)  # 明るい九大紫
    if maskable: d.rectangle([0,0,s,s], fill=bg)
    else: d.rounded_rectangle([0,0,s-1,s-1], radius=int(s*0.22), fill=bg)
    k = 0.72 if maskable else 1.0
    def P(x, y): return (s/2 + (x-0.5)*s*k, s/2 + (y-0.5)*s*k)
    # bus body
    d.rounded_rectangle([*P(0.2,0.2), *P(0.8,0.74)], radius=int(s*0.08*k), fill=(255,255,255,255))
    d.rectangle([*P(0.26,0.29), *P(0.74,0.5)], fill=(138,63,176,255))
    d.line([P(0.5,0.29), P(0.5,0.5)], fill=(255,255,255,255), width=max(2,int(s*0.02*k)))
    for cx in (0.3, 0.7):
        d.ellipse([*P(cx-0.04,0.6), *P(cx+0.04,0.68)], fill=(245,180,40,255))
    for cx in (0.32, 0.68):
        d.rounded_rectangle([*P(cx-0.06,0.72), *P(cx+0.06,0.82)], radius=int(s*0.02*k), fill=(255,255,255,255))
    return im
for sz in (192, 512):
    icon(sz).save(out / f"icon-{sz}.png")
    icon(sz, True).save(out / f"maskable-{sz}.png")
icon(180, True).convert("RGB").save(out / "apple-touch-icon.png")
print("ok")
