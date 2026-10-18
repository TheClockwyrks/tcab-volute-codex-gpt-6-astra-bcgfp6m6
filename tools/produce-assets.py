"""One-time asset authoring. Requires the supplied generation tools; never used by the build."""
import json, math, pathlib, subprocess, tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets'
TMP=pathlib.Path(tempfile.mkdtemp())
def run(tool,*args):
    subprocess.run([tool,*map(str,args)],check=True,stdout=subprocess.DEVNULL)
def save(name,w,h,ops,sheet=False):
    p=TMP/(name+'.json');p.write_text(json.dumps(ops))
    run('draw-sheet' if sheet else 'draw','render','--actions',p,'--out',OUT/'sprites'/(name+'.png'),'--width',w,'--height',h,'--no-layers')
def circ(x,y,r,c,stroke=False):return dict(op='stroke_circle' if stroke else 'fill_circle',cx=x,cy=y,r=r,color=c)
def rect(x,y,w,h,c):return dict(op='fill_rect',x=x,y=y,width=w,height=h,color=c)
def line(x1,y1,x2,y2,c):return dict(op='line',x0=x1,y0=y1,x1=x2,y1=y2,color=c)
def pix(x,y,c):return dict(op='set_pixel',x=x,y=y,color=c)
colors=['#62e4d2','#ffd365','#74a9ff','#fb7694','#beea7c']
names=['halide','sulfur','cobalt','garnet','olivine']
for k,(name,col) in enumerate(zip(names,colors)):
    ops=[circ(14,14,13,'#06171d'),circ(13,13,12,col),circ(14,15,10,'#234753'),circ(13,12,10,col),circ(12,10,7,col)]
    # Low-right mineral facets and a stepped bright bevel.
    for y in range(6,24):
        for x in range(4,25):
            if (x-13)**2+(y-13)**2<108 and x+y>32:ops.append(pix(x,y,['#267e83','#bd8538','#4361a6','#a94068','#6f9d42'][k]))
    ops += [line(7,7,12,4,'#eaffec'),line(6,8,5,12,'#d4ffed'),pix(19,6,'#ffffff'),pix(21,20,col)]
    glyphs=[[(9,13,18,13),(13,9,13,18)],[(9,16,14,8),(14,8,19,16),(9,16,19,16)],[(10,9,17,9),(17,9,17,17),(17,17,10,17),(10,17,10,9)],[(14,8,19,13),(19,13,14,19),(14,19,9,13),(9,13,14,8)],[(9,9,18,18),(18,9,9,18)]]
    for a,b,c,d in glyphs[k]:ops.append(line(a,b,c,d,'#132b37'))
    save(name,28,28,ops)
for k,name in enumerate(['choke','backflow','bore','sightline']):
    ops=[circ(8,8,7,'#071719'),circ(8,8,6,'#e5c99a',True)]
    shapes=[[(4,5,12,5),(4,10,12,10),(7,3,7,12)],[(11,4,5,8),(5,8,11,12),(5,8,12,8)],[(4,8,12,8),(8,4,8,12),(5,5,11,11)],[(3,8,13,8),(8,3,8,13)]]
    ops += [line(*v,'#fff1ce') for v in shapes[k]]
    save(name,16,16,ops)
ops=[circ(22,22,21,'#081014'),circ(22,22,20,'#687b7b'),circ(22,22,18,'#273f46'),circ(22,22,14,'#b29b6b'),circ(22,22,12,'#152d35'),circ(22,22,9,'#3f6468')]
for x,y in [(8,8),(35,8),(8,35),(35,35)]:ops += [circ(x,y,3,'#091a20'),pix(x,y,'#a4bbb0')]
save('injector-base',44,44,ops)
def barrel(shift=0):
    return [rect(5-shift,4,33,12,'#09171e'),rect(8-shift,5,27,10,'#748a88'),rect(8-shift,8,27,7,'#354c51'),rect(19-shift,5,3,10,'#c4aa73'),rect(33-shift,2,8,16,'#152a32'),rect(35-shift,3,4,14,'#b0b8a1'),rect(39-shift,6,4,8,'#172e37'),line(9-shift,6,30-shift,6,'#c4d3b6')]
save('injector-barrel',44,20,barrel())
for i,shift in enumerate([5,3,1,0]):save('recoil-'+str(i),44,20,barrel(shift),True)
def maw(opening=0):
    ops=[circ(32,32,31,'#080e13'),circ(32,32,29,'#7c745c'),circ(32,32,26,'#263c43'),circ(32,32,23,'#10232b'),circ(32,32,18+opening,'#030a10'),circ(32,32,11,'#251b25'),circ(32,32,7,'#080c12')]
    for a in range(0,360,45):
        r=math.radians(a);x=int(32+26*math.cos(r));y=int(32+26*math.sin(r));ops += [circ(x,y,2,'#c1a778')]
        x=int(32+(18+opening)*math.cos(r));y=int(32+(18+opening)*math.sin(r));ops += [line(x,y,int(x+5*math.sin(r)),int(y-5*math.cos(r)),'#b18661')]
    return ops
save('intake',64,64,maw())
for i,o in enumerate([0,2,4,5,3,1]):save('swallow-'+str(i),64,64,maw(o),True)
for i in range(6):
    ops=[circ(24,24,4+i*3,'#fff5cf',True),circ(24,24,2+i*2,'#ffffff',True)]
    for a in range(0,360,45):
        r=math.radians(a);d=8+i*3;ops += [line(int(24+d*math.cos(r)),int(24+d*math.sin(r)),int(24+(d+4)*math.cos(r)),int(24+(d+4)*math.sin(r)),'#e8fff1')]
    save('flash-'+str(i),48,48,ops,True)
ops=[rect(0,0,64,64,'#20363d')]
for y in range(64):
    for x in range(64):
        v=(x*37+y*71+x*y*11)%101
        if v<9:ops.append(pix(x,y,'#263e44'))
        if v==99:ops.append(pix(x,y,'#182e35'))
ops += [line(0,0,63,0,'#455952'),line(0,63,63,63,'#0d222a'),line(0,0,0,63,'#344c4d'),line(63,0,63,63,'#132a31')]
for x,y in [(4,4),(59,4),(4,59),(59,59)]:ops += [circ(x,y,2,'#0c2029'),pix(x,y,'#6b7770')]
save('plate',64,64,ops)
save('cell',24,24,[rect(5,3,14,19,'#081c22'),rect(7,5,10,15,'#95cec0'),rect(9,7,6,11,'#3f8a83'),rect(9,1,6,3,'#d5d4a8'),line(9,8,14,8,'#e6f4c6')])
save('pressure',24,24,[circ(12,12,10,'#81938b'),circ(12,12,8,'#132b34'),line(12,12,17,6,'#edbd75'),circ(12,12,2,'#f5d9a0')])
# Audio is mixed from voices and the local sample/instrument banks.
def config(name,duration,tool):
    p=TMP/(name+'-config.json');c=dict(sample_rate=22050,channels='mono',max_duration_ms=duration,seed=42,actions=str(TMP/(name+'-ops.json')),preview=str(TMP/(name+'.png')),wav=str(OUT/'audio'/(name+'.wav')),mid=str(OUT/'audio'/(name+'.mid')),sample_pack='combat-core',instrument_bank='synthwave');p.write_text(json.dumps(c));run(tool,'--config',p,'init');return p
def call(tool,p,*a):run(tool,'--config',p,*a)
for name,freq,end,dur in [('fire',180,65,90),('seat',130,90,110),('swap',700,1200,65),('denied',90,55,180),('machinery',440,1100,330)]:
    p=config(name,dur+120,'sfx-synth')
    call('sfx-synth',p,'add-voice','--name','body','--wave','triangle','--freq',freq,'--dur',dur,'--gain','-13')
    call('sfx-synth',p,'set-pitch','--voice','body','--slide-to',end,'--over',dur)
    call('sfx-synth',p,'add-voice','--name','air','--wave','noise','--dur',min(dur,40),'--gain','-24')
    call('sfx-synth',p,'render')
for name,sample,pitch in [(f'extract-{i}','impact_metal_dry',(i-1)*3) for i in range(1,6)]+[('intake','boom_sub_rumble',-3),('cell-lost','cannon_body_heavy',-5),('level-clear','clang_metal',7)]:
    p=config(name,1800,'sfx-sample');call('sfx-sample',p,'add-sample','--name',sample,'--t',0,'--pitch',pitch,'--gain','-12','--fade-out',100);call('sfx-sample',p,'render')
for danger in [False,True]:
    name='danger-loop' if danger else 'hall-loop';p=config(name,8000,'music')
    call('music',p,'set-tempo','--bpm',120)
    for track,instrument in [('bass','synth_bass'),('bell','fm_bell'),('pulse','hat_closed')]:call('music',p,'define-track','--name',track,'--instrument',instrument)
    for beat in range(16):
        call('music',p,'add-note','--track','bass','--pitch',[38,38,41,36][beat//4],'--t',beat,'--dur',.65,'--velocity',48 if danger else 32)
        if beat%2==0:call('music',p,'add-note','--track','bell','--pitch',[62,69,65,60][beat//4],'--t',beat,'--dur',.8,'--velocity',26)
        for sub in range(2 if danger else 1):call('music',p,'add-note','--track','pulse','--pitch',60,'--t',beat+sub*.5,'--dur',.1,'--velocity',28 if danger else 15)
    call('music',p,'render')
for name,speed,life,count,angle,color in [('extraction',110,260,20,180,'#9bf6e3'),('bore',150,650,48,180,'#ffba65'),('intake',65,350,22,25,'#ed8973'),('pickup',55,550,16,35,'#fff1ab')]:
    p=TMP/(name+'-particle.json');p.write_text(json.dumps(dict(width=200,height=200,duration_ms=800,fps=60,seed=53,actions=str(TMP/(name+'-pops.json')),preview=str(TMP/(name+'.gif')),system=str(OUT/'effects'/(name+'.json')))))
    call('particle-2d',p,'init');call('particle-2d',p,'add-emitter','--name','spark','--shape','disc','--radius',5,'--x',0,'--y',0,'--burst',count,'--lifetime',life,'--lifetime-spread',80,'--speed',speed,'--speed-spread',30,'--cone-angle',angle,'--dir-y',-1 if name=='intake' else 1)
    call('particle-2d',p,'set-particle','--emitter','spark','--size-from',1.5,'--size-to',0,'--opacity-from',1,'--opacity-to',0,'--color-gradient',color+'@0,#355b69@1')
    call('particle-2d',p,'render','--frame',8)
print('Produced sprites, animation frames, four live systems and fifteen audio cues.')
