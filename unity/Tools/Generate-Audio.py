"""Deterministic original arcade sound effects; no third-party recordings."""
import math, random, struct, wave
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'Assets/FleetCommander/Resources/Audio'
root.mkdir(parents=True,exist_ok=True)
RATE=22050
def render(name,duration,kind):
    rng=random.Random(name);samples=[];filtered=0
    for i in range(int(RATE*duration)):
        t=i/RATE;u=t/duration;n=rng.uniform(-1,1);filtered=.94*filtered+.06*n
        if kind=='laser':v=math.sin(2*math.pi*(1100*t-1200*t*t))*(1-u)**3
        elif kind=='impact':v=(n*.7+math.sin(t*300)*.3)*math.exp(-t*22)
        elif kind=='water':v=filtered*4
        elif kind=='net':v=filtered*5*math.sin(math.pi*u)
        elif kind=='win':v=sum(math.sin(2*math.pi*f*t) for f in (523.25,659.25,783.99))/3*math.sin(math.pi*u)
        elif kind=='penalty':v=math.sin(2*math.pi*(180*t-50*t*t))*math.sin(math.pi*u)
        elif kind=='goal':v=math.sin(2*math.pi*(660 if u<.45 else 880)*t)*math.sin(math.pi*u)
        elif kind=='launch':v=math.sin(2*math.pi*(140*t+280*t*t))*math.sin(math.pi*u)
        elif kind=='chess':v=(math.sin(t*5200)+n*.5)*math.exp(-t*40)
        else:v=math.sin(2*math.pi*880*t)*math.exp(-t*60)
        # Short fades prevent endpoint clicks; conservative levels leave headroom for a few voices.
        v*=min(1,t/.008,(duration-t)/.012)*.38
        samples.append(struct.pack('<h',int(max(-.9,min(.9,v))*32767)))
    with wave.open(str(root/(name+'.wav')),'wb') as f:f.setparams((1,2,RATE,len(samples),'NONE','not compressed'));f.writeframes(b''.join(samples))
for name,duration,kind in [('ui',.085,'ui'),('laser',.23,'laser'),('impact',.25,'impact'),('net',.45,'net'),('water',4,'water'),('win',1,'win'),('penalty',.45,'penalty'),('goal',.65,'goal'),('launch',.5,'launch'),('chess',.15,'chess'),('hit',.15,'goal')]:render(name,duration,kind)
print('Wrote 11 original effects to',root)
