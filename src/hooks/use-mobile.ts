import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    // Ukur setelah frame pertama — hindari setState sinkron di dalam effect.
    const raf = requestAnimationFrame(onChange)
    return () => {
      mql.removeEventListener("change", onChange)
      cancelAnimationFrame(raf)
    }
  }, [])

  return !!isMobile
}
