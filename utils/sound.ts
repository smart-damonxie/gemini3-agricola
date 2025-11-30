
let audioCtx: AudioContext | null = null;
let muted = false;

const initAudio = () => {
  if (!audioCtx && typeof window !== 'undefined') {
    // @ts-ignore
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
};

export const toggleMute = () => {
    muted = !muted;
    return muted;
};

export const isMuted = () => muted;

const createOscillator = (type: OscillatorType, freq: number, duration: number, startTime: number, vol: number = 0.1) => {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    
    gain.gain.setValueAtTime(vol, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(startTime);
    osc.stop(startTime + duration);
};

const createNoise = (duration: number, vol: number = 0.1) => {
    if (!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000;
    
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    noise.start();
};

export const playSound = (type: 'plow' | 'plant' | 'build' | 'wood' | 'harvest' | 'pop' | 'sheep' | 'boar' | 'cow' | 'cook' | 'error' | 'click' | 'fanfare' | 'gain') => {
  if (muted) return;
  initAudio();
  if (!audioCtx) return;

  const t = audioCtx.currentTime;

  switch (type) {
    case 'pop':
        createOscillator('sine', 800, 0.1, t, 0.05);
        break;
    case 'click':
        createOscillator('triangle', 1200, 0.05, t, 0.02);
        break;
    case 'error':
        createOscillator('sawtooth', 150, 0.3, t, 0.1);
        break;
    case 'plow':
        createNoise(0.4, 0.2); // Earthy crunch
        createOscillator('square', 100, 0.1, t, 0.05);
        break;
    case 'wood':
        createOscillator('square', 300, 0.05, t, 0.1); // Short wood click
        break;
    case 'build':
        // Hammer sound: metal impact + noise
        createOscillator('square', 200, 0.1, t, 0.2);
        createNoise(0.1, 0.1);
        setTimeout(() => {
             if(!muted && audioCtx) {
                createOscillator('square', 200, 0.1, audioCtx.currentTime, 0.15);
                createNoise(0.1, 0.1);
             }
        }, 250);
        break;
    case 'plant':
        // Rustle
        createNoise(0.1, 0.05);
        createOscillator('sine', 1200, 0.1, t, 0.01);
        break;
    case 'harvest':
        // Chime
        createOscillator('sine', 523.25, 0.5, t, 0.1);
        createOscillator('sine', 659.25, 0.5, t + 0.1, 0.1);
        createOscillator('sine', 783.99, 0.8, t + 0.2, 0.1);
        break;
    case 'fanfare':
        // Major chord
        createOscillator('triangle', 440, 0.4, t, 0.1);
        createOscillator('triangle', 554, 0.4, t, 0.1);
        createOscillator('triangle', 659, 0.4, t, 0.1);
        break;
    case 'cook':
        // Sizzle
        createNoise(0.5, 0.1);
        break;
    case 'gain':
        // Coin-like
        createOscillator('sine', 1000, 0.1, t, 0.05);
        createOscillator('sine', 1500, 0.2, t + 0.05, 0.05);
        break;
    // Animals
    case 'sheep': // Baa - vibrato triangle
        const oscS = audioCtx.createOscillator();
        oscS.type = 'triangle';
        oscS.frequency.setValueAtTime(200, t);
        const gainS = audioCtx.createGain();
        gainS.gain.setValueAtTime(0.1, t);
        gainS.gain.linearRampToValueAtTime(0, t + 0.4);
        
        // Tremolo
        const lfo = audioCtx.createOscillator();
        lfo.frequency.value = 10;
        const lfoGain = audioCtx.createGain();
        lfoGain.gain.value = 500;
        lfo.connect(lfoGain);
        lfoGain.connect(gainS.gain);
        
        oscS.connect(gainS);
        gainS.connect(audioCtx.destination);
        oscS.start(t);
        oscS.stop(t + 0.4);
        lfo.start(t);
        lfo.stop(t + 0.4);
        break;
    case 'cow': // Moo - low sawtooth
        createOscillator('sawtooth', 100, 0.8, t, 0.15);
        // Filter movement for 'wow' sound
        const oscC = audioCtx.createOscillator();
        oscC.type = 'sawtooth';
        oscC.frequency.value = 80;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 5;
        filter.frequency.setValueAtTime(200, t);
        filter.frequency.linearRampToValueAtTime(600, t + 0.3);
        filter.frequency.linearRampToValueAtTime(200, t + 0.8);
        const gainC = audioCtx.createGain();
        gainC.gain.setValueAtTime(0.1, t);
        gainC.gain.linearRampToValueAtTime(0, t + 0.8);
        oscC.connect(filter);
        filter.connect(gainC);
        gainC.connect(audioCtx.destination);
        oscC.start(t);
        oscC.stop(t + 0.8);
        break;
    case 'boar': // Grunt - short low square
        createOscillator('sawtooth', 60, 0.15, t, 0.2);
        createOscillator('sawtooth', 50, 0.15, t+0.2, 0.2);
        break;
  }
};
