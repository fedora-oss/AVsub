export interface SubtitleTrack {
  id: string;
  label: string;
  src: string;
  srclang: string;
  default?: boolean;
}

export interface PlaybackSpeed {
  label: string;
  value: number;
}

export interface SubtitleCue {
  startTime: number;
  endTime: number;
  text: string;
}

export interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  isFullscreen: boolean;
  activeSubtitleTrackId: string | null;
  isControlsVisible: boolean;
  isBuffering: boolean;
}
