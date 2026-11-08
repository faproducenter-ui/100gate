type Frame={at:number;level:number};
/** Dips in the practical's light, never additive white flashes. */
export function kitchenLamp(random=Math.random,reduced=false):{wait:number;frames:Frame[]}{
  const wait=7200+Math.round(random()*20500);
  if(reduced)return {wait,frames:[]};
  const type=random();
  return {wait,frames:type<.62?[{at:0,level:.27},{at:560,level:0}]:
    type<.88?[{at:0,level:.59},{at:185,level:0}]:
      type<.98?[{at:0,level:.41},{at:133,level:0},{at:268,level:.51},{at:465,level:0}]:
        [{at:0,level:.82},{at:550,level:.34},{at:1000,level:0}]};
}
