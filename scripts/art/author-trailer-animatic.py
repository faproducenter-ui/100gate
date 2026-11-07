"""Editable VSE storyboard for the NEW story. Not game footage, no fall clip.

Run build() in live Blender to show the edit. Run -- --render-cards on the
scene-only saved blend to render the exact held cards for FFmpeg assembly.
"""
import bpy
import sys
from pathlib import Path

NAME='100gate | Trailer animatic'
FPS=24
SHOTS=(
 (3,'01 / 22:42','ДОМА','Тёплый свет, взгляд и пауза.','«Схожу в магазин. Скоро буду».',(.052,.027,.013)),
 (3,'02 / ВЫХОД','ДВЕРЬ','Рука на ручке. Корпус переносит вес.','Переход на звуке закрывающейся двери.',(.039,.023,.014)),
 (2,'03 / ПЕРЕБИВКА','МАГАЗИН','Короткий внешний план.','Покупки остаются за кадром.',(.017,.027,.036)),
 (4,'04 / 23:16','ВОЗВРАЩЕНИЕ','Тихая улица. Фары скользят по стене.','Машина останавливается рядом.',(.011,.019,.032)),
 (3,'05 / СМЕНА РИТМА','ДВЕ ДВЕРИ','Две фигуры. Чужое движение вблизи.','Монтаж скрывает контакт, не действие.',(.026,.011,.011)),
 (2,'','','','',(.001,.001,.001)),
 (4,'06 / ПРОБУЖДЕНИЕ','НЕЗНАКОМАЯ КОМНАТА','Свободные ноги. Руки связаны за спиной.','Стул стоит. Левое крепление ослабевает.',(.025,.019,.012)),
 (4,'07 / ПЕРЕДАЧА УПРАВЛЕНИЯ','НОЖ НА ПОЛУ','Удерживайте R, чтобы дотянуться.','Левая кисть движется вместе с удержанием.',(.019,.026,.019)),
)

def ranges():
 start=1
 for shot in SHOTS:
  end=start+shot[0]*FPS
  yield start,end,shot
  start=end

def build(root,show=True):
 root=Path(root);out=root/'outputs/story-intro/trailer';out.mkdir(parents=True,exist_ok=True)
 if bpy.data.scenes.get(NAME):raise RuntimeError('Storyboard already exists; do not overwrite a live edit')
 s=bpy.data.scenes.new(NAME);s.render.resolution_x=1280;s.render.resolution_y=720;s.render.resolution_percentage=100;s.render.fps=FPS
 s.frame_start=1;s.frame_end=sum(x[0] for x in SHOTS)*FPS;s.render.use_sequencer=True
 s.view_settings.view_transform='Standard'
 s['scope']='Editable storyboard only — no final gameplay, no chair fall'
 strips=s.sequence_editor_create().strips
 path=Path('C:/Windows/Fonts/segoeui.ttf');font=bpy.data.fonts.load(str(path),check_existing=True) if path.exists() else None
 def title(text,ch,start,end,x,y,size,color):
  q=strips.new_effect(text[:42],type='TEXT',channel=ch,frame_start=start,frame_end=end)
  q.text=text;q.location=(x,y);q.font_size=size;q.color=(*color,1);q.alignment_x='LEFT';q.anchor_x='LEFT';q.anchor_y='CENTER';q.blend_type='ALPHA_OVER'
  if font:q.font=font
 for a,b,shot in ranges():
  _,kicker,headline,body,sub,bg=shot
  plate=strips.new_effect(kicker or 'BLACKOUT / 2 s',type='COLOR',channel=1,frame_start=a,frame_end=b);plate.color=bg
  s.timeline_markers.new(kicker or 'BLACKOUT',frame=a)
  if not headline:continue
  title('100GATE / МОНТАЖНАЯ РАСКАДРОВКА',2,a,b,.07,.90,23,(.66,.63,.56))
  title(kicker,3,a,b,.07,.73,36,(.80,.67,.43))
  title(headline,4,a,b,.07,.55,58,(.91,.88,.81))
  title(body,5,a,b,.07,.36,33,(.88,.86,.81))
  title(sub,6,a,b,.07,.25,25,(.69,.67,.63))
  title('ЧЕРНОВОЙ МОНТАЖ · НЕ ГОТОВЫЕ ИГРОВЫЕ КАДРЫ',7,a,b,.07,.08,18,(.60,.57,.52))
 cam=bpy.data.objects.new('VSE fallback camera',bpy.data.cameras.new('VSE camera'));s.collection.objects.link(cam);s.camera=cam
 s.frame_set(1)
 bpy.data.libraries.write(str(out/'100gate-trailer-animatic.blend'),{s},fake_user=True,compress=True)
 if show:
  for w in bpy.context.window_manager.windows:
   w.scene=s
   area=next((a for a in w.screen.areas if a.type=='VIEW_3D'),None)
   if area:
    area.type='SEQUENCE_EDITOR';area.spaces.active.view_type='SEQUENCER_PREVIEW'
    region=next((v for v in area.regions if v.type=='WINDOW'),None)
    if region:
     with bpy.context.temp_override(window=w,area=area,region=region):bpy.ops.sequencer.view_all()
  s.frame_set(193)
 print('TRAILER STORYBOARD',s.name,s.frame_end,'frames; original scenes retained',flush=True)
 return s

def render_cards(root):
 out=Path(root)/'outputs/story-intro/trailer';s=bpy.data.scenes[NAME]
 s.render.image_settings.file_format='PNG';lines=['ffconcat version 1.0']
 for i,(a,b,shot) in enumerate(ranges()):
  path=out/f'shot-{i+1:02}.png';s.frame_set((a+b)//2);s.render.filepath=str(path)
  bpy.ops.render.render(write_still=True,scene=s.name)
  assert path.is_file();lines.extend((f"file '{path.as_posix()}'",f'duration {shot[0]}'))
 lines.append(f"file '{path.as_posix()}'")
 (out/'shots.ffconcat').write_text('\n'.join(lines)+'\n',encoding='utf8')

if '--render-cards' in sys.argv:render_cards(Path.cwd())
