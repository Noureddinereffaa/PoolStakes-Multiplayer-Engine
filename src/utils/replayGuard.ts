let _replayActive = false;

export function setReplayActive(active: boolean): void {
  _replayActive = active;
}

export function isReplayActive(): boolean {
  return _replayActive;
}
