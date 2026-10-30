import { useEffect, useRef, useState } from 'react'
import {
  BookOpen, Check, ChevronRight, DoorOpen, Eye, FileText,
  Flashlight, KeyRound, LockKeyhole, MousePointer2, Play, RotateCcw,
  Settings, Skull, Volume2, VolumeX, X,
} from 'lucide-react'
import { startGame, stopGame } from '@/game/boot'
import { CHAPTERS } from '@/game/content'
import { DEFAULT_SETTINGS, GameSettings, GameUIState, keyLabel } from '@/game/ui-types'

const initialState: GameUIState = {
  mode: 'title', previousMode: 'title', level: 0, chapter: 0,
  chapterTitle: CHAPTERS[0].title, location: CHAPTERS[0].location,
  roomName: 'Прихожая', objective: '', interaction: '', hasKey: false,
  hasFuse: false, bottles: 0, hidden: false, flashlight: true, threat: 0,
  message: '', note: null, collectedDocuments: [], settings: DEFAULT_SETTINGS,
  save: { currentLevel: 0, maxUnlocked: 0, documents: [] }, levelTime: 0,
  roomsSolved: 0, codeError: false,
}

function command(type: string, payload?: unknown) {
  window.dispatchEvent(new CustomEvent('silence-command', { detail: { type, payload } }))
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<GameUIState>(initialState)
  const [ready, setReady] = useState(false)
  const [rebinding, setRebinding] = useState(false)
  const [code, setCode] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onState = (event: Event) => setState((event as CustomEvent<GameUIState>).detail)
    const onReady = () => setReady(true)
    window.addEventListener('silence-ui', onState)
    window.addEventListener('silence-ready', onReady)
    startGame(canvas)
    return () => {
      window.removeEventListener('silence-ui', onState)
      window.removeEventListener('silence-ready', onReady)
      stopGame()
    }
  }, [])

  useEffect(() => {
    if (!rebinding) return
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.code !== 'Escape') command('settingsPatch', { interactKey: event.code })
      setRebinding(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [rebinding])

  useEffect(() => {
    if (state.mode === 'code') setCode('')
  }, [state.mode, state.level])

  const patch = (value: Partial<GameSettings>) => command('settingsPatch', value)
  const isHud = state.mode === 'playing'

  return (
    <div id="game-root">
      <canvas id="game-canvas" ref={canvasRef} />
      <div className="film-grain" />
      <div className="vignette" />
      <div className="threat-vignette" style={{ opacity: state.threat * 0.75 }} />

      {ready && state.mode !== 'settings' && state.mode !== 'chapterSelect' && (
        <button className="icon-button settings-gear" onClick={() => command('settings')} aria-label="Настройки">
          <Settings size={21} />
        </button>
      )}

      {isHud && (
        <div className="hud">
          <div className="hud-top-left">
            <div className="eyebrow">Глава {state.chapter + 1} · Комната {state.level % 10 + 1}/10</div>
            <div className="hud-location">{state.location}</div>
            <div className="hud-room">{state.roomName}</div>
          </div>
          <div className="hud-inventory">
            <div className={state.hasKey ? 'inventory-item active' : 'inventory-item'}>
              <KeyRound size={17} /><span>{state.hasKey ? 'Ключ найден' : 'Ключ не найден'}</span>
            </div>
            {state.hasFuse && <div className="inventory-item active"><Check size={17} /><span>Предохранитель</span></div>}
            <div className={state.flashlight ? 'inventory-item active' : 'inventory-item'}>
              <Flashlight size={17} /><span>F</span>
            </div>
            {state.bottles > 0 && <div className="inventory-item active"><span>Бутылки: {state.bottles} · Q</span></div>}
          </div>
          <div className="objective-panel">
            <span className="objective-label">Текущая задача</span>
            <span>{state.objective}</span>
          </div>
          <div className="crosshair"><i /><i /><i /><i /></div>
          {state.interaction && <div className="interaction-prompt">{state.interaction}</div>}
          {state.message && <div className="game-message">{state.message}</div>}
          {state.hidden && <div className="hidden-indicator"><Eye size={18} /> Вы в укрытии</div>}
          <div className="hud-controls">J — журнал <span>·</span> F — свет <span>·</span> Esc — пауза</div>
        </div>
      )}

      {!ready && (
        <div className="loading-screen">
          <div className="loading-mark"><DoorOpen size={30} /></div>
          <div className="eyebrow">Архив хранителя</div>
          <h1>Комнаты молчания</h1>
          <p>Дом восстанавливает ваши воспоминания…</p>
          <div className="loading-line"><span /></div>
        </div>
      )}

      {ready && state.mode === 'title' && (
        <main className="title-screen">
          <div className="title-copy">
            <div className="title-kicker"><span /> Психологический хоррор-квест</div>
            <h1>Комнаты<br /><em>молчания</em></h1>
            <p className="title-description">Сто дверей. Десять расследований.<br />Одна история, которую дом не хочет отпускать.</p>
            <div className="title-actions">
              <button className="primary-button" onClick={() => command('new')}>
                <Play size={18} fill="currentColor" /> Начать расследование
              </button>
              {(state.save.maxUnlocked > 0 || state.save.documents.length > 0) && (
                <button className="secondary-button" onClick={() => command('continue')}>
                  Продолжить · комната {state.save.currentLevel + 1}
                </button>
              )}
              <button className="text-button" onClick={() => command('chapterSelect')}>Выбрать главу <ChevronRight size={16} /></button>
            </div>
            <div className="title-meta">
              <span>WASD — движение</span><span>Мышь — обзор</span><span>{keyLabel(state.settings.interactKey)} — действие</span>
            </div>
          </div>
          <div className="title-case-file">
            <span className="case-number">Дело № 001</span>
            <div className="case-line" />
            <p>«Не отвечайте, если из соседней комнаты позовут вашим голосом».</p>
            <span className="case-sign">Архив хранителя</span>
          </div>
          <div className="save-notice">Прогресс сохраняется в этом браузере</div>
        </main>
      )}

      {state.mode === 'paused' && (
        <div className="overlay dark-overlay">
          <section className="menu-card compact-card">
            <div className="eyebrow">Комната {state.level + 1} · {state.roomName}</div>
            <h2>Пауза</h2>
            <p>Дом продолжает слушать.</p>
            <button className="primary-button" onClick={() => command('resume')}><Play size={17} /> Продолжить</button>
            <button className="secondary-button" onClick={() => command('journal')}><BookOpen size={17} /> Журнал расследования</button>
            <button className="secondary-button" onClick={() => command('settings')}><Settings size={17} /> Настройки</button>
            <button className="secondary-button" onClick={() => command('restart')}><RotateCcw size={17} /> Начать комнату заново</button>
            <button className="text-button" onClick={() => command('title')}>В главное меню</button>
          </section>
        </div>
      )}

      {state.mode === 'note' && state.note && (
        <div className="overlay paper-overlay">
          <article className="document-sheet">
            <button className="document-close" onClick={() => command('close')} aria-label="Закрыть"><X size={20} /></button>
            <div className="document-stamp">МАТЕРИАЛЫ ДЕЛА</div>
            <div className="document-id">{state.note.id.toUpperCase()}</div>
            <h2>{state.note.title}</h2>
            <div className="document-rule" />
            <p className="document-body">{state.note.body}</p>
            {state.note.clue && (
              <div className="document-clue"><span>Подсказка</span>{state.note.clue}</div>
            )}
            <div className="document-footer">Хранить в журнале расследования · {state.location}</div>
          </article>
          <div className="overlay-hint">{keyLabel(state.settings.interactKey)} / Esc — закрыть документ</div>
        </div>
      )}

      {state.mode === 'journal' && (
        <div className="overlay dark-overlay">
          <section className="journal-panel">
            <header className="panel-header">
              <div><div className="eyebrow">Архив хранителя</div><h2>Журнал расследования</h2></div>
              <button className="icon-button" onClick={() => command('close')}><X size={21} /></button>
            </header>
            <div className="journal-summary"><strong>{state.collectedDocuments.length}</strong> документов из 200 <span>·</span> {state.roomsSolved} комнат пройдено</div>
            {state.collectedDocuments.length === 0 ? (
              <div className="empty-state"><FileText size={40} /><h3>Пока нет улик</h3><p>Осматривайте комнаты и читайте найденные документы.</p></div>
            ) : (
              <div className="document-grid">
                {state.collectedDocuments.map((doc) => (
                  <button key={doc.id} className="document-card" onClick={() => command('read', doc.id)}>
                    <FileText size={18} /><span><small>Комната {Number(doc.id.split('-')[1]) + 1}</small>{doc.title}</span><ChevronRight size={16} />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {state.mode === 'settings' && (
        <div className="overlay dark-overlay">
          <section className="settings-panel">
            <header className="panel-header">
              <div><div className="eyebrow">Параметры игры</div><h2>Настройки</h2></div>
              <button className="icon-button" onClick={() => command('close')}><X size={21} /></button>
            </header>
            <div className="settings-grid">
              <div className="settings-section">
                <h3>Графика</h3>
                <label className="setting-label">Качество</label>
                <div className="segmented-control">
                  {([['low', 'Низкое'], ['medium', 'Среднее'], ['high', 'Высокое']] as const).map(([value, label]) => (
                    <button key={value} className={state.settings.quality === value ? 'selected' : ''} onClick={() => patch({ quality: value })}>{label}</button>
                  ))}
                </div>
                <RangeSetting label="Чувствительность мыши" value={state.settings.sensitivity} min={0.3} max={2.5} step={0.05} display={`${state.settings.sensitivity.toFixed(2)}×`} onChange={(sensitivity) => patch({ sensitivity })} />
                <RangeSetting label="Поле зрения" value={state.settings.fov} min={60} max={95} step={1} display={`${state.settings.fov}°`} onChange={(fov) => patch({ fov })} />
              </div>
              <div className="settings-section">
                <h3>Звук</h3>
                <button className="mute-button" onClick={() => patch({ muted: !state.settings.muted })}>
                  {state.settings.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}{state.settings.muted ? 'Включить звук' : 'Выключить звук'}
                </button>
                <RangeSetting label="Общая громкость" value={state.settings.master} min={0} max={1} step={0.01} onChange={(master) => patch({ master })} />
                <RangeSetting label="Музыка и атмосфера" value={state.settings.music} min={0} max={1} step={0.01} onChange={(music) => patch({ music })} />
                <RangeSetting label="Эффекты" value={state.settings.effects} min={0} max={1} step={0.01} onChange={(effects) => patch({ effects })} />
              </div>
              <div className="settings-section controls-section">
                <h3>Управление</h3>
                <label className="setting-label">Схема передвижения</label>
                <div className="segmented-control">
                  <button className={state.settings.movement === 'wasd' ? 'selected' : ''} onClick={() => patch({ movement: 'wasd' })}>WASD</button>
                  <button className={state.settings.movement === 'arrows' ? 'selected' : ''} onClick={() => patch({ movement: 'arrows' })}>Стрелки</button>
                </div>
                <div className="rebind-row"><span>Взаимодействие</span><button className={rebinding ? 'rebind-button listening' : 'rebind-button'} onClick={() => setRebinding(true)}>{rebinding ? 'Нажмите клавишу…' : keyLabel(state.settings.interactKey)}</button></div>
                <div className="control-reference"><MousePointer2 size={16} /><span>Мышь — обзор</span><span>F — фонарь</span><span>Q — бросить бутылку</span><span>J — журнал</span></div>
              </div>
            </div>
            <footer className="settings-footer"><span>Изменения сохраняются автоматически</span><button className="primary-button small" onClick={() => command('close')}>Готово <Check size={16} /></button></footer>
          </section>
        </div>
      )}

      {state.mode === 'chapterSelect' && (
        <div className="overlay dark-overlay">
          <section className="chapter-panel">
            <header className="panel-header">
              <div><div className="eyebrow">10 глав · 100 комнат</div><h2>Архив расследований</h2></div>
              <button className="icon-button" onClick={() => command('title')}><X size={21} /></button>
            </header>
            <div className="chapter-grid">
              {CHAPTERS.map((chapter) => {
                const unlocked = chapter.id * 10 <= state.save.maxUnlocked
                return (
                  <button key={chapter.id} disabled={!unlocked} className={unlocked ? 'chapter-card unlocked' : 'chapter-card'} onClick={() => command('loadLevel', chapter.id * 10)}>
                    <span className="chapter-index">{String(chapter.id + 1).padStart(2, '0')}</span>
                    <span className="chapter-info"><small>{chapter.location}</small><strong>{chapter.title}</strong><em>{unlocked ? `${Math.max(0, Math.min(10, state.save.maxUnlocked - chapter.id * 10))}/10 пройдено` : 'Завершите предыдущую главу'}</em></span>
                    {unlocked ? <ChevronRight size={19} /> : <LockKeyhole size={18} />}
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      )}

      {state.mode === 'code' && (
        <div className="overlay dark-overlay">
          <section className="code-panel">
            <div className="safe-icon"><LockKeyhole size={28} /></div>
            <div className="eyebrow">Механический сейф</div><h2>Введите четыре цифры</h2>
            <p>Код записан в одном из документов комнаты.</p>
            <input autoFocus className={state.codeError ? 'code-input error' : 'code-input'} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 4))} onKeyDown={(event) => { if (event.key === 'Enter' && code.length === 4) command('submitCode', code) }} placeholder="••••" inputMode="numeric" />
            {state.codeError && <div className="code-error">Неверный код. Замок издал громкий щелчок.</div>}
            <button className="primary-button" disabled={code.length !== 4} onClick={() => command('submitCode', code)}>Открыть сейф</button>
            <button className="text-button" onClick={() => command('close')}>Отойти</button>
          </section>
        </div>
      )}

      {state.mode === 'levelComplete' && (
        <div className="overlay dark-overlay completion-overlay">
          <section className="completion-card">
            <DoorOpen size={42} />
            <div className="eyebrow">Дверь открыта</div>
            <h2>Комната {state.level + 1} пройдена</h2>
            <p>{state.level % 10 === 9 ? `Глава «${state.chapterTitle}» завершена. Открыто новое расследование.` : 'Собранные документы добавлены в архив. Следующая комната уже ждёт.'}</p>
            <div className="completion-stats"><span>Время <strong>{formatTime(state.levelTime)}</strong></span><span>Пройдено <strong>{state.level + 1}/100</strong></span></div>
            <button className="primary-button" onClick={() => command('next')}>Следующая комната <ChevronRight size={18} /></button>
            <button className="text-button" onClick={() => command('title')}>В главное меню</button>
          </section>
        </div>
      )}

      {state.mode === 'gameover' && (
        <div className="overlay gameover-overlay">
          <section className="completion-card">
            <Skull size={46} />
            <div className="eyebrow">Смотритель нашёл вас</div>
            <h2>Комната не отпускает</h2>
            <p>Глушите свет, используйте укрытия и отвлекайте преследователя шумом.</p>
            <button className="primary-button" onClick={() => command('restart')}><RotateCcw size={18} /> Попробовать снова</button>
            <button className="text-button" onClick={() => command('title')}>В главное меню</button>
          </section>
        </div>
      )}

      {state.mode === 'ending' && (
        <div className="overlay ending-overlay">
          <section className="ending-card">
            <div className="eyebrow">Все 100 комнат пройдены</div>
            <h2>Тишина закончилась</h2>
            <p>Вы вышли из последней комнаты и забрали журнал хранителя. Впервые за сто лет на его последней странице появилась новая строка — уже вашим почерком:</p>
            <blockquote>«Дом существует, только пока кто-то продолжает его расследование».</blockquote>
            <div className="ending-stats"><span>Документов найдено<strong>{state.save.documents.length}/200</strong></span><span>Историй завершено<strong>10/10</strong></span></div>
            <button className="primary-button" onClick={() => command('title')}>Вернуться в архив <ChevronRight size={18} /></button>
          </section>
        </div>
      )}
    </div>
  )
}

function RangeSetting({ label, value, min, max, step, display, onChange }: {
  label: string; value: number; min: number; max: number; step: number; display?: string; onChange: (value: number) => void
}) {
  return (
    <label className="range-setting">
      <span><span>{label}</span><strong>{display ?? `${Math.round(value * 100)}%`}</strong></span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}
