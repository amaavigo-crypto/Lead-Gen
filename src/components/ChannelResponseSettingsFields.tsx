import React from 'react';

export type ChannelResponseLength = 'short' | 'balanced' | 'detailed';
export type ChannelBubbleMode = 'single' | 'auto' | 'two' | 'three';
export type ChannelResponseTone = 'professional' | 'friendly' | 'casual';

export interface ChannelResponseSettings {
  responseLength: ChannelResponseLength;
  bubbleMode: ChannelBubbleMode;
  tone: ChannelResponseTone;
  language: string;
  additionalInstructions: string;
}

export const DEFAULT_CHANNEL_RESPONSE_SETTINGS: ChannelResponseSettings = {
  responseLength: 'balanced',
  bubbleMode: 'auto',
  tone: 'friendly',
  language: 'auto',
  additionalInstructions: '',
};

const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:bg-slate-50';
const fieldClass = 'block text-xs font-semibold text-slate-700';

const LANGUAGES = [
  'Assamese','Bengali','Bodo','Dogri','Gujarati','Hindi','Kannada','Kashmiri','Konkani',
  'Maithili','Malayalam','Manipuri (Meitei)','Marathi','Nepali','Odia','Punjabi','Sanskrit',
  'Santali','Sindhi','Tamil','Telugu','Urdu','Bhojpuri','Chhattisgarhi','Haryanvi','Khasi',
  'Garo','Mizo','Tulu','Rajasthani','Bhili','Gondi','Kokborok','English','Arabic',
  'Chinese (Simplified)','Chinese (Traditional)','French','German','Spanish',
  'Spanish (Latin America)','Portuguese','Portuguese (Brazil)','Portuguese (Portugal)',
  'Russian','Japanese','Korean','Italian','Dutch','Turkish','Persian (Farsi)','Hebrew',
  'Indonesian','Malay','Thai','Vietnamese','Swahili','Polish','Ukrainian','Greek',
  'Romanian','Swedish','Danish','Norwegian','Filipino (Tagalog)','Burmese','Khmer',
  'Sinhala','Czech','Hungarian','Finnish','Croatian','Serbian','Slovak','Bulgarian',
  'Lithuanian','Latvian','Estonian','Icelandic','Afrikaans','Amharic','Yoruba','Igbo','Hausa',
];

export const ChannelResponseSettingsFields: React.FC<{
  value: ChannelResponseSettings;
  onChange: (value: ChannelResponseSettings) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled = false }) => {
  const update = <K extends keyof ChannelResponseSettings,>(key: K, next: ChannelResponseSettings[K]) => {
    onChange({ ...value, [key]: next });
  };
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <label className={fieldClass}>Response length
        <select className={inputClass} disabled={disabled} value={value.responseLength} onChange={(event) => update('responseLength', event.target.value as ChannelResponseLength)}>
          <option value="short">Short</option><option value="balanced">Balanced</option><option value="detailed">Detailed</option>
        </select>
      </label>
      <label className={fieldClass}>Message bubble format
        <select className={inputClass} disabled={disabled} value={value.bubbleMode} onChange={(event) => update('bubbleMode', event.target.value as ChannelBubbleMode)}>
          <option value="single">Single bubble</option><option value="auto">Automatic (1–3 bubbles)</option><option value="two">Two bubbles</option><option value="three">Three bubbles</option>
        </select>
      </label>
      <label className={fieldClass}>Response tone
        <select className={inputClass} disabled={disabled} value={value.tone} onChange={(event) => update('tone', event.target.value as ChannelResponseTone)}>
          <option value="friendly">Friendly</option><option value="professional">Professional</option><option value="casual">Casual</option>
        </select>
      </label>
      <label className={fieldClass}>Response language
        <select className={inputClass} disabled={disabled} value={value.language} onChange={(event) => update('language', event.target.value)}>
          <option value="auto">Automatic — match customer language</option>
          {LANGUAGES.map((language) => <option key={language} value={language}>{language}</option>)}
        </select>
      </label>
      <label className={fieldClass + ' md:col-span-2'}>Additional instructions
        <textarea className={inputClass + ' resize-y'} rows={3} maxLength={2000} disabled={disabled} value={value.additionalInstructions} onChange={(event) => update('additionalInstructions', event.target.value)} placeholder="For example: use simple words, avoid long introductions, use emojis sparingly…" />
      </label>
    </div>
  );
};

export default ChannelResponseSettingsFields;
