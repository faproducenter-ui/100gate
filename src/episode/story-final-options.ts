// These studies have independent acceptance gates and must never leak into the
// earlier published route. The deploy mode always selects the frozen cut.
export const egressStudy=import.meta.env.DEV&&['quality-car','quality-egress']
  .every(key=>new URLSearchParams(location.search).get(key)==='1');
export const FINAL_ABDUCTION_SECONDS=8.8;
