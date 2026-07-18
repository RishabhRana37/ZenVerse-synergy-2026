export function CornerBrackets() {
  return (
    <div className="pointer-events-none absolute -inset-[1px] z-20 transition-all duration-120 ease-lens group-hover/bracket:-inset-[5px] group-focus-within/bracket:-inset-[5px] group-hover:-inset-[5px] group-focus-within:-inset-[5px]">
      {/* Top-Left */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-text-muted/40 transition-colors duration-120 ease-lens group-hover/bracket:border-accent group-focus-within/bracket:border-accent group-hover:border-accent group-focus-within:border-accent" />
      {/* Top-Right */}
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-text-muted/40 transition-colors duration-120 ease-lens group-hover/bracket:border-accent group-focus-within/bracket:border-accent group-hover:border-accent group-focus-within:border-accent" />
      {/* Bottom-Left */}
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-text-muted/40 transition-colors duration-120 ease-lens group-hover/bracket:border-accent group-focus-within/bracket:border-accent group-hover:border-accent group-focus-within:border-accent" />
      {/* Bottom-Right */}
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-text-muted/40 transition-colors duration-120 ease-lens group-hover/bracket:border-accent group-focus-within/bracket:border-accent group-hover:border-accent group-focus-within:border-accent" />
    </div>
  )
}
