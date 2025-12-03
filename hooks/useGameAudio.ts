import { useState, useEffect, useRef, useCallback } from 'react';

// We use string paths because native browser modules cannot 'import' binary files directly.
// Path assumes files are at: [Site Root]/assets/sounds/
const BASE_PATH = '/sounds/';

const FILE_NAMES: { [key: string]: string } = {
    'sheep': 'sheep.wav',
    'boar': 'boar.mp3',
    'cow': 'cow.wav',
    'wood': 'wood.wav',
    'clay': 'clay.mp3',
    'stone': 'stone.wav',
    'grain': 'grain.mp3',
    'vegetables': 'vegetables.mp3',
    'plow': 'plow.mp3',
    'hammer': 'hammer.mp3',
    'sowing': 'sowing.mp3',
    'success': 'success.mp3',
    'click': 'click.wav',
    'baby': 'baby.wav',
    'harvest': 'harvest.mp3',
};

// Map game logical events to specific sound keys
const SOUND_MAPPING: { [key: string]: string } = {
    'plant': 'sowing',
    'build': 'hammer',
    'fence': 'hammer',
    'renovate': 'hammer',
    'harvest': 'harvest',
    'fanfare': 'success',
    'baby': 'baby',
    'pop': 'click',
    'gain': 'click',
    'error': 'click',
    'cook': 'click',
    'food': 'click',
    'click': 'click',
    'reed': 'vegetables', 
    'veg': 'vegetables',
};

export const useGameAudio = () => {
    const [isMuted, setIsMuted] = useState(false);
    const audioCache = useRef<{ [key: string]: HTMLAudioElement }>({});

    // Preload sounds on mount
    useEffect(() => {
        Object.entries(FILE_NAMES).forEach(([key, filename]) => {
            const src = `${BASE_PATH}${filename}`;
            const audio = new Audio(src);
            audio.preload = 'auto';
            audio.volume = 0.5;
            
            // Add error listener to help debug path issues without crashing
            audio.onerror = () => {
                console.warn(`Audio file failed to load at: ${src}. Check file exists and path is correct.`);
            };

            audioCache.current[key] = audio;
        });
    }, []);

    const playSound = useCallback((type: string) => {
        if (isMuted) return;

        // 1. Check if type matches a file key directly (e.g. 'sheep')
        let soundKey = FILE_NAMES[type] ? type : null;

        // 2. If not, check the logical mapping (e.g. 'plant' -> 'sowing')
        if (!soundKey) {
            soundKey = SOUND_MAPPING[type];
        }

        // 3. Fallback to click sound if not found
        if (!soundKey || !audioCache.current[soundKey]) {
            soundKey = 'click';
        }

        const audio = audioCache.current[soundKey];
        if (audio) {
            try {
                // Use cloneNode to allow overlapping sounds (e.g. fast clicks)
                const clone = audio.cloneNode() as HTMLAudioElement;
                clone.volume = 0.5;
                
                const playPromise = clone.play();
                if (playPromise !== undefined) {
                    playPromise.catch(e => {
                        // Suppress expected errors (like user hasn't interacted yet)
                        if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') {
                            console.warn("Audio play warning:", e.message);
                        }
                    });
                }
            } catch (e) {
                console.error("Audio system error", e);
            }
        }
    }, [isMuted]);

    const toggleMute = useCallback(() => {
        setIsMuted(prev => !prev);
    }, []);

    return { playSound, toggleMute, isMuted };
};