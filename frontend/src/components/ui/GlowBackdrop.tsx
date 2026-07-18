export function GlowBackdrop() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Blob 1 - Red Accent */}
      <div className="absolute -top-[10%] left-[15%] w-[500px] h-[500px] rounded-full bg-accent/8 blur-[130px] animate-drift-1 mix-blend-screen" />
      {/* Blob 2 - Violet Accent */}
      <div className="absolute top-[40%] -right-[5%] w-[600px] h-[600px] rounded-full bg-accent-violet/6 blur-[150px] animate-drift-2 mix-blend-screen" />
      {/* Blob 3 - Red Accent Orange-ish */}
      <div className="absolute -bottom-[10%] left-[30%] w-[450px] h-[450px] rounded-full bg-accent/6 blur-[120px] animate-drift-3 mix-blend-screen" />
    </div>
  )
}
