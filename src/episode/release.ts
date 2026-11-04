// Unbundled models and PBR maps keep stable filenames. Bump this tag when they change.
export const ASSET_REVISION='chapter1-foley-04';
export const chapterAsset=(path:string)=>`${import.meta.env.BASE_URL}${path}?v=${ASSET_REVISION}`;
