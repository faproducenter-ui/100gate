import * as T from 'three';

/**
 * LoadingController: the single record of what the game still has to do before it can be shown.
 *
 * Every step of the start (a model file, the physics engine, building the level, compiling shaders, the first frame)
 * is a task with a weight. Progress = sum(weight × fraction done) / sum(weights). A task's fraction moves only from
 * real signals: bytes received when the server reports a size, otherwise 0 until it finishes and 1 when it has.
 * Nothing advances on a timer, and the total stays below 1 until every task is done.
 */
export type TaskState='pending'|'running'|'done'|'failed';
export type TaskSpec={id:string;label:string;weight:number;/** a failure is logged and the start goes on without it */optional?:boolean};
type Task=TaskSpec&{fraction:number;state:TaskState};
export type Snapshot={progress:number;stage:string;complete:boolean;error?:string};

export class LoadingController{
  private tasks:Task[]=[];
  private readonly listeners=new Set<(s:Snapshot)=>void>();
  private failure?:string;

  /** Declare every task of this start up front, so the total does not jump when a later step begins. Resets any earlier plan. */
  plan(specs:TaskSpec[]){
    this.tasks=specs.map(s=>({...s,fraction:0,state:'pending'}));this.failure=undefined;this.emit();
  }
  private get(id:string){const t=this.tasks.find(x=>x.id===id);if(!t)throw Error('unknown loading task '+id);return t;}
  start(id:string){const t=this.get(id);if(t.state==='pending'){t.state='running';this.emit();}}
  /** A real partial measure (bytes, items) of a running task, 0..1. Never goes backwards. */
  progress(id:string,fraction:number){
    const t=this.get(id);if(t.state==='done'||t.state==='failed')return;
    const f=Math.min(1,Math.max(t.fraction,fraction));
    if(t.state==='pending'||f!==t.fraction){t.state='running';t.fraction=f;this.emit();}
  }
  done(id:string){const t=this.get(id);if(t.state!=='done'){t.state='done';t.fraction=1;this.emit();}}
  fail(id:string,error:unknown){
    const t=this.get(id);
    if(t.optional){console.warn(`[100GATE] optional loading step failed: ${t.label}`,error);this.done(id);return;}
    t.state='failed';
    // the player sees a short sentence; the developer gets the details in the console
    console.error(`[100GATE] loading failed at "${t.label}"`,error);
    this.failure=t.label;this.emit();
  }
  /** Run a step as a task: running while it works, done when it resolves, failed (and rethrown) when it rejects. */
  async track<R>(id:string,work:Promise<R>|(()=>Promise<R>)):Promise<R>{
    this.start(id);
    try{const r=await (typeof work==='function'?work():work);this.done(id);return r;}
    catch(e){this.fail(id,e);throw e;}
  }
  get value(){
    const total=this.tasks.reduce((a,t)=>a+t.weight,0);if(!total)return 0;
    const v=this.tasks.reduce((a,t)=>a+t.weight*t.fraction,0)/total;
    return this.complete?1:Math.min(v,.995);
  }
  get complete(){return this.tasks.length>0&&this.tasks.every(t=>t.state==='done');}
  /** What is being done now: the first task under way, else the next one to start. */
  get stage(){
    const t=this.tasks.find(x=>x.state==='running')??this.tasks.find(x=>x.state==='pending')??this.tasks[this.tasks.length-1];
    return t?.label??'';
  }
  snapshot():Snapshot{return {progress:this.value,stage:this.stage,complete:this.complete,...(this.failure?{error:this.failure}:{})};}
  subscribe(fn:(s:Snapshot)=>void){this.listeners.add(fn);fn(this.snapshot());return ()=>{this.listeners.delete(fn);};}
  private emit(){const s=this.snapshot();for(const fn of this.listeners)fn(s);}
}

/** Files that three's loaders fetch through the default LoadingManager (the wall textures are not awaited by anyone else). */
const pending=new Set<string>();
let seen=0,finished=0;
/** Called on every start and end of a file; returns true once it has seen what it waited for. */
const watchers=new Set<()=>boolean>();
{
  const m=T.DefaultLoadingManager,start=m.itemStart.bind(m),end=m.itemEnd.bind(m),err=m.itemError.bind(m);
  const notify=()=>{for(const w of [...watchers])if(w())watchers.delete(w);};
  m.itemStart=(url:string)=>{if(!pending.has(url)){pending.add(url);seen++;}start(url);notify();};
  // three calls itemEnd after itemError as well, so a missing texture still counts as settled (the wall keeps its plain colour)
  m.itemEnd=(url:string)=>{if(pending.delete(url))finished++;end(url);notify();};
  m.itemError=(url:string)=>{console.warn('[100GATE] asset failed to load:',url);err(url);};
}
/**
 * Resolves when every file the default manager has started (textures the level asked for but nobody awaits) is finished.
 * The fraction is files finished / files known since the call: counted, not timed.
 */
export function managerIdle(onFraction?:(f:number)=>void):Promise<void>{
  if(pending.size===0){onFraction?.(1);return Promise.resolve();}
  const from=finished,known=seen-pending.size;
  return new Promise(resolve=>{
    watchers.add(()=>{
      const total=seen-known,done=finished-from;
      onFraction?.(total>0?done/total:1);
      if(pending.size)return false;
      resolve();return true;
    });
  });
}

/** GLTFLoader progress event → fraction, only when the server reports the size (otherwise the task just finishes at 1). */
export const byteFraction=(e:ProgressEvent)=>e.lengthComputable&&e.total>0?e.loaded/e.total:0;

/** One chance for the browser to paint before a long synchronous step (a frame, or a moment in a background tab, where frames do not run). */
export const paintOpportunity=()=>new Promise<void>(resolve=>{
  const t=setTimeout(resolve,60);requestAnimationFrame(()=>{clearTimeout(t);setTimeout(resolve,0);});
});

