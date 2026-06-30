let loadPromise: Promise<void> | null = null;

export function ensureDotLottieLoaded(): Promise<void> {
  if (customElements.get('dotlottie-wc')) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = import('@lottiefiles/dotlottie-wc').then(() => undefined);
  }
  return loadPromise;
}
