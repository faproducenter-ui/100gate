import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {DEFAULTS} from './contracts';
import {IsoInterface,type IsoInterfaceProps} from './Interface';
import {newSave} from './state';

const base:IsoInterfaceProps={
  mode:'title',panel:null,saved:false,state:newSave(),settings:DEFAULTS,
  hint:'',notice:'',loading:'',cctv:{camera:'reception',tape:'shift',time:2,duration:16,
    playing:false,availableFuture:false,evidence:false,zoom:false},onAction:vi.fn(),
};
const markup=(patch:Partial<IsoInterfaceProps>={})=>renderToStaticMarkup(<IsoInterface {...base} {...patch}/>);

describe('administration interface',()=>{
  it('offers New Game, and Continue only when a compatible save exists',()=>{
    expect(markup()).toContain('data-testid="iso-start"');
    expect(markup()).not.toContain('data-testid="iso-continue"');
    expect(markup({saved:true})).toContain('data-testid="iso-continue"');
    expect(markup()).not.toMatch(/Дом, который|Психологический хоррор|Дело №100/);
  });
  it('renders all three independent breakers with a real reset control',()=>{
    const html=markup({mode:'play',panel:'breaker'});
    for(const line of ['lights','locks','cctv'])expect(html).toContain('data-testid="iso-breaker-'+line+'"');
    expect(html).toContain('data-testid="iso-breaker-reset"');
  });
  it('frames CCTV without inserting a mock feed, and gates unavailable recordings',()=>{
    const html=markup({mode:'play',panel:'cctv'});
    expect(html).toContain('data-testid="iso-cctv-frame"');
    expect(html).toContain('data-testid="iso-cctv-seek"');
    expect(html).toContain('data-testid="iso-cctv-step-forward"');
    expect(html).toMatch(/data-testid="iso-cctv-future"[^>]*disabled/);
    expect(html).not.toMatch(/<(video|img|canvas)\b/);
    expect(markup({mode:'play',panel:'cctv',cctv:{...base.cctv,availableFuture:true,evidence:true}}))
      .toContain('data-testid="iso-cctv-evidence"');
  });
  it('shows load status without fake progress percentages',()=>{
    expect(markup({mode:'loading',loading:'Загрузка моделей'})).toContain('Загрузка моделей');
    expect(markup({mode:'loading'})).not.toContain('aria-valuenow');
  });
  it('shows the active task and clues in the journal, without previewing future steps',()=>{
    const html=markup({mode:'play',panel:'journal',state:{...base.state,dutyRead:true}});
    expect(html).toContain('data-status="done"');
    expect(html).toContain('Найти ключ от щитовой');
    expect(html).toContain('Дежурный оставил его под столешницей.');
    expect(html).not.toContain('Восстановить электропитание');
  });
  it('shows only the items the player already owns, with an inspectable description',()=>{
    const html=markup({mode:'play',panel:'inventory',state:{...base.state,items:['technicalKey']}});
    expect(html).toContain('Ключ от щитовой');
    expect(html).toContain('Его приклеили под столом дежурного.');
    expect(html).not.toContain('Ключ от архива');
  });
});
