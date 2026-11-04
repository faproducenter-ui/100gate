/** Passes own render targets/materials that EffectComposer.dispose() does not release. */
export function disposeComposer(composer:{passes:readonly {dispose:()=>void}[];dispose:()=>void}){
  for(const pass of composer.passes)pass.dispose();
  composer.dispose();
}
