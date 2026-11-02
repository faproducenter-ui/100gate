// Publish only the built, static game. Source code remains on main.
// No force push: an existing gh-pages branch is fetched and extended normally.
import { cpSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),dist=resolve(root,'dist'),base=resolve(root,'.pages-publish');
function run(args,cwd=root,allowFailure=false){const r=spawnSync('git',args,{cwd,encoding:'utf8'});if(r.status!==0&&!allowFailure)throw new Error(r.stderr||r.error?.message||'Git command failed');return r;}
if(!existsSync(join(dist,'index.html')))throw Error('Run npm run build first.');
if(run(['status','--porcelain']).stdout.trim())throw Error('Commit source changes before publishing.');
const origin=run(['remote','get-url','origin']).stdout.trim();mkdirSync(base,{recursive:true});const stage=mkdtempSync(join(base,'release-'));
if(!resolve(stage).startsWith(base+sep))throw Error('Unexpected staging directory');
run(['init','--initial-branch=gh-pages'],stage);run(['remote','add','origin',origin],stage);
const branch=run(['ls-remote','--heads','origin','gh-pages']).stdout.trim();
if(branch){run(['fetch','--depth','1','origin','gh-pages'],stage);run(['checkout','-B','gh-pages','FETCH_HEAD'],stage);run(['rm','-r','--ignore-unmatch','.'],stage);}
cpSync(dist,stage,{recursive:true});
run(['config','user.name',run(['config','user.name']).stdout.trim()||'100gate'],stage);
run(['config','user.email',run(['config','user.email']).stdout.trim()||'faproducenter-ui@users.noreply.github.com'],stage);
run(['add','-A'],stage);
if(run(['status','--porcelain'],stage).stdout.trim())run(['commit','-m',`Publish chapter one from ${run(['rev-parse','--short','HEAD']).stdout.trim()}`],stage);
console.log(run(['push','origin','HEAD:refs/heads/gh-pages'],stage).stderr.trim());
console.log('Static game published from '+run(['rev-parse','HEAD']).stdout.trim());
