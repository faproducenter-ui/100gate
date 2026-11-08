import {expect,it} from 'vitest';
import {dialogueFace} from './story-face';

it('assigns visible motion only to the speaking actor, with independent blinks',()=>{
  expect(dialogueFace('Alexei',1.12).jawOpen).toBeGreaterThan(.12);
  expect(dialogueFace('Partner',1.12).jawOpen).toBe(0);
  expect(dialogueFace('Partner',4.37).jawOpen).toBeGreaterThan(.12);
  expect(dialogueFace('Alexei',4.37).jawOpen).toBe(0);
  expect(dialogueFace('Alexei',2.14).eyeBlinkLeft).toBeGreaterThan(.85);
  expect(dialogueFace('Partner',2.14).eyeBlinkLeft).toBe(0);
  expect(dialogueFace('Alexei',14).jawOpen).toBe(0);
});
