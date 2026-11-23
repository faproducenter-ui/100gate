import type {LoadingController,Snapshot} from './loading';

/**
 * LoadingScreen: drives the static #boot element that index.html paints before any script has run.
 *
 * The controller's value is the target; the bar shows a smoothed value that eases towards it (never past it), so a
 * jump from one finished file to the next reads as movement rather than a snap. The percent and the stage are written
 * to the DOM only when they change. finish() is called by the game once its first frame is on the canvas; the screen
 * then fades out and removes itself.
 */
type YandexWindow=Window&{ysdk?:{features?:{LoadingAPI?:{ready?:()=>void}}}};

export class LoadingScreen{
  private readonly fill:HTMLElement;
  private readonly pct:HTMLElement;
  private readonly stage:HTMLElement;
  private readonly errorBox:HTMLElement;
  private readonly message:HTMLElement;
  private readonly retry:HTMLButtonElement;
  private readonly reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  private target=0;
  private shown=0;
  private shownPct=-1;
  private raf=0;
  private last=0;
  private unsubscribe?:()=>void;
  private onRetry?:()=>void;
  private finishing=false;
  private gone=false;

  private constructor(private readonly root:HTMLElement){
    const q=<E extends HTMLElement>(s:string)=>root.querySelector<E>(s)!;
    this.fill=q('.boot-fill');this.pct=q('.boot-pct');this.stage=q('.boot-stage');
    this.errorBox=q('.boot-error');this.message=q('.boot-msg');this.retry=q<HTMLButtonElement>('.boot-retry');
    this.retry.addEventListener('click',this.clickRetry);
    root.dataset.state='loading';
  }
  /** The screen of this page, or null where there is none (tests, or after it has gone). */
  static attach():LoadingScreen|null{
    if(current)return current.gone?null:current;
    const root=typeof document!=='undefined'?document.getElementById('boot'):null;
    return root?(current=new LoadingScreen(root)):null;
  }
  get active(){return !this.gone;}

  bind(controller:LoadingController){
    this.unsubscribe?.();
    this.unsubscribe=controller.subscribe(s=>this.update(s));
  }
  private update(s:Snapshot){
    if(this.gone||this.finishing)return;
    if(s.error)return; // the error view is shown by error(); the bar stays where the work stopped
    this.setStage(s.stage);
    this.target=Math.max(this.target,s.progress);
    this.kick();
  }
  private setStage(text:string){
    if(!text||this.stage.textContent===text)return;
    this.stage.textContent=text;
    if(this.reduced)return;
    // a short fade on the new line only; opacity and transform, nothing that reflows
    this.stage.animate?.([{opacity:0,transform:'translateY(3px)'},{opacity:1,transform:'none'}],{duration:260,easing:'ease-out'});
  }
  private kick(){if(!this.raf&&!this.gone){this.last=performance.now();this.raf=requestAnimationFrame(this.frame);}}
  private readonly frame=(now:number)=>{
    this.raf=0;
    // a frame's timestamp is when the frame began, which can be a little before kick() read the clock: never a negative step
    const dt=Math.min(.1,Math.max(0,(now-this.last)/1000));this.last=Math.max(this.last,now);
    const gap=this.target-this.shown;
    // close most of the gap in about half a second; when finishing, faster, so the full bar is seen but not waited for
    const rate=this.finishing?14:5;
    this.shown=this.reduced||gap<.0015?this.target:Math.min(this.target,this.shown+gap*(1-Math.exp(-rate*dt)));
    this.paint();
    if(this.shown<this.target)this.raf=requestAnimationFrame(this.frame);
    else if(this.finishing)this.fadeOut();
  };
  private paint(){
    this.fill.style.transform=`scaleX(${this.shown.toFixed(4)})`;
    const p=Math.floor(this.shown*100+1e-6);
    if(p!==this.shownPct){this.shownPct=p;this.pct.textContent=p+'%';this.root.setAttribute('aria-valuenow',String(p));}
  }

  /** Something required failed: say so plainly, keep the bar where it was, offer one retry button. */
  error(message:string,onRetry:()=>void){
    if(this.gone)return;
    this.onRetry=onRetry;
    this.root.dataset.state='error';
    this.message.textContent=message;
    this.errorBox.hidden=false;
    this.retry.disabled=false;
    this.retry.focus({preventScroll:true});
  }
  private readonly clickRetry=()=>{
    const run=this.onRetry;if(!run||this.retry.disabled)return;
    this.retry.disabled=true;this.onRetry=undefined; // one retry per failure, never a loop
    this.errorBox.hidden=true;this.root.dataset.state='loading';
    this.target=this.shown=0;this.shownPct=-1;this.paint();
    run();
  };

  /** The first frame is drawn: fill the bar, fade the screen out, then take it out of the page. */
  finish(onHidden?:()=>void){
    if(this.gone||this.finishing)return;
    this.finishing=true;this.target=1;this.onHidden=onHidden;
    this.setStage('Готово');
    this.kick();
  }
  private onHidden?:()=>void;
  private fadeOut(){
    const root=this.root;
    root.dataset.state='done';
    // the platform may start counting the session (and showing its own ad slots) from here: the game is on screen and usable
    try{(window as YandexWindow).ysdk?.features?.LoadingAPI?.ready?.();}catch(e){console.warn('[100GATE] platform ready signal failed',e);}
    let removed=false;
    const remove=()=>{
      if(removed)return;removed=true;
      root.removeEventListener('transitionend',onEnd);window.clearTimeout(fallback);
      this.dispose();root.remove();this.onHidden?.();
    };
    const onEnd=(e:TransitionEvent)=>{if(e.target===root)remove();};
    root.addEventListener('transitionend',onEnd);
    // a hidden tab or reduced motion may never fire transitionend
    const fallback=window.setTimeout(remove,this.reduced?50:1200);
    root.classList.add('boot-out');
  }
  private dispose(){
    this.gone=true;
    if(this.raf)cancelAnimationFrame(this.raf);this.raf=0;
    this.unsubscribe?.();this.unsubscribe=undefined;
    this.retry.removeEventListener('click',this.clickRetry);
  }
}
let current:LoadingScreen|null=null;
