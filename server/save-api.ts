// Railway Function entry point (Bun). The bearer token is a 256-bit device secret;
// only its SHA-256 digest is stored. No names, email addresses or payments.
import { SQL } from 'bun';
const sql = new SQL(Bun.env.DATABASE_URL || 'postgres://localhost/100gate');
const origins = new Set(['https://100gate.online','https://www.100gate.online',...(Bun.env.ALLOWED_ORIGINS||'').split(',').filter(Boolean)]);
const rates = new Map<string,{count:number;until:number}>();
let ready:Promise<unknown>|undefined;
function database(){return ready ||= sql`CREATE TABLE IF NOT EXISTS game_saves (token_hash CHAR(64) PRIMARY KEY, payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`.catch(e=>{ready=undefined;throw e;});}
function valid(s:any){return s&&s.version===1&&['flags','items','read','doors','moved'].every(k=>Array.isArray(s[k])&&s[k].length<=150&&s[k].every((v:any)=>typeof v==='string'&&v.length<=80))&&Array.isArray(s.position)&&s.position.length===3&&s.position.every((n:any)=>Number.isFinite(n)&&Math.abs(n)<200)&&Number.isFinite(s.yaw)&&Number.isFinite(s.pitch)&&Number.isInteger(s.room)&&s.room>=0&&s.room<10;}
export default {
  port:Number(Bun.env.PORT)||3000,
  maxRequestBodySize:32768,
  async fetch(req:Request){
    const origin=req.headers.get('Origin');const allowed=!origin||origins.has(origin)||(!Bun.env.RAILWAY_ENVIRONMENT_ID&&/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin));
    const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
    if(origin&&allowed){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='Authorization, Content-Type';headers['Access-Control-Allow-Methods']='GET, PUT, OPTIONS';}
    const json=(data:unknown,status=200)=>Response.json(data,{status,headers});
    if(!allowed)return json({error:'Origin not allowed'},403);
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
    const path=new URL(req.url).pathname;
    if(path==='/health'){try{await database();await sql`SELECT 1`;return json({status:'ok',storage:'postgresql'});}catch{return json({status:'unavailable'},503);}}
    if(path!=='/api/save')return json({error:'Not found'},404);
    const match=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.get('Authorization')||'');if(!match)return json({error:'Device token required'},401);
    const hash=new Bun.CryptoHasher('sha256').update(match[1]).digest('hex');const now=Date.now();
    if(rates.size>2000){for(const [k,v]of rates)if(v.until<now)rates.delete(k);if(rates.size>2000)return json({error:'Busy'},429);}
    const rate=rates.get(hash);if(rate&&rate.until>now){if(++rate.count>45)return json({error:'Too many requests'},429);}else rates.set(hash,{count:1,until:now+60000});
    try{
      await database();
      if(req.method==='GET'){const rows=await sql`SELECT payload FROM game_saves WHERE token_hash=${hash}`;return rows.length?json(rows[0].payload):json({error:'No save'},404);}
      if(req.method==='PUT'){
        let data;try{data=await req.json();}catch{return json({error:'Invalid JSON'},400);}if(!valid(data))return json({error:'Invalid save'},400);
        const payload={version:1,flags:data.flags,items:data.items,read:data.read,doors:data.doors,moved:data.moved,position:data.position,yaw:data.yaw,pitch:data.pitch,room:data.room,updatedAt:new Date().toISOString()};
        await sql`INSERT INTO game_saves (token_hash,payload) VALUES (${hash},${sql.json(payload)}) ON CONFLICT(token_hash) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()`;return json({saved:true});
      }
      return json({error:'Method not allowed'},405);
    }catch{return json({error:'Storage unavailable'},503);}
  },
};
