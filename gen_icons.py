#!/usr/bin/env python3
"""生成占位图标（纯标准库，无外部依赖）用于 Tauri 打包。"""
import os, zlib, struct

ICON_DIR = os.path.join(os.path.dirname(__file__), "src-tauri", "icons")
os.makedirs(ICON_DIR, exist_ok=True)

# 主题色：#5B8DEF
COLOR = (91, 141, 239, 255)


def make_png(size):
    w = h = size
    raw = bytearray()
    for _ in range(h):
        raw.append(0)  # filter type 0
        for _ in range(w):
            raw += bytes(COLOR)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)  # 8-bit RGBA

    def chunk(typ, data):
        c = typ + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)

    sig = b"\x89PNG\r\n\x1a\n"
    idat = zlib.compress(bytes(raw), 9)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def make_ico(pngs):
    """pngs: list of (png_bytes, size)"""
    entries = []
    datas = []
    offset = 6 + 16 * len(pngs)
    for png, size in pngs:
        b = 0 if size >= 256 else size
        entries.append(struct.pack("<BBBBHHII", b, b, 0, 0, 1, 32, len(png), offset))
        datas.append(png)
        offset += len(png)
    header = struct.pack("<HHH", 0, 1, len(pngs))
    return header + b"".join(entries) + b"".join(datas)


if __name__ == "__main__":
    p32 = make_png(32)
    p128 = make_png(128)
    p256 = make_png(256)
    with open(os.path.join(ICON_DIR, "32x32.png"), "wb") as f:
        f.write(p32)
    with open(os.path.join(ICON_DIR, "128x128.png"), "wb") as f:
        f.write(p128)
    with open(os.path.join(ICON_DIR, "128x128@2x.png"), "wb") as f:
        f.write(p256)
    with open(os.path.join(ICON_DIR, "icon.ico"), "wb") as f:
        f.write(make_ico([(p32, 32), (p256, 256)]))
    print("icons generated:", os.listdir(ICON_DIR))
