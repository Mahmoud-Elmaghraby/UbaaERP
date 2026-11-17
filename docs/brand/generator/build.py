import math, sys, os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/brand/out'
os.makedirs(OUT, exist_ok=True)
NAVY, BLUE, ORANGE = '#0B2D4D', '#0F77C8', '#FF8A00'
BLUE_FOLD, ORANGE_FOLD = '#3FA9F0', '#FFAE3D'
f = lambda v: f'{v:.2f}'.rstrip('0').rstrip('.')

# ---------- mark geometry (100x100 box) ----------
CX, CY, R, RC = 50, 50, 47, 9   # circumradius, corner radius
verts = [(CX + R*math.cos(math.radians(a)), CY + R*math.sin(math.radians(a))) for a in (-90, -30, 30, 90, 150, 210)]
def rounded_poly(pts, r):
    n = len(pts); d = ''
    for i in range(n):
        p0, p1, p2 = pts[i-1], pts[i], pts[(i+1) % n]
        def toward(a, b, dist):
            L = math.dist(a, b); return (a[0]+(b[0]-a[0])*dist/L, a[1]+(b[1]-a[1])*dist/L)
        v1 = (p0[0]-p1[0], p0[1]-p1[1]); v2 = (p2[0]-p1[0], p2[1]-p1[1])
        ang = math.acos((v1[0]*v2[0]+v1[1]*v2[1])/(math.hypot(*v1)*math.hypot(*v2)))
        t = r / math.tan(ang/2)
        a = toward(p1, p0, t); b = toward(p1, p2, t)
        d += ('M' if i == 0 else 'L') + f'{f(a[0])} {f(a[1])}'
        d += f'A{f(r)} {f(r)} 0 0 1 {f(b[0])} {f(b[1])}'
    return d + 'Z'
HEX = rounded_poly(verts, RC)
# Negative-space triangle (play) — proportions taken from the approved D2 reference
AX, AY, BY, PX = 34.5, 28.5, 71.5, 71.5
PY = (AY + BY) / 2
TRI = rounded_poly([(AX, AY), (PX, PY), (AX, BY)], 2.2)
def out(p, k=1.6): return (CX + (p[0]-CX)*k, CY + (p[1]-CY)*k)
def ext(a, b, k=1.8): return (a[0] + (b[0]-a[0])*k, a[1] + (b[1]-a[1])*k)
TOP, UR, LR, BOT, LL, UL = verts
A, B, P = (AX, AY), (AX, BY), (PX, PY)
def poly(pts): return 'M' + 'L'.join(f'{f(x)} {f(y)}' for x, y in pts) + 'Z'
# Pinwheel: each triangle corner runs to a hexagon corner (A->top, P->upper-right, B->lower-left).
# Folds are flat lighter facets, never gradients.
REGIONS = {
  'navy':         poly([A, ext(A, TOP), out(TOP), out(UR), ext(P, UR), P]),
  'blue':         poly([A, ext(A, UL), out(UL), out(LL), ext(B, LL), B]),
  'blue_fold':    poly([A, ext(A, TOP), out(TOP), out(UL), ext(A, UL)]),
  'orange':       poly([P, ext(P, UR), out(UR), out(LR), out(BOT), ext(B, BOT), B]),
  'orange_fold2': poly([B, ext(B, BOT), out(BOT), out(LL), ext(B, LL)]),
  'orange_fold':  'M0 0Z',
}
def mark(uid, colors, tx=0, ty=0, s=1.0):
    """colors: dict region->fill, or a single fill for one-colour versions."""
    one = isinstance(colors, str)
    g = [f'<g transform="translate({f(tx)} {f(ty)}) scale({f(s)})">']
    g.append(f'<clipPath id="{uid}"><path d="{HEX}"/></clipPath>')
    if one:
        g.append(f'<path d="{HEX}{TRI}" fill="{colors}" fill-rule="evenodd"/>')
    else:
        g.append(f'<g clip-path="url(#{uid})">')
        for k in ('navy', 'blue', 'blue_fold', 'orange', 'orange_fold', 'orange_fold2'):
            g.append(f'<path d="{REGIONS[k]}" fill="{colors[k]}"/>')
        g.append('</g>')
        g.append(f'<path d="{TRI}" fill="{colors["hole"]}"/>' if colors.get('hole') else '')
    g.append('</g>')
    return ''.join(g)
FULL = dict(navy=NAVY, blue=BLUE, blue_fold=BLUE_FOLD, orange=ORANGE, orange_fold=ORANGE_FOLD, orange_fold2=ORANGE_FOLD)
# On a navy surface the navy band needs a lift so the shape survives.
ON_DARK = dict(FULL, navy='#1D5A8C')

# The triangle must stay a real hole (transparent). Coloured versions cut it with evenodd on the clip.
def mark_cut(uid, colors, tx=0, ty=0, s=1.0):
    g = [f'<g transform="translate({f(tx)} {f(ty)}) scale({f(s)})">',
         f'<clipPath id="{uid}"><path d="{HEX}{TRI}" clip-rule="evenodd"/></clipPath>',
         f'<g clip-path="url(#{uid})">']
    for k in ('navy', 'blue', 'blue_fold', 'orange', 'orange_fold', 'orange_fold2'):
        g.append(f'<path d="{REGIONS[k]}" fill="{colors[k]}"/>')
    g.append('</g></g>')
    return ''.join(g)

# ---------- wordmark ----------
def wordmark(fontfile, wght, text='Ubaa', tracking=0):
    font = TTFont(fontfile)
    if 'fvar' in font:
        axes = {a.axisTag: a.defaultValue for a in font['fvar'].axes}; axes['wght'] = wght
        font = instancer.instantiateVariableFont(font, axes)
    gs = font.getGlyphSet(); cmap = font.getBestCmap(); upm = font['head'].unitsPerEm
    pen = SVGPathPen(gs); x = 0; bp = BoundsPen(gs)
    for ch in text:
        gn = cmap[ord(ch)]
        tp = TransformPen(pen, (1, 0, 0, -1, x, 0)); gs[gn].draw(tp)
        tb = TransformPen(bp, (1, 0, 0, -1, x, 0)); gs[gn].draw(tb)
        x += gs[gn].width + tracking
    return pen.getCommands(), bp.bounds, upm
