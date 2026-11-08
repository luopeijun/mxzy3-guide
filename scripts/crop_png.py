"""Minimal pure-stdlib PNG cropper: crop a vertical range from a PNG (RGBA/RGB, non-interlaced)."""
import struct, zlib, sys

def read_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    pos = 8
    idat = b''
    meta = {}
    while pos < len(data):
        length, ctype = struct.unpack('>I4s', data[pos:pos+8])
        chunk = data[pos+8:pos+8+length]
        if ctype == b'IHDR':
            w, h, depth, color, comp, filt, inter = struct.unpack('>IIBBBBB', chunk)
            meta = dict(w=w, h=h, depth=depth, color=color, inter=inter)
        elif ctype == b'IDAT':
            idat += chunk
        elif ctype == b'IEND':
            break
        pos += 12 + length
    assert meta['depth'] == 8 and meta['inter'] == 0, meta
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[meta['color']]
    raw = zlib.decompress(idat)
    w, h = meta['w'], meta['h']
    stride = w * channels
    rows = []
    prev = bytearray(stride)
    ptr = 0
    for y in range(h):
        ftype = raw[ptr]; ptr += 1
        line = bytearray(raw[ptr:ptr+stride]); ptr += stride
        if ftype == 1:
            for i in range(channels, stride):
                line[i] = (line[i] + line[i-channels]) & 0xFF
        elif ftype == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ftype == 3:
            for i in range(stride):
                a = line[i-channels] if i >= channels else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xFF
        elif ftype == 4:
            for i in range(stride):
                a = line[i-channels] if i >= channels else 0
                b = prev[i]
                c = prev[i-channels] if i >= channels else 0
                p = a + b - c
                pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        rows.append(bytes(line))
        prev = line
    return meta, channels, rows

def write_png(path, w, h, color_type, rows):
    def chunk(ctype, payload):
        c = struct.pack('>I', len(payload)) + ctype + payload
        return c + struct.pack('>I', zlib.crc32(ctype + payload) & 0xFFFFFFFF)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, color_type, 0, 0, 0)
    raw = b''.join(b'\x00' + r for r in rows)
    out = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b'')
    open(path, 'wb').write(out)

def crop(src, dst, y1, y2):
    meta, ch, rows = read_png(src)
    y2 = min(y2, meta['h'])
    sel = rows[y1:y2]
    write_png(dst, meta['w'], y2 - y1, meta['color'], sel)
    print(f'{dst}: {meta["w"]}x{y2-y1} (from {meta["w"]}x{meta["h"]})')

if __name__ == '__main__':
    crop(sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]))
