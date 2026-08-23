#!/usr/bin/env python3
"""Octave-band + level breakdown of an audio clip. builder-audio's own diagnostic;
audioprobe.py is the shared smoke test, this is the microscope."""
import sys, wave, math, numpy as np
def load(p):
    with wave.open(p,"rb") as w:
        n,ch,sw,sr=w.getnframes(),w.getnchannels(),w.getsampwidth(),w.getframerate()
        raw=w.readframes(n)
    a=np.frombuffer(raw,dtype=np.int16).astype(np.float64)/32768.0
    return a.reshape(-1,ch), sr
BANDS=[(20,45),(45,90),(90,180),(180,355),(355,710),(710,1400),(1400,2800),
       (2800,5600),(5600,11200),(11200,22000)]
for p in sys.argv[1:]:
    a,sr=load(p); m=a.mean(axis=1)
    pk=np.abs(a).max(); rms=np.sqrt((m**2).mean())
    # % of samples within 0.5 dB of peak -> limiter flattening
    flat=float((np.abs(m)>pk*0.944).mean())
    n=1<<16
    P=np.zeros(n//2+1)
    hops=0
    for s in range(0,len(m)-n,n//2):
        P+=np.abs(np.fft.rfft(m[s:s+n]*np.hanning(n)))**2; hops+=1
    P/=max(1,hops); f=np.fft.rfftfreq(n,1/sr); tot=P.sum()
    print(f"\n{p}")
    print(f"  peak {20*math.log10(pk+1e-12):6.2f} dBFS   rms {20*math.log10(rms+1e-12):6.2f} dBFS"
          f"   crest {20*math.log10(pk/(rms+1e-12)):5.2f} dB   pinned {flat*100:.2f}%")
    # Spectral flatness, FULL BAND and AUDIBLE BAND. audioprobe.py reports the
    # first; the gap between them is a property of the metric, not of the audio.
    # An rfft at 48 kHz puts 8192 of its 32769 bins above 18 kHz — a quarter of
    # the whole measurement, in a band nobody can hear — and because flatness is
    # a geometric mean it is dominated by whatever is quietest. Round 2's bed
    # measured 0.032 full-band and 0.110 below 16 kHz: the SAME AUDIO, inside
    # the target range or a long way outside it depending only on whether the
    # metric counts ultrasound. Filling that hole with inaudible hiss would
    # "pass" and change nothing anyone can hear, which is precisely how
    # edgedensity.py climbed 14 points without the blind test moving.
    def sflat(pp):
        return float(np.exp(np.mean(np.log(pp + 1e-30))) / (np.mean(pp) + 1e-30))
    print(f"  flatness  full band {sflat(P):.4f}   below 16 kHz {sflat(P[f < 16000]):.4f}"
          f"   (target 0.10-0.62; the gap is the metric, not the mix)")
    row=""
    for lo,hi in BANDS:
        e=P[(f>=lo)&(f<hi)].sum()/tot
        row+=f"{lo:>6}"
    print("  band ",row)
    row=""
    for lo,hi in BANDS:
        e=P[(f>=lo)&(f<hi)].sum()/tot
        row+=f"{20*math.log10(e+1e-12):6.1f}"
    print("  dB   ",row)
    row=""
    for lo,hi in BANDS:
        e=P[(f>=lo)&(f<hi)].sum()/tot
        row+=f"{e*100:5.1f}%"
    print("  share",row)
