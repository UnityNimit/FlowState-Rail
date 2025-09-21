// This service encapsulates the browser's Web Speech API for easy use.

class TtsService {
    constructor() {
        this.synth = window.speechSynthesis;
        this.utterance = new SpeechSynthesisUtterance();
        this.utterance.lang = 'en-US'; // Set language
        this.utterance.rate = 0.9;     // Slightly slower for clarity
        this.utterance.pitch = 1;      // Normal pitch
    }

    /**
     * Speaks the provided text. If speech is already in progress,
     * it cancels the old one and starts the new one immediately.
     * @param {string} text - The text to be spoken.
     */
    speak(text) {
        if (!text || typeof text !== 'string') {
            console.error("TTS Service: Invalid text provided.");
            return;
        }

        // If the synth is already speaking, cancel it to prevent overlap.
        if (this.synth.speaking) {
            this.synth.cancel();
        }

        this.utterance.text = text;
        this.synth.speak(this.utterance);
    }

    /**
     * Stops any currently playing speech immediately.
     */
    cancel() {
        if (this.synth.speaking) {
            this.synth.cancel();
        }
    }
}

// Export a single instance of the service for the whole app to use.
const ttsService = new TtsService();
export default ttsService;