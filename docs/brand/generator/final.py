import sys; sys.argv=['x','/home/claude/brand/out/ubaa-brand']
exec(open('build.py').read())
import os
SV=OUT+'/svg'; os.makedirs(SV,exist_ok=True)
DARK=dict(FULL,navy='#D6E4F2')
WM,WB,_=wordmark('/home/claude/brand/fonts/Montserrat%5Bwght%5D.ttf',700)
wx0,wy0,wx1,wy1=WB; ww,wh=wx1-wx0,wy1-wy0
HX0,HX1=verts[4][0],verts[1][0]   # hexagon horizontal extent
def mono(uid,col,tx=0,ty=0,s=1):
    cut=' '.join(f'M{f(a[0])} {f(a[1])}L{f(b[0])} {f(b[1])}' for a,b in ((A,ext(A,TOP)),(P,ext(P,UR)),(B,ext(B,LL))))
    return (f'<g transform="translate({f(tx)} {f(ty)}) scale({f(s)})"><mask id="{uid}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140">'
            f'<rect x="-20" y="-20" width="140" height="140" fill="#fff"/><path d="{cut}" stroke="#000" stroke-width="2.6" stroke-linecap="round"/></mask>'
            f'<path d="{HEX}{TRI}" fill="{col}" fill-rule="evenodd" mask="url(#{uid})"/></g>')
def svg(w,h,body,title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(w)} {f(h)}" role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n'
def word(col,tx,ty,height):
    s=height/wh
    return f'<path transform="translate({f(tx)} {f(ty)}) scale({f(s)}) translate({f(-wx0)} {f(-wy0)})" d="{WM}" fill="{col}"/>', ww*s
def markf(kind,uid,tx,ty,s):
    uid='ubaa-'+uid+'-'+''.join(ch for ch in kind if ch.isalnum()).lower()
    if kind=='color': return mark_cut(uid,FULL,tx,ty,s)
    if kind=='dark': return mark_cut(uid,DARK,tx,ty,s)
    return mono(uid,kind,tx,ty,s)
files={}
# symbol (crop to hexagon box with 2 units padding)
pad=2; SW=HX1-HX0+2*pad; SH=100-2*3+2*pad
def sym(kind,uid): return svg(SW,SH,markf(kind,uid,-HX0+pad,-3+pad,1),'Ubaa')
files['ubaa-symbol.svg']=sym('color','s')
files['ubaa-symbol-on-dark.svg']=sym('dark','s')
files['ubaa-symbol-mono.svg']=sym(NAVY,'m')
files['ubaa-symbol-white.svg']=sym('#FFFFFF','m')
# horizontal: mark 100 tall, wordmark 50 tall, gap 22
def horiz(kind,wcol,uid):
    mw=HX1-HX0; gap=22; wh_=52
    m=markf(kind,uid,-HX0,-3,1)
    w,wwid=word(wcol,mw+gap,(94-wh_)/2,wh_)
    return svg(mw+gap+wwid,94,m+w,'Ubaa')
files['ubaa-logo-horizontal.svg']=horiz('color',NAVY,'h')
files['ubaa-logo-horizontal-on-dark.svg']=horiz('dark','#FFFFFF','h')
files['ubaa-logo-horizontal-mono.svg']=horiz(NAVY,NAVY,'h')
files['ubaa-logo-horizontal-white.svg']=horiz('#FFFFFF','#FFFFFF','h')
def stacked(kind,wcol,uid):
    wh_=46; wwid=ww*wh_/wh; W=max(wwid,HX1-HX0)+8; mw=HX1-HX0
    m=markf(kind,uid,(W-mw)/2-HX0,0,1)
    w,_=word(wcol,(W-wwid)/2,100+14,wh_)
    return svg(W,100+14+wh_+4,m+w,'Ubaa')
files['ubaa-logo-stacked.svg']=stacked('color',NAVY,'v')
files['ubaa-logo-stacked-on-dark.svg']=stacked('dark','#FFFFFF','v')
w,wwid=word(NAVY,0,0,52); files['ubaa-wordmark.svg']=svg(wwid,52,w,'Ubaa')
for k,v in files.items(): open(f'{SV}/{k}','w').write(v)
print(sorted(files))
