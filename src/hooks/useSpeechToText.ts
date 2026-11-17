import { useCallback, useEffect, useRef, useState } from 'react';

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorLike = {
  error?: string;
};

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function useSpeechToText(onTranscript: (transcript: string) => void) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const stopListening = useCallback(() => {
    const active = recognitionRef.current;
    if (!active) return;
    try {
      active.stop();
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
    }
  }, []);

  const toggleListening = useCallback(() => {
    const current = recognitionRef.current;
    if (current) {
      stopListening();
      return;
    }

    setError('');
    const speechWindow = window as unknown as {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError('Voice dictation is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    let recognition: SpeechRecognitionLike;
    try {
      recognition = new Recognition();
    } catch {
      setError('Could not start voice dictation. Check microphone permissions and try again.');
      setIsListening(false);
      return;
    }

    recognition.lang = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const finalParts: string[] = [];
      const interimParts: string[] = [];
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim();
        if (!transcript) continue;
        if (result.isFinal) {
          if (index >= event.resultIndex) finalParts.push(transcript);
        } else {
          interimParts.push(transcript);
        }
      }
      setInterimTranscript(interimParts.join(' ').trim());
      const finalTranscript = finalParts.join(' ').trim();
      if (finalTranscript) onTranscriptRef.current(finalTranscript);
    };
    recognition.onerror = (event) => {
      const messages: Record<string, string> = {
        'not-allowed': 'Microphone permission was denied. Allow microphone access in your browser settings.',
        'service-not-allowed': 'Your browser blocked voice dictation. Check microphone permissions.',
        'no-speech': 'No speech was detected. Try again.',
        network: 'Voice dictation could not connect. Check your internet connection.',
      };
      setError(messages[event.error || ''] || 'Voice dictation stopped unexpectedly. Please try again.');
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setInterimTranscript('');
      setIsListening(false);
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setInterimTranscript('');
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
      setError('Could not start voice dictation. Check microphone permissions and try again.');
    }
  }, [stopListening]);

  useEffect(() => () => {
    const active = recognitionRef.current;
    recognitionRef.current = null;
    if (active) {
      active.onend = null;
      active.onerror = null;
      try { active.stop(); } catch { /* no action needed during unmount */ }
    }
  }, []);

  return { isListening, interimTranscript, error, toggleListening, stopListening };
}
