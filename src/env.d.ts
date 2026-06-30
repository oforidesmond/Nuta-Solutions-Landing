/// <reference types="astro/client" />

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'dotlottie-wc': {
        src?: string;
        autoplay?: boolean;
        loop?: boolean;
        class?: string;
        id?: string;
        style?: string;
      };
    }
  }
}

export {};
