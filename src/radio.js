// Official stream directory: https://radioparadise.com/listen/stream-links
const STREAM = 'https://stream.radioparadise.com/rock-128';

export function createRadio(media, onStatus) {
  let enabled = false;
  let generation = 0;
  let timeout;
  media.preload = 'none';
  media.volume = 0.35;

  function stop(status = 'OFF') {
    enabled = false;
    generation++;
    clearTimeout(timeout);
    media.pause();
    media.removeAttribute('src');
    media.load();
    onStatus(status);
  }
  function connecting() {
    if (!enabled) return;
    onStatus('CONNECTING');
    clearTimeout(timeout);
    timeout = setTimeout(() => stop('UNAVAILABLE'), 20000);
  }
  media.addEventListener('playing', () => {
    if (!enabled) return;
    clearTimeout(timeout);
    onStatus('LIVE');
  });
  media.addEventListener('waiting', connecting);
  media.addEventListener('error', () => { if (enabled) stop('UNAVAILABLE'); });
  media.addEventListener('ended', () => { if (enabled) stop('UNAVAILABLE'); });
  onStatus('OFF');

  return {
    async toggle() {
      if (enabled) return stop();
      enabled = true;
      const attempt = ++generation;
      connecting();
      media.src = STREAM;
      try {
        await media.play();
      } catch {
        if (attempt === generation) stop('UNAVAILABLE');
      }
    },
  };
}
