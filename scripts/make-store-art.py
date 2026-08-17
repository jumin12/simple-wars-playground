"""Build logo + Steam art from live in-game canvas screenshots."""
from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

PLAY = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
STEAM = os.path.abspath(os.path.join(PLAY, '..', 'simple wars steam'))
BRAND = os.path.join(PLAY, 'branding')
STEAM_BUILD = os.path.join(STEAM, 'build')
STEAM_ART = os.path.join(STEAM, 'steam', 'art')
CAPTURES = os.path.join(PLAY, 'output', 'store-captures')

NAVY = (10, 18, 28, 255)
GOLD = (212, 175, 55, 255)
GOLD2 = (241, 196, 15, 255)
TEXT = (236, 240, 241, 255)
GREEN = (46, 204, 113)
RED = (231, 76, 60)


def font(size, bold=True):
    cands = [
        r'C:\Windows\Fonts\segoeuib.ttf' if bold else r'C:\Windows\Fonts\segoeui.ttf',
        r'C:\Windows\Fonts\arialbd.ttf' if bold else r'C:\Windows\Fonts\arial.ttf',
    ]
    for p in cands:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


OFFMAP = (21, 67, 96)


def trim_offmap(im, pad=8):
    """Drop empty canvas fill (#154360) so crops sit on real hexes."""
    rgb = im.convert('RGB')
    w, h = rgb.size
    pix = rgb.load()

    def is_fill(c):
        return abs(c[0] - OFFMAP[0]) <= 3 and abs(c[1] - OFFMAP[1]) <= 3 and abs(c[2] - OFFMAP[2]) <= 3

    minx, miny, maxx, maxy = w, h, -1, -1
    step = 2 if w * h > 2_000_000 else 1
    for y in range(0, h, step):
        for x in range(0, w, step):
            if not is_fill(pix[x, y]):
                if x < minx:
                    minx = x
                if y < miny:
                    miny = y
                if x > maxx:
                    maxx = x
                if y > maxy:
                    maxy = y
    if maxx < 0:
        return im, (0, 0)
    minx = max(0, minx - pad)
    miny = max(0, miny - pad)
    maxx = min(w - 1, maxx + pad)
    maxy = min(h - 1, maxy + pad)
    return im.crop((minx, miny, maxx + 1, maxy + 1)), (minx, miny)


def load_shot(name):
    path = os.path.join(CAPTURES, name)
    if not os.path.exists(path):
        raise FileNotFoundError('missing capture: ' + path)
    im = Image.open(path).convert('RGBA')
    if im.size[0] < 200 or im.size[1] < 200:
        raise RuntimeError('capture too small: ' + name)
    trimmed, origin = trim_offmap(im)
    # Keep the original camera focus (frame center) inside the trimmed image.
    ox, oy = origin
    fx = (im.size[0] / 2 - ox) / max(1, trimmed.size[0])
    fy = (im.size[1] / 2 - oy) / max(1, trimmed.size[1])
    trimmed.info['focus'] = (min(0.95, max(0.05, fx)), min(0.95, max(0.05, fy)))
    return trimmed


def panel_frame(im, gold_w=4):
    d = ImageDraw.Draw(im)
    w, h = im.size
    d.rectangle([2, 2, w - 3, h - 3], outline=GOLD, width=gold_w)
    d.rectangle([8, 8, w - 9, h - 9], outline=(212, 175, 55, 80), width=1)
    return im


def fit_cover(src, size, focus=None):
    tw, th = size
    sw, sh = src.size
    scale = max(tw / sw, th / sh)
    nw, nh = max(tw, int(round(sw * scale))), max(th, int(round(sh * scale)))
    resized = src.resize((nw, nh), Image.Resampling.LANCZOS)
    if focus is None:
        fx, fy = src.info.get('focus', (0.5, 0.5))
    else:
        fx, fy = focus
    x = int(fx * nw - tw / 2)
    y = int(fy * nh - th / 2)
    x = max(0, min(nw - tw, x))
    y = max(0, min(nh - th, y))
    return resized.crop((x, y, x + tw, y + th))


def square_crop(src, side=None):
    w, h = src.size
    side = min(w, h) if side is None else min(side, w, h)
    fx, fy = src.info.get('focus', (0.5, 0.5))
    x = int(fx * w - side / 2)
    y = int(fy * h - side / 2)
    x = max(0, min(w - side, x))
    y = max(0, min(h - side, y))
    return src.crop((x, y, x + side, y + side))


def rounded_paste(dst, src, xy, radius):
    mask = Image.new('L', src.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, src.size[0] - 1, src.size[1] - 1], radius=radius, fill=255
    )
    dst.paste(src, xy, mask)


def make_emblem(shot, px=1024):
    # Bias the square toward land if the clash sits on a coastline
    # (camera focus is often over water on island maps).
    fx, fy = shot.info.get('focus', (0.5, 0.5))
    shot.info['focus'] = (min(fx, 0.46), fy)
    crop = square_crop(shot)
    canvas = Image.new('RGBA', (px, px), NAVY)
    pad = int(px * 0.055)
    inner = crop.resize((px - 2 * pad, px - 2 * pad), Image.Resampling.LANCZOS)
    rad = int(inner.size[0] * 0.08)
    rounded_paste(canvas, inner, (pad, pad), rad)
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle(
        [pad - 3, pad - 3, px - pad + 2, px - pad + 2],
        radius=rad + 6,
        outline=GOLD,
        width=max(6, px // 90),
    )
    d.rounded_rectangle(
        [pad + 6, pad + 6, px - pad - 7, px - pad - 7],
        radius=max(8, rad - 4),
        outline=(212, 175, 55, 95),
        width=2,
    )
    return canvas


def darken_left(im, frac=0.42, strength=0.55):
    w, h = im.size
    veil = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(veil)
    band = int(w * frac)
    for x in range(band):
        a = int(255 * strength * (1 - x / max(1, band)))
        d.line([(x, 0), (x, h)], fill=(8, 14, 22, a))
    return Image.alpha_composite(im.convert('RGBA'), veil)


def darken_bottom(im, frac=0.32, strength=0.7):
    w, h = im.size
    veil = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(veil)
    band = int(h * frac)
    for i in range(band):
        a = int(255 * strength * (i / max(1, band)))
        y = h - band + i
        d.line([(0, y), (w, y)], fill=(8, 14, 22, a))
    return Image.alpha_composite(im.convert('RGBA'), veil)


def save_store(im, stem, as_jpeg=True):
    png_path = os.path.join(STEAM_ART, stem + '.png')
    im.save(png_path, 'PNG')
    if as_jpeg:
        jpeg(im, os.path.join(STEAM_ART, stem + '.jpg'))
    return png_path


def make_library_logo(title='SIMPLE WARS'):
    f = font(160, True)
    probe = Image.new('RGBA', (8, 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(probe)
    bbox = d.textbbox((0, 0), title, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad = 28
    im = Image.new('RGBA', (tw + pad * 2, th + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x, y = pad - bbox[0], pad - bbox[1]
    d.text((x + 3, y + 3), title, font=f, fill=(0, 0, 0, 180))
    d.text((x, y), title, font=f, fill=GOLD2)
    scale = 1280 / im.size[0]
    nw, nh = 1280, max(1, int(round(im.size[1] * scale)))
    return im.resize((nw, nh), Image.Resampling.LANCZOS)


def export_screenshot(src, dest, size=(1920, 1080)):
    shot = fit_cover(
        src.convert('RGBA') if src.mode != 'RGBA' else src,
        size,
        focus=src.info.get('focus', (0.5, 0.5)),
    )
    jpeg(shot, dest)


def add_title(im, title='SIMPLE WARS', pos='left'):
    d = ImageDraw.Draw(im)
    w, h = im.size
    if pos == 'left':
        f1 = font(max(28, h // 6), True)
        shadow = Image.new('RGBA', im.size, (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow)
        y = h * 0.42
        sd.text((30, y + 2), title, font=f1, fill=(0, 0, 0, 170))
        d_im = Image.alpha_composite(im, shadow.filter(ImageFilter.GaussianBlur(2)))
        d = ImageDraw.Draw(d_im)
        d.text((28, y), title, font=f1, fill=GOLD2)
        return d_im
    if pos == 'top-left':
        f1 = font(max(26, h // 5), True)
        d.text((22, 18), title, font=f1, fill=GOLD2)
        return im
    f1 = font(max(40, w // 11), True)
    bbox = d.textbbox((0, 0), title, font=f1)
    tw = bbox[2] - bbox[0]
    d.text(((w - tw) / 2, h * 0.82), title, font=f1, fill=GOLD2)
    return im


def save_ico(master, path):
    sizes = [16, 24, 32, 48, 64, 128, 256]
    imgs = [master.resize((s, s), Image.Resampling.LANCZOS) for s in reversed(sizes)]
    imgs[0].save(path, format='ICO', sizes=[(s, s) for s in reversed(sizes)])


def jpeg(im, path):
    im.convert('RGB').save(path, 'JPEG', quality=93, optimize=True)


def main():
    os.makedirs(BRAND, exist_ok=True)
    os.makedirs(STEAM_BUILD, exist_ok=True)
    os.makedirs(STEAM_ART, exist_ok=True)

    close = load_shot('front-close.png')
    try:
        city = load_shot('front-city.png')
    except FileNotFoundError:
        city = load_shot('front-mid.png') if os.path.exists(os.path.join(CAPTURES, 'front-mid.png')) else close
    wide = load_shot('front-wide.png')
    try:
        terr = load_shot('front-territory.png')
    except FileNotFoundError:
        terr = wide

    emblem = make_emblem(close, 1024)
    emblem.save(os.path.join(BRAND, 'simple-wars-logo.png'), 'PNG')
    emblem.resize((256, 256), Image.Resampling.LANCZOS).save(os.path.join(BRAND, 'menu-logo.png'), 'PNG')
    emblem.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join(BRAND, 'favicon-192.png'), 'PNG')
    emblem.resize((32, 32), Image.Resampling.LANCZOS).save(os.path.join(BRAND, 'favicon-32.png'), 'PNG')
    save_ico(emblem, os.path.join(BRAND, 'simple-wars.ico'))
    save_ico(emblem, os.path.join(PLAY, 'favicon.ico'))
    save_ico(emblem, os.path.join(STEAM_BUILD, 'icon.ico'))
    emblem.save(os.path.join(STEAM_BUILD, 'icon.png'), 'PNG')
    emblem.resize((256, 256), Image.Resampling.LANCZOS).save(os.path.join(STEAM_ART, 'client_icon_256.png'), 'PNG')
    jpeg(emblem.resize((184, 184), Image.Resampling.LANCZOS), os.path.join(STEAM_ART, 'app_icon_184.jpg'))

    header = fit_cover(city, (920, 430), focus=(0.42, 0.48))
    header = darken_left(header, 0.34, 0.50)
    header = add_title(header, pos='left')
    panel_frame(header, 4)
    save_store(header, 'header_capsule_920x430')
    save_store(header, 'library_header_920x430')

    small = fit_cover(close, (462, 174), focus=(0.40, 0.52))
    small = darken_left(small, 0.20, 0.38)
    small = add_title(small, pos='top-left')
    panel_frame(small, 3)
    save_store(small, 'small_capsule_462x174')

    main = fit_cover(city, (1232, 706), focus=(0.45, 0.50))
    main = darken_left(main, 0.32, 0.50)
    main = add_title(main, pos='left')
    panel_frame(main, 5)
    save_store(main, 'main_capsule_1232x706')

    vertical = fit_cover(terr, (748, 896), focus=(0.48, 0.40))
    vertical = darken_bottom(vertical, 0.26, 0.70)
    vertical = add_title(vertical, pos='bottom')
    panel_frame(vertical, 4)
    save_store(vertical, 'vertical_capsule_748x896')

    lib = fit_cover(terr, (600, 900), focus=(0.48, 0.42))
    lib = darken_bottom(lib, 0.28, 0.72)
    lib = add_title(lib, pos='bottom')
    panel_frame(lib, 4)
    save_store(lib, 'library_capsule_600x900')

    # Library hero must be artwork only — no title text.
    hero = fit_cover(wide, (3840, 1240), focus=(0.50, 0.50))
    hero.save(os.path.join(STEAM_ART, 'library_hero_3840x1240.png'), 'PNG')
    jpeg(hero, os.path.join(STEAM_ART, 'library_hero_3840x1240.jpg'))

    logo = make_library_logo()
    logo.save(os.path.join(STEAM_ART, 'library_logo.png'), 'PNG')

    bg = fit_cover(wide, (1438, 810), focus=(0.5, 0.5))
    bg = darken_left(bg, 1.0, 0.22)
    jpeg(bg, os.path.join(STEAM_ART, 'page_background_1438x810.jpg'))

    shots_dir = os.path.join(STEAM_ART, 'screenshots')
    os.makedirs(shots_dir, exist_ok=True)
    export_screenshot(close, os.path.join(shots_dir, '01_front.jpg'))
    export_screenshot(city, os.path.join(shots_dir, '02_city.jpg'))
    export_screenshot(wide, os.path.join(shots_dir, '03_island.jpg'))
    export_screenshot(terr, os.path.join(shots_dir, '04_territory.jpg'))
    hud_path = os.path.join(CAPTURES, 'screenshot-hud.png')
    if os.path.exists(hud_path):
        hud = Image.open(hud_path).convert('RGBA')
        export_screenshot(hud, os.path.join(shots_dir, '05_hud.jpg'), size=(1920, 1080))

    print('screenshot-based emblem + store art written')
    for folder in (BRAND, STEAM_ART, STEAM_BUILD, CAPTURES):
        print('---', folder)
        if not os.path.isdir(folder):
            continue
        for f in sorted(os.listdir(folder)):
            p = os.path.join(folder, f)
            if os.path.isfile(p):
                print(f, os.path.getsize(p))


if __name__ == '__main__':
    main()
