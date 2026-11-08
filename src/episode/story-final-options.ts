import {STORY_PRODUCTION} from './release';
// The root ships the reviewed final cut. The older /story-preview is frozen.
export const egressStudy=STORY_PRODUCTION||(import.meta.env.DEV&&['quality-car','quality-egress']
  .every(key=>new URLSearchParams(globalThis.location?.search).get(key)==='1'));
export const FINAL_ABDUCTION_SECONDS=8.8;
