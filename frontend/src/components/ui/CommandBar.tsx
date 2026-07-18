import { Kbd } from '@/components/ui/Kbd'

export function CommandBar() {
  const handleClick = () => {
    window.dispatchEvent(new CustomEvent('stormlens-open-palette'))
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center justify-between w-full max-w-[280px] px-3 py-1.5 rounded-[10px] border border-border bg-bg-surface/60 hover:bg-bg-surface hover:border-border-hover transition-all duration-150 ease-out select-none outline-none cursor-pointer"
    >
      <div className="flex items-center gap-2 text-text-muted">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-[12px] font-sans">Search commands...</span>
      </div>
      <Kbd>⌘K</Kbd>
    </button>
  )
}
