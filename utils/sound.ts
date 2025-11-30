
let muted = false;

const SOUND_URLS: { [key: string]: string } = {
    'plow': 'https://actions.google.com/sounds/v1/tools/shovel_dig.ogg',
    'plant': 'https://upload.wikimedia.org/wikipedia/commons/a/a2/Beans_pouring.ogg',
    'build': 'https://actions.google.com/sounds/v1/tools/hammering_on_metal.ogg',
    'wood': 'https://actions.google.com/sounds/v1/tools/wood_chop.ogg',
    'clay': 'https://actions.google.com/sounds/v1/foley/mud_splat.ogg',
    'stone': 'https://actions.google.com/sounds/v1/impacts/crash_heavy.ogg',
    'reed': 'https://actions.google.com/sounds/v1/foley/leaves_rustle.ogg',
    'food': 'https://actions.google.com/sounds/v1/eating/apple_bite.ogg',
    'fence': 'https://actions.google.com/sounds/v1/tools/wooden_mallet_hit.ogg',
    'harvest': 'https://actions.google.com/sounds/v1/cartoon/harp_strum.ogg',
    'pop': 'https://actions.google.com/sounds/v1/cartoon/pop.ogg',
    'sheep': 'https://actions.google.com/sounds/v1/animals/sheep_baa.ogg',
    'boar': 'https://actions.google.com/sounds/v1/animals/pig_oink.ogg',
    'cow': 'https://upload.wikimedia.org/wikipedia/commons/b/b3/Cow_mooing.ogg',
    'cook': 'https://actions.google.com/sounds/v1/water/frying_pan_sizzle.ogg',
    'click': 'https://actions.google.com/sounds/v1/cartoon/pop.ogg',
    'error': 'https://actions.google.com/sounds/v1/cartoon/clank_car_crash.ogg',
    'fanfare': 'https://actions.google.com/sounds/v1/cartoon/success_trumpet.ogg',
    'gain': 'https://actions.google.com/sounds/v1/cartoon/pop.ogg'
};

export const toggleMute = () => {
    muted = !muted;
    return muted;
};

export const isMuted = () => muted;

export const playSound = (type: string) => {
    if (muted) return;
    
    // Check if mapping exists, fallback to pop if not found
    const url = SOUND_URLS[type] || SOUND_URLS['pop'];
    
    // Using simple HTML5 Audio
    const audio = new Audio(url);
    audio.volume = 0.5; // Reasonable default volume
    
    // Fire and forget, handle errors silently
    audio.play().catch(e => {
        // Often fails due to lack of user interaction first, or network issues
        // console.warn("Sound play failed:", e); 
    });
};
