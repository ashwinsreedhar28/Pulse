import type { PulseApi } from '../../preload'
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare global {
  interface Window {
    api: PulseApi
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          src?: string
          preload?: string
          partition?: string
          allowpopups?: boolean | ''
          useragent?: string
        },
        HTMLElement
      >
    }
  }
}

export {}
