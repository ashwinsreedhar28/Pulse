import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

function Popover(): JSX.Element {
  return (
    <div className="h-screen w-screen rounded-xl overflow-hidden border border-edge bg-surface-1/90 backdrop-blur-xl flex flex-col">
      <header className="h-10 px-4 flex items-center justify-between border-b border-edge">
        <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-400 font-semibold">Pulse</div>
        <button
          onClick={() => window.api.app.showMainWindow().then(() => window.api.app.hidePopover())}
          className="text-[11px] text-zinc-400 hover:text-zinc-100"
        >
          Open ↗
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <EmptyRow source="System" text="No feeds configured yet" domain="news" />
        <EmptyRow source="System" text="Add feeds in Stage 3 to start polling" domain="finance" />
      </div>
      <footer className="h-8 px-4 flex items-center justify-between border-t border-edge text-[10px] text-zinc-500">
        <span>0 unread</span>
        <span>v0.1 · shell</span>
      </footer>
    </div>
  )
}

function EmptyRow({
  source,
  text,
  domain
}: {
  source: string
  text: string
  domain: 'finance' | 'news'
}): JSX.Element {
  return (
    <div className="flex items-start gap-2">
      <span
        className={`mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
          domain === 'finance' ? 'bg-amber-400' : 'bg-blue-400'
        }`}
      />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500">{source}</div>
        <div className="text-[13px] text-zinc-300 leading-snug">{text}</div>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('popover-root')!).render(
  <React.StrictMode>
    <Popover />
  </React.StrictMode>
)
