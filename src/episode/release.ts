// Unbundled models and PBR maps keep stable filenames. Bump this tag when they change.
export const ASSET_REVISION='native-intro-v2-20261107';
export const chapterAsset=(path:string)=>`${import.meta.env.BASE_URL}${path}?v=${ASSET_REVISION}`;
// Review mode is a separately built, save-isolated Pages subtree, not a
// production query parameter. All URLs remain relative to that subtree.
export const STORY_RELEASE = import.meta.env.MODE === 'story-preview';
export const STORY_PRODUCTION = import.meta.env.MODE === 'story-production';
export const storyAsset=(path:string)=>`${import.meta.env.BASE_URL}${import.meta.env.DEV?'outputs/story-intro/':'assets/story-intro/'}${path}?v=story-294c425`;
export const finalStoryAsset=(path:string)=>`${import.meta.env.BASE_URL}${STORY_PRODUCTION?'assets/story-final/':'outputs/quality-overhaul/'}${path}?v=cinematic-65b2953`;
export const SAVE_API=STORY_RELEASE?'':(import.meta.env.VITE_SAVE_API as string|undefined)?.replace(/\/$/,'')||'';
