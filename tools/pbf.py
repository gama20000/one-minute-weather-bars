import struct
class PBF:
    def __init__(self, path):
        d=open(path,'rb').read(); self.d=d
        ver=d[0]; self.max_h=d[1]; self.n=struct.unpack_from('<H',d,2)[0]
        self.wild=struct.unpack_from('<H',d,4)[0]
        if ver==1: raise Exception('v1')
        self.ts=d[6]; self.cpb=d[7]
        if ver>=3: hs=d[8]; feat=d[9]
        else: hs=8; feat=0
        self.off16=bool(feat&1); self.rle=bool(feat&2)
        self.ht=hs; self.ot=hs+4*self.ts
        esz=self.cpb+(2 if self.off16 else 4)
        self.esz=esz
        # glyph table start = after all offset tables
        total=0
        for i in range(self.ts):
            h,c,o=struct.unpack_from('<BBH',d,hs+4*i); total+=c
        self.gt=self.ot+total*esz
        self.cache={}
    def find(self,cp):
        h,c,o=struct.unpack_from('<BBH',self.d,self.ht+4*(cp%self.ts))
        for k in range(c):
            p=self.ot+o+k*self.esz
            code=struct.unpack_from('<H' if self.cpb==2 else '<I',self.d,p)[0]
            off=struct.unpack_from('<H' if self.off16 else '<I',self.d,p+self.cpb)[0]
            if code==cp: return off
        return None
    def glyph(self,cp):
        if cp in self.cache: return self.cache[cp]
        off=self.find(cp)
        if off is None: off=self.find(self.wild)
        p=self.gt+off
        w,h,l,t,adv=struct.unpack_from('<BBbbb',self.d,p); p+=5
        bits=[]
        if self.rle:
            units=h; nb=(units+1)//2; data=self.d[p:p+nb]; cnt=0
            for byte in data:
                for s in range(2):
                    if cnt>=units: break
                    u=(byte>>(4*s))&0xF; ln=(u&7)+1; bits+= [1 if u&8 else 0]*ln; cnt+=1
            h=len(bits)//w if w else 0
        else:
            nbits=w*h; nbytes=(nbits+31)//32*4
            for i in range(nbits): bits.append((self.d[p+i//8]>>(i%8))&1)
        g=(w,h,l,t,adv,bits); self.cache[cp]=g; return g
    def width(self,s):
        return sum(self.glyph(ord(c))[4] for c in s)
    def has(self,c): return self.find(ord(c)) is not None
    def draw(self,img,x,y,s,color):
        px=img.load()
        for c in s:
            w,h,l,t,adv,bits=self.glyph(ord(c))
            for j in range(h):
                for i in range(w):
                    if bits[j*w+i]:
                        X,Y=x+l+i,y+t+j
                        if 0<=X<img.width and 0<=Y<img.height: px[X,Y]=color
            x+=adv

import freetype
class TTF(PBF):
    """Emulates Pebble fontgen.py rasterisation (mono, set_pixel_sizes(0,h))."""
    def __init__(self, path, height):
        self.face=freetype.Face(path); self.face.set_pixel_sizes(0,height); self.max_h=height; self.cache={}
    def has(self,c): return self.face.get_char_index(ord(c))!=0
    def glyph(self,cp):
        if cp in self.cache: return self.cache[cp]
        f=self.face; f.load_char(chr(cp), freetype.FT_LOAD_RENDER|freetype.FT_LOAD_MONOCHROME|freetype.FT_LOAD_TARGET_MONO)
        b=f.glyph.bitmap; bits=[]
        for i in range(b.rows):
            row=[]
            for j in range(b.pitch):
                x=b.buffer[i*b.pitch+j]; row+= [(x>>(7-k))&1 for k in range(8)]
            bits+=row[:b.width]
        g=(b.width,b.rows,f.glyph.bitmap_left,self.max_h-f.glyph.bitmap_top,f.glyph.advance.x//64,bits)
        self.cache[cp]=g; return g
