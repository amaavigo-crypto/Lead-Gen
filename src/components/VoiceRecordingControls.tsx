import React from 'react';
import { Square } from 'lucide-react';

interface VoiceRecordingControlsProps {
  variant?: 'dark' | 'light';
  interimTranscript?: string;
  onStop: () => void;
}

const WAVE_HEIGHTS = [7, 12, 9, 16, 10, 18, 11, 15, 8, 13, 6];

export const VoiceRecordingControls: React.FC<VoiceRecordingControlsProps> = ({
  variant = 'light',
  interimTranscript = '',
  onStop,
}) => {
  const dark = variant === 'dark';
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Voice recording in progress"
      className={'flex min-w-0 items-center gap-2.5 rounded-xl px-2.5 py-1.5 ' + (dark ? 'border border-rose-300/20 bg-rose-400/[.08] text-blue-50' : 'border border-rose-200 bg-rose-50 text-slate-800')}
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-55" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
      </span>
      <span className={'shrink-0 text-[10px] font-semibold ' + (dark ? 'text-rose-100' : 'text-rose-700')}>Recording</span>
      <span className="flex h-5 shrink-0 items-center gap-[2px]" aria-hidden="true">
        {WAVE_HEIGHTS.map((height, index) => (
          <span
            key={index}
            className={'w-[2px] rounded-full animate-pulse ' + (dark ? 'bg-rose-300' : 'bg-rose-500')}
            style={{ height: height + 'px', animationDelay: (index * 65) + 'ms' }}
          />
        ))}
      </span>
      <span className={'hidden min-w-0 flex-1 truncate text-[10px] sm:block ' + (dark ? 'text-blue-100/65' : 'text-slate-500')}>
        {interimTranscript || 'Listening…'}
      </span>
      <button
        type="button"
        onClick={onStop}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-rose-600 px-3 text-[10px] font-semibold text-white shadow-sm transition hover:bg-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
        title="Stop recording"
        aria-label="Stop recording"
      >
        <Square className="h-3 w-3 fill-current" />
        Stop
      </button>
    </div>
  );
};
