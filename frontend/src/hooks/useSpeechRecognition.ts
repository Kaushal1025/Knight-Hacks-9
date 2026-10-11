import { useCallback, useEffect, useRef, useState } from 'react';

// ==========================================
// Voice input via the browser's built-in Web Speech API.
// Works in Chrome and Edge. Chrome sends the audio to Google for
// transcription, so it needs an internet connection.
// ==========================================

// Minimal types: TypeScript's DOM library doesn't include the Web Speech API.
interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  isFinal: boolean;
  0: SpeechAlternative;
}
interface SpeechResultEvent {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechResult };
}
interface SpeechErrorEvent {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone access was blocked. Allow it in the address bar and try again.',
  'service-not-allowed': 'Microphone access was blocked. Allow it in the address bar and try again.',
  'no-speech': "Didn't hear anything. Try again.",
  'audio-capture': 'No microphone found.',
  network: 'Voice needs an internet connection.',
};

/**
 * One utterance per start(): listens until you pause, then calls onFinal
 * with the full transcript.
 */
export function useSpeechRecognition(onFinal: (transcript: string) => void) {
  const [supported] = useState(() => getRecognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(onFinal);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || recognitionRef.current) return;

    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.continuous = false; // stop automatically when you pause
    recognition.interimResults = true; // show words as you speak

    let finalText = '';

    recognition.onresult = (e) => {
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      setInterim((finalText + interimText).trim());
    };

    recognition.onerror = (e) => {
      if (e.error !== 'aborted') {
        setError(ERROR_MESSAGES[e.error] ?? `Voice error: ${e.error}`);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      setInterim('');
      const text = finalText.trim();
      if (text) onFinalRef.current(text);
    };

    setError(null);
    setInterim('');
    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
    }
  }, []);

  // Stop the microphone if the component goes away mid-sentence
  useEffect(() => () => recognitionRef.current?.abort(), []);

  return { supported, listening, interim, error, start, stop };
}
