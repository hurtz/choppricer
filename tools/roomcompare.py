#!/usr/bin/env python3
"""Compare clips side by side in third-octave bands. builder-audio's evidence
that the aisle, the front end, the chilled run and the desk are four places."""
import sys, wave, math, numpy as np
def load(p):
    with wave.open(p,'rb') as w:
        sr=w.getframerate(); a=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(float)/32768
    return a.reshape(-1,2), sr
cols=[]
for p in sys.argv[1:]:
    a,sr=load(p); m=a.mean(1); n=1<<15
    P=np.zeros(n//2+1); k=0
    for s in range(0,len(m)-n,n//2):
        P+=np.abs(np.fft.rfft(m[s:s+n]*np.hanning(n)))**2; k+=1
    P/=k; f=np.fft.rfftfreq(n,1/sr)
    rms=20*math.log10(np.sqrt((m**2).mean())+1e-12)
    L,R=a[:,0],a[:,1]
    wid=np.sqrt(((L-R)**2).mean())/(np.sqrt(((L+R)**2).mean())+1e-12)
    cen=(P*f).sum()/P.sum()
    cols.append((p.split('/')[-1].replace('.wav',''),P,f,P.sum(),rms,wid,cen))
fc=[63,125,250,500,1000,2000,4000,8000,16000]
print(f"{'Hz':>7} " + " ".join(f"{c[0][:11]:>12}" for c in cols))
for c0 in fc:
    lo,hi=c0/2**0.5,c0*2**0.5
    row=f"{c0:>7} "
    for nm,P,f,tot,_,_,_ in cols:
        e=P[(f>=lo)&(f<hi)].sum()
        # absolute dBFS, not share, so levels are comparable across places
        row+=f"{10*math.log10(e+1e-15):12.1f}"
    print(row)
print(f"{'RMS':>7} " + " ".join(f"{c[4]:12.1f}" for c in cols))
print(f"{'width':>7} " + " ".join(f"{c[5]:12.2f}" for c in cols))
print(f"{'cntrd':>7} " + " ".join(f"{c[6]:12.0f}" for c in cols))
