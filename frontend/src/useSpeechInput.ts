import { useCallback, useEffect, useRef, useState } from "react";
import {
  SpeechInputController,
  isSpeechRecognitionSupported,
  voiceStatusHint,
  voiceStatusLabel,
  type VoiceStatus,
} from "./speechRecognition";

export function useSpeechInput(
  value: string,
  onChange: (text: string) => void,
  onError?: (message: string | null) => void,
) {
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const controllerRef = useRef<SpeechInputController | null>(null);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    const controller = new SpeechInputController({
      onTextChange: onChange,
      onStatusChange: setVoiceStatus,
      onError: (message) => onError?.(message),
    });
    controllerRef.current = controller;
    return () => controller.destroy();
  }, [onChange, onError]);

  const toggleVoice = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (controller.isActive()) {
      controller.stop();
      return;
    }
    void controller.start(valueRef.current);
  }, []);

  return {
    toggleVoice,
    voiceStatus,
    voiceButtonLabel: voiceStatusLabel(voiceStatus),
    voiceStatusHint: voiceStatusHint(voiceStatus),
    isVoiceActive: voiceStatus === "starting" || voiceStatus === "listening",
    isSpeechSupported: isSpeechRecognitionSupported(),
  };
}
