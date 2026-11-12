/** Package and overlay the isometric release without replacing unrelated Pages files.
 * --package builds a clean HEAD; default dry-runs; --apply alone pushes Pages.
 */
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {copyFileSync,existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {basename,dirname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const base=join(root,'.pages-publish');
const manifestPath=join(base,'isometric-manifest.json');
const origin='https://github.com/faproducenter-ui/100gate.git';
const pagesRef='refs/heads/gh-pages';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sha=/^[0-9a-f]{40}$/;
const emitted=/^assets\/[a-z0-9_.-]+-[a-z0-9_-]{8,}\.(?:js|css)$/i;
const safePart=part=>/^[a-z0-9][a-z0-9_.-]*$/i.test(part)&&!part.endsWith('.')&&!/^(?:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)/i.test(part);
const asset=name=>name.startsWith('assets/iso/')&&/\.(?:glb|ktx2|png|jpe?g|webp|avif|svg|ogg|mp3|wav|opus|webm|woff2?|txt|json)$/i.test(name);

export function allowedPath(name){
  return name.split('/').every(safePart)&&(name==='index.html'||emitted.test(name)||asset(name));
}

export function parseEntry(html,names){
  const rows=[...html.matchAll(/<script\b[^>]*\bsrc="\.\/(assets\/index-[a-z0-9_-]{8,}\.js)"[^>]*>/gi)];
  const entry=rows[0]?.[1];
  if(rows.length!==1||!names.includes(entry))throw Error('Missing relative isometric HTML entry');
  for(const [,style] of html.matchAll(/<link\b[^>]*\bhref="\.\/(assets\/[^"]+\.css)"[^>]*>/gi)){
    if(!emitted.test(style)||!names.includes(style))throw Error('HTML references a missing stylesheet');
  }
  return entry;
}

export function sourceRef(value='refs/heads/main'){
  const parts=value.split('/');
  if(!value.startsWith('refs/heads/')||value===pagesRef||parts.length<3||
     parts.some(part=>!safePart(part)||part.includes('..')||part.endsWith('.lock'))){
    throw Error('Use an exact refs/heads/<branch> source ref');
  }
  return value;
}

function git(args,cwd=root,binary=false){
  const r=spawnSync('git',args,{cwd,encoding:binary?null:'utf8',maxBuffer:105*1024*1024});
  if(r.status!==0)throw Error(r.stderr?.toString().trim()||r.error?.message||'Git command failed');
  return binary?r.stdout:r.stdout.trim();
}

function regular(path,folder=false){
  const stat=lstatSync(path);
  if(stat.isSymbolicLink()||!(folder?stat.isDirectory():stat.isFile()))throw Error('Unsafe path: '+path);
  return stat;
}

function inventory(dir){
  regular(dir,true);
  const rows=[],seen=new Set();
  function walk(folder){
    for(const item of readdirSync(folder,{withFileTypes:true})){
      if(!safePart(item.name)||item.isSymbolicLink())throw Error('Unsafe package entry: '+item.name);
      const file=join(folder,item.name),name=relative(dir,file).split(sep).join('/');
      const key=name.toLowerCase();
      if(seen.has(key))throw Error('Case-fold collision: '+name);
      seen.add(key);
      if(item.isDirectory()){walk(file);continue;}
      const stat=regular(file);
      if(!allowedPath(name)||!stat.size||stat.size>=100*1024*1024)throw Error('Unexpected package entry: '+name);
      rows.push({path:name,bytes:stat.size,sha256:hash(readFileSync(file))});
    }
  }
  walk(dir);
  return rows.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}

function clean(expected){
  const source=git(['rev-parse','HEAD']);
  if((expected&&source!==expected)||!sha.test(source)||git(['status','--porcelain','--untracked-files=all'])){
    throw Error('Package/publish from a clean checkout of the exact committed source');
  }
  return source;
}

function localBase(){
  if(!existsSync(base))mkdirSync(base);
  regular(base,true);
}

function isoInventory(dir){
  const files=inventory(dir),paths=files.map(row=>row.path);
  const entry=parseEntry(readFileSync(join(dir,'index.html'),'utf8'),paths);
  if(!paths.includes('assets/iso/alexei-10.glb')||!paths.includes('assets/iso/alexei-credits.txt')){
    throw Error('Isometric player or its attribution is missing');
  }
  const code=files.filter(row=>row.path.endsWith('.js')).map(row=>readFileSync(join(dir,row.path),'utf8')).join('\n');
  if(!code.includes('assets/iso/alexei-10.glb')||/outputs\/(?:story-intro|quality-overhaul)\/|__storyHomeTest/.test(code)){
    throw Error('Package is not the standalone isometric build');
  }
  return {entry,files,buildSha256:hash(JSON.stringify(files))};
}

async function packageIso(){
  const source=clean();
  localBase();
  const build=mkdtempSync(join(base,'iso-build-'));
  const check=spawnSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'-b'],{cwd:root,stdio:'inherit'});
  if(check.status!==0)throw Error(check.error?.message||'TypeScript build failed');
  const {build:buildVite}=await import('vite');
  await buildVite({root,mode:'production',envFile:false,build:{outDir:build,copyPublicDir:false,sourcemap:false}});
  // Use exact committed blobs, not OS-translated or ignored workspace files.
  const rows=git(['ls-tree','-rz',source,'--','public/assets/iso']).split('\0').filter(Boolean);
  for(const row of rows){
    const record=/^100(?:644|755) blob ([0-9a-f]{40})\tpublic\/(assets\/iso\/.+)$/.exec(row);
    if(!record||!allowedPath(record[2]))throw Error('Unsafe committed isometric asset');
    const file=join(build,...record[2].split('/'));
    if(existsSync(file))throw Error('Committed asset collides with build output');
    mkdirSync(dirname(file),{recursive:true});
    writeFileSync(file,git(['cat-file','blob',record[1]],root,true));
  }
  clean(source);
  const checked=isoInventory(build);
  if(lstatSync(manifestPath,{throwIfNoEntry:false}))regular(manifestPath);
  writeFileSync(manifestPath,JSON.stringify({kind:'isometric-package',version:1,source,build:basename(build),...checked},null,2)+'\n');
  return {source,build,entry:checked.entry,buildSha256:checked.buildSha256,files:checked.files.length};
}

function readPackage(source){
  regular(manifestPath);
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  if(manifest.kind!=='isometric-package'||manifest.version!==1||manifest.source!==source||
    typeof manifest.build!=='string'||!/^iso-build-[a-z0-9]+$/i.test(manifest.build)){
    throw Error('Wrong package for this HEAD. Run with --package');
  }
  const build=join(base,manifest.build),check=isoInventory(build);
  if(check.entry!==manifest.entry||check.buildSha256!==manifest.buildSha256||
     JSON.stringify(check.files)!==JSON.stringify(manifest.files))throw Error('Packaged bytes changed after build');
  return {build,...check};
}

function remoteHash(ref){
  const rows=git(['ls-remote','--exit-code','--refs','origin',ref]).split('\n');
  const [commit,name]=rows[0].trim().split(/\s+/);
  if(rows.length!==1||name!==ref||!sha.test(commit))throw Error('Expected exact remote ref: '+ref);
  return commit;
}

function stageTarget(stage,path){
  let cursor=stage;
  const parts=path.split('/');
  for(let i=0;i<parts.length;i++){
    const part=parts[i],folder=i<parts.length-1;
    const match=readdirSync(cursor).find(name=>name.toLowerCase()===part.toLowerCase());
    if(match&&match!==part)throw Error('Pages case-fold collision: '+path);
    cursor=join(cursor,part);
    if(match)regular(cursor,folder);
    else if(folder)mkdirSync(cursor);
  }
  return cursor;
}

function publishIso(apply,ref){
  const source=clean();
  localBase();
  if(git(['remote','get-url','origin'])!==origin||git(['remote','get-url','--push','origin'])!==origin)throw Error('Unexpected Pages repository');
  const {build,entry,buildSha256,files}=readPackage(source);
  if(apply&&remoteHash(ref)!==source)throw Error('Push this exact source to '+ref+' before publishing');
  const stage=mkdtempSync(join(base,'isometric-root-stage-'));
  const run=args=>git(args,stage);
  run(['init','--template=','--initial-branch=gh-pages']);
  run(['config','core.autocrlf','false']);
  run(['remote','add','origin',origin]);
  run(['fetch','--depth=1','origin',pagesRef]);
  run(['checkout','--detach','FETCH_HEAD']);
  const previous=run(['rev-parse','HEAD']);
  const preserved=['story-preview','CNAME','.nojekyll'];
  for(const path of preserved)regular(join(stage,path),path==='story-preview');
  if(readFileSync(join(stage,'CNAME'),'utf8').trim()!=='100gate.online')throw Error('Unexpected custom domain');
  const previousObjects=Object.fromEntries(preserved.map(path=>[path,run(['rev-parse',previous+':'+path])]));
  const marker=stageTarget(stage,'release.json');
  if(existsSync(marker)){
    const prior=JSON.parse(readFileSync(marker,'utf8'));
    if(!['story-production','isometric-production'].includes(prior.kind))throw Error('Unknown production release marker');
    if(prior.source===source)throw Error('This source is already at the Pages root');
  }
  const allowed=new Set(['release.json']);
  for(const file of files){
    const path=stageTarget(stage,file.path),src=join(build,...file.path.split('/'));
    if(existsSync(path)&&file.path!=='index.html'&&hash(readFileSync(path))!==file.sha256){
      throw Error('Version the asset filename instead of replacing a published blob: '+file.path);
    }
    copyFileSync(src,path);
    if(hash(readFileSync(path))!==file.sha256)throw Error('Copied file differs from verified package: '+file.path);
    allowed.add(file.path);
  }
  const release={kind:'isometric-production',source,sourceRef:ref,previousPagesCommit:previous,buildSha256,entry};
  const releaseBytes=JSON.stringify(release,null,2)+'\n';
  writeFileSync(marker,releaseBytes);
  run(['add','--',...allowed]);
  const paths=run(['diff','--cached','--no-renames','--name-only','-z']).split('\0').filter(Boolean);
  if(!paths.includes('index.html')||!paths.includes('release.json')||paths.some(path=>!allowed.has(path))||
    run(['diff','--cached','--diff-filter=D','--name-only']))throw Error('Invalid Pages overlay');
  const tree=run(['write-tree']);
  for(const {path,sha256} of [...files,{path:'release.json',sha256:hash(releaseBytes)}]){
    if(hash(git(['cat-file','blob',tree+':'+path],stage,true))!==sha256){
      throw Error('Git filters changed the verified release bytes: '+path);
    }
  }
  for(const path of preserved)if(run(['rev-parse',tree+':'+path])!==previousObjects[path]){
    throw Error('Protected Pages object changed: '+path);
  }
  const result={...release,stage,filesChanged:paths.length,dryRun:!apply};
  if(apply){
    clean(source);
    if(remoteHash(ref)!==source||remoteHash(pagesRef)!==previous)throw Error('Remote refs changed while staging');
    run(['config','user.name',git(['config','user.name'])]);
    run(['config','user.email',git(['config','user.email'])]);
    run(['commit','-m','Publish isometric 100gate from '+source.slice(0,7)]);
    const commit=run(['rev-parse','HEAD']);
    if(run(['rev-parse',commit+'^'])!==previous||run(['rev-parse',commit+'^{tree}'])!==tree){
      throw Error('Deployment commit differs from the verified fast-forward overlay');
    }
    run(['push','origin','HEAD:'+pagesRef]);
    result.pagesCommit=commit;
  }
  return result;
}

async function main(args){
  let operation='dry',ref=sourceRef(),refSeen=false;
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if((arg==='--apply'||arg==='--package')&&operation==='dry')operation=arg.slice(2);
    else if(arg==='--source-ref'&&!refSeen&&args[i+1]){ref=sourceRef(args[++i]);refSeen=true;}
    else throw Error('Usage: publish-isometric-pages.mjs [--package | --apply] [--source-ref refs/heads/main]');
  }
  if(operation==='package'&&refSeen)throw Error('Select --source-ref when staging or applying, not packaging');
  console.log(JSON.stringify(operation==='package'?await packageIso():publishIso(operation==='apply',ref)));
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main(process.argv.slice(2));
