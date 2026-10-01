/**
 * Remote and keyboard keys mapped to Sema actions. Fire TV / Vega WebView key
 * values are verified on the Vega Virtual Device (docs/vega/PLATFORM-FINDINGS.md);
 * the other codes keep desktop browsers and Android-based WebViews working.
 */
const BY_KEY = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Enter: 'select', Select: 'select', Accept: 'select',
  Escape: 'back', GoBack: 'back', BrowserBack: 'back', Back: 'back',
  ContextMenu: 'menu', Menu: 'menu', m: 'menu', M: 'menu',
  MediaPlayPause: 'playpause', MediaPlay: 'play', MediaPause: 'pause',
  MediaFastForward: 'forward', FastForward: 'forward', MediaTrackNext: 'forward',
  MediaRewind: 'rewind', Rewind: 'rewind', MediaTrackPrevious: 'rewind',
};
const BY_CODE = {
  38: 'up', 40: 'down', 37: 'left', 39: 'right',
  13: 'select', 23: 'select',
  27: 'back', 4: 'back', 461: 'back', 10009: 'back',
  93: 'menu', 82: 'menu',
  179: 'playpause', 85: 'playpause', 415: 'play', 126: 'play', 127: 'pause',
  228: 'forward', 417: 'forward', 90: 'forward',
  227: 'rewind', 412: 'rewind', 89: 'rewind',
};

export function actionForKey(event) {
  if (event.code === 'Space' || event.key === ' ') return 'space';
  return BY_KEY[event.key] ?? BY_CODE[event.keyCode] ?? null;
}
