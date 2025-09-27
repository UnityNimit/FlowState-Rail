class TtsService {
    constructor() {
        this.synth = window.speechSynthesis;
        this.voice = null;
        this.rate = 0.95;
        this.pitch = 1;
        this.lang = 'en-US';
        this._voices = [];
        this._ready = false;
        this._loadVoices();
        // hold current utterance so we can pause/resume/cancel safely
        this._currentUtterance = null;
        this._speakingPromiseResolve = null;
        this._speakingPromiseReject = null;
    }

    _loadVoices() {
        const setVoices = () => {
            this._voices = this.synth.getVoices();
            // pick a default voice: prefer en-US female-ish, fallback to first
            const preferred = this._voices.find(v => /en-US/i.test(v.lang) && /female|woman|female/i.test(v.name)) ||
                              this._voices.find(v => /en-US/i.test(v.lang)) ||
                              this._voices[0];
            if (preferred) this.voice = preferred;
            this._ready = true;
        };

        setVoices();
        // some browsers (Chrome) load voices asynchronously
        this.synth.addEventListener?.('voiceschanged', () => setVoices());
    }

    // expose available voices (array)
    getVoices() {
        return this._voices.slice();
    }

    setVoiceByName(name) {
        const v = this._voices.find(x => x.name === name);
        if (v) this.voice = v;
    }

    setVoice(voiceObj) {
        // Accept a Voice object from getVoices()
        if (voiceObj && voiceObj.name) this.voice = voiceObj;
    }

    setRate(r) {
        if (typeof r === 'number' && r > 0 && r <= 3) this.rate = r;
    }

    setPitch(p) {
        if (typeof p === 'number' && p >= 0 && p <= 2) this.pitch = p;
    }

    setLang(lang) {
        if (typeof lang === 'string') this.lang = lang;
    }

    /**
     * Speak the provided text.
     * Returns a Promise that resolves when utterance ends (or rejects on error).
     * If something is currently speaking we cancel it first.
     * Options:
     *  - forceCancel: boolean - cancel current and start immediately
     *  - onBoundary: function(event) - receives boundary events if wanted
     */
    speak(text, options = {}) {
        if (!text || typeof text !== 'string') {
            return Promise.reject(new Error('TTS: invalid text'));
        }

        // cancel current if any
        if (this.synth.speaking || options.forceCancel) {
            this.cancel();
        }

        return new Promise((resolve, reject) => {
            try {
                const u = new SpeechSynthesisUtterance(text);
                u.lang = this.lang;
                u.rate = this.rate;
                u.pitch = this.pitch;
                if (this.voice) u.voice = this.voice;

                u.onend = (evt) => {
                    this._currentUtterance = null;
                    this._speakingPromiseResolve = null;
                    this._speakingPromiseReject = null;
                    resolve(evt);
                };
                u.onerror = (err) => {
                    this._currentUtterance = null;
                    this._speakingPromiseResolve = null;
                    this._speakingPromiseReject = null;
                    reject(err);
                };
                if (typeof options.onBoundary === 'function') {
                    u.onboundary = options.onBoundary;
                }

                this._currentUtterance = u;
                this._speakingPromiseResolve = resolve;
                this._speakingPromiseReject = reject;
                this.synth.speak(u);
            } catch (e) {
                this._currentUtterance = null;
                this._speakingPromiseResolve = null;
                this._speakingPromiseReject = null;
                reject(e);
            }
        });
    }

    pause() {
        if (this.synth.speaking && !this.synth.paused) {
            this.synth.pause();
        }
    }

    resume() {
        if (this.synth.paused) {
            this.synth.resume();
        }
    }

    cancel() {
        try {
            if (this.synth.speaking || this.synth.pending) {
                this.synth.cancel();
            }
        } catch (e) {
            // ignore
        } finally {
            if (this._speakingPromiseReject) {
                this._speakingPromiseReject(new Error('TTS canceled'));
            }
            this._currentUtterance = null;
            this._speakingPromiseResolve = null;
            this._speakingPromiseReject = null;
        }
    }

    isSpeaking() {
        return !!(this.synth && this.synth.speaking && !this.synth.paused);
    }
}

const ttsService = new TtsService();
export default ttsService;
