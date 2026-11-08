import {appendFile,writeFile} from 'node:fs/promises';

/** QA-only stereo PCM tap. Chromium software WebGL's canvas capture can emit
 * an empty WebM, so keep real Playwright frames and mux the real master bus. */
export async function installStoryRecording(page,path){
  await writeFile(path,'');
  await page.exposeBinding('__storeStoryChunk',(_source,base64)=>appendFile(path,Buffer.from(base64,'base64')));
  await page.addInitScript(()=>{
    const connect=AudioNode.prototype.connect;
    let processor,master,firstMs=0,rate=0,frames=0,peak=0;
    let blocks=[],queue=Promise.resolve();
    const flush=()=>{
      if(!blocks.length)return;
      const batch=blocks;blocks=[];
      queue=queue.then(async()=>{
        const blob=new Blob(batch);
        const encoded=await new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onload=()=>resolve(String(reader.result).split(',')[1]);
          reader.onerror=()=>reject(reader.error);
          reader.readAsDataURL(blob);
        });
        await window.__storeStoryChunk(encoded);
      });
    };
    AudioNode.prototype.connect=function(to,...channels){
      const result=connect.call(this,to,...channels);
      if(!processor&&to instanceof AudioDestinationNode&&this instanceof GainNode){
        master=this;
        const ctx=this.context;
        rate=ctx.sampleRate;
        // Deliberately scoped to the Playwright harness. This observer adds no
        // game behavior; its only speaker output is a zero-valued audio buffer.
        processor=ctx.createScriptProcessor(4096,2,2);
        processor.onaudioprocess=({inputBuffer})=>{
          const left=inputBuffer.getChannelData(0),right=inputBuffer.getChannelData(1);
          if(!firstMs)firstMs=Date.now()-1000*left.length/rate;
          const out=new DataView(new ArrayBuffer(left.length*4));
          for(let i=0;i<left.length;i++){
            const l=Math.max(-1,Math.min(1,left[i])),r=Math.max(-1,Math.min(1,right[i]));
            peak=Math.max(peak,Math.abs(l),Math.abs(r));
            out.setInt16(i*4,Math.round(l*32767),true);out.setInt16(i*4+2,Math.round(r*32767),true);
          }
          blocks.push(out.buffer);frames+=left.length;
          if(blocks.length>=12)flush();
        };
        connect.call(master,processor);
        connect.call(processor,to);
      }
      return result;
    };
    window.__finishStoryMedia=async()=>{
      if(!processor||!master||!frames)throw Error('Game audio bus produced no PCM samples');
      processor.onaudioprocess=null;
      master.disconnect(processor);processor.disconnect();
      flush();await queue;
      if(peak<.003)throw Error('Game audio bus is effectively silent');
      return {format:'s16le',rate,channels:2,frames,peak,firstMs};
    };
  });
}
