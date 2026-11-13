import {describe,expect,it} from 'vitest';
import {newSave,act,activeQuest,validSave,pressLine,recordEvidence} from './state';
import {canStand,DOORS,OBJECTS,START,movePlayer,roomAt,withinReach,type DoorStates,type ObjectId} from './map';

describe('administration case',()=>{
  it('can only complete the chapter through the clues and real door/power states',()=>{
    let s=newSave();
    const use=(id:Parameters<typeof act>[1])=>{s=act(s,id).state;};
    use('terminal');use('underDesk');use('archiveCache');use('fileZero');use('archiveDoor');
    expect(s.items).toEqual([]);expect(s.doors.archive).toBe(false);
    use('dutyLog');use('underDesk');use('technicalDoor');
    expect(s.doors.technical).toBe(true);
    s=pressLine(s,'cctv').state;expect(s.breaker).toEqual([]);
    for(const line of ['lights','locks','cctv'] as const)s=pressLine(s,line).state;
    expect(s.power).toBe(false);use('powerDiagram');
    for(const line of ['lights','locks','cctv'] as const)s=pressLine(s,line).state;
    use('surveillanceDoor');expect(s.doors.surveillance).toBe(true);
    s=recordEvidence(s,'archive','shift',13).state;
    expect(s.archiveClue).toBe(false);
    s=recordEvidence(s,'reception','shift',13).state;
    use('archiveCache');use('archiveDoor');use('fileZero');expect(s.items).not.toContain('file');
    s=recordEvidence(s,'corridor','shift',19).state;
    use('fileZero');expect(s.items).not.toContain('file');
    use('archiveIndex');
    use('fileZero');expect(s.items).toContain('file');
    s=recordEvidence(s,'archive','future',7).state;
    expect(s.finished).toBe(true);expect(activeQuest(s).id).toBe('school');
    expect(validSave(s)).toBe(true);
  });
  it('rejects incompatible saves and impossible or wall coordinates',()=>{
    expect(validSave({...newSave(),version:3})).toBe(false);
    expect(validSave({...newSave(),x:99})).toBe(false);
    expect(validSave({...newSave(),finished:true})).toBe(false);
    expect(validSave({...newSave(),items:['archiveKey']})).toBe(false);
  });
});

it('holds a walking circle outside locked rooms, but passes the same portal after unlock',()=>{
  const closed=newSave().doors,d=DOORS.technical;
  const start={x:.7,z:d.z};
  expect(canStand(0,d.z,closed)).toBe(false);
  expect(movePlayer(start,-1.4,0,closed).x).toBeGreaterThan(0);
  const open={...closed,technical:true};
  expect(canStand(0,d.z,open)).toBe(true);
  expect(movePlayer(start,-1.4,0,open).x).toBeLessThan(-.5);
  expect(canStand(0,d.z+1.25,open)).toBe(false);
  expect(canStand(-.80,d.z-d.half,open)).toBe(false);
  expect(canStand(OBJECTS.terminal.x,OBJECTS.terminal.z+.18,open)).toBe(true);
});

it('connects every usable object to the same walkable floor and seals all locked rooms',()=>{
  const flood=(doors:DoorStates)=>{
    const step=.15,queue=[{ix:0,iz:0}],visited=new Set(['0,0']);
    const rooms=new Set(),targets=new Set<ObjectId>();
    for(let i=0;i<queue.length;i++){
      const {ix,iz}=queue[i]!,x=START.x+ix*step,z=START.z+iz*step;
      rooms.add(roomAt(x,z));
      for(const id of Object.keys(OBJECTS) as ObjectId[])if(withinReach(id,{x,z}))targets.add(id);
      for(const [a,b] of [[1,0],[-1,0],[0,1],[0,-1]] as const){
        const nx=ix+a,nz=iz+b,key=nx+','+nz;
        if(!visited.has(key)&&canStand(START.x+nx*step,START.z+nz*step,doors)){
          visited.add(key);queue.push({ix:nx,iz:nz});
        }
      }
    }
    return {rooms,targets};
  };
  const before=flood(newSave().doors);
  expect([...before.rooms].sort()).toEqual(['reception']);
  expect(before.targets.has('receptionDoor')).toBe(true);
  const opened=flood({...newSave().doors,reception:true});
  expect([...opened.rooms].sort()).toEqual(['corridor','reception']);
  expect(opened.targets.has('terminal')).toBe(false);
  const after=flood({technical:true,surveillance:true,archive:true,reception:true});
  expect(after.rooms.size).toBe(5);
  expect([...after.targets].sort()).toEqual(Object.keys(OBJECTS).sort());
});

describe('torch and lighter',()=>{
  it('the lighter is in the desk drawer, the torch stands by the wall, F lights it; old saves lose the flashlight',async()=>{
    const {lightTorch,canIgnite,upgradeSave}=await import('./state');
    let s=newSave();expect(activeQuest(s).id).toBe('light');
    expect(lightTorch(s).state).toBe(s);
    s=act(s,'torch').state;expect(s.items).toContain('torch');expect(s.lightOn).toBe(false);
    expect(canIgnite(s)).toBe(false);expect(lightTorch(s).message).toMatch(/зажигалк/);
    s=act(s,'drawer').state;expect(s.items).toContain('lighter');expect(canIgnite(s)).toBe(true);
    expect(act(s,'drawer').document?.title).toBe('Ящик стола');
    s=lightTorch(s).state;expect(s.lightOn).toBe(true);expect(s.lit).toBe(true);
    expect(canIgnite(s)).toBe(false);expect(activeQuest(s).id).toBe('reception');expect(validSave(s)).toBe(true);
    const {lightOn:_a,lit:_b,...rest}=newSave();
    const old={...rest,charge:50,spare:1,taken:['battery1'],items:['flashlight']};
    const up=upgradeSave(old) as {items:string[]};
    expect(validSave(up)).toBe(true);expect(up.items).not.toContain('flashlight');
  });
});

it('is first person only and clamps look sensitivity',async()=>{
  const {sanitizeSettings}=await import('./state');
  expect(sanitizeSettings(null).view).toBe('fps');
  expect(sanitizeSettings({view:'iso'}).view).toBe('fps');
  expect(sanitizeSettings({view:'nonsense',sensitivity:99}).view).toBe('fps');
  expect(sanitizeSettings({sensitivity:99}).sensitivity).toBe(2.5);
  expect(sanitizeSettings({keys:{up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD',interact:'KeyE',sprint:'ShiftLeft',crouch:'ControlLeft',light:'KeyF'}}).keys.crouch).toBe('ControlLeft');
});
