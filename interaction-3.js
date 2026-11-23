// Interaction 3: three gestures, three sounds.
// Repeated X acceleration reversals -> knock; repeated Y reversals -> bubbles;
// resting flat -> wind.
let dspNode = null; // Kept for the shared Turn On DSP button in sketch.js.
const knock = new FaustWasm2ScriptProcessor('knock', { wasmPath: 'wasm/knock.wasm' });
const bubble = new FaustWasm2ScriptProcessor('bubble', { wasmPath: 'wasm/bubble.wasm' });
const wind = new FaustWasm2ScriptProcessor('wind', { wasmPath: 'wasm/wind.wasm' });
const audioNodes = { knock: null, bubble: null, wind: null };

const description = document.querySelector('#info p');
if (description) {
    description.innerHTML = `
        <b>Three gestures, three sounds</b><br><br>
        1. Repeated changes in X acceleration (left/right): knock on a door.<br>
        2. Repeated changes in Y acceleration (up/down): make bubbles.<br>
        3. Hold the phone flat and still: hear wind; lift it to stop the wind.<br><br>
        On a computer, use the three test buttons above. On a phone, tap
        “Turn On DSP”, allow motion access, and hold it upright in portrait mode
        for shaking. Adjust the shake threshold if needed.`;
}

const testPanel = document.createElement('div');
const testStatus = document.createElement('p');
testStatus.textContent = location.protocol === 'file:'
    ? 'Use Live Server or GitHub Pages; file:// cannot load WASM.'
    : 'Loading knock, bubble and wind…';
const testButtons = {};
for (const [name, label] of Object.entries({
    knock: 'Test knock', bubble: 'Test bubbles', wind: 'Test wind'
})) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.cssText = 'margin:0.2em;padding:0.5em;background:#ffae35;border-radius:8px;font-weight:bold;cursor:pointer';
    button.addEventListener('click', event => {
        event.stopPropagation();
        testOnComputer(name);
    });
    testButtons[name] = button;
    testPanel.appendChild(button);
}
testPanel.appendChild(testStatus);
document.querySelector('#info')?.prepend(testPanel);

let desiredWindForce = 0;
const ready = {};
for (const [name, loader] of Object.entries({ knock, bubble, wind })) {
    ready[name] = loader.createDSP(audioContext, 1024).then(node => {
        if (!node) throw new Error(`wasm/${name}.wasm did not load`);
        audioNodes[name] = node;
        if (name === 'knock') dspNode = node;
        // Wind's Faust default is nonzero, so silence it before connecting.
        if (name === 'wind') {
            node.setParamValue('/wind/volume', 0.8);
            node.setParamValue('/wind/wind/force', desiredWindForce);
        }
        node.connect(audioContext.destination);
        console.log(`${name} controls:`, node.getParams());
        if (Object.values(audioNodes).every(Boolean)) {
            testStatus.textContent = 'All three sounds are ready. Click a test button.';
        }
        return node;
    }).catch(error => {
        console.error(`${name} loading failed:`, error);
        testStatus.textContent = `Could not load ${name}. Upload wasm/${name}.wasm and use Live Server or GitHub Pages.`;
        return null;
    });
}

function pulse(node, address) {
    node.setParamValue(address, 1);
    setTimeout(() => node.setParamValue(address, 0), 45);
}

function triggerKnock(strength = 0.6) {
    const node = audioNodes.knock;
    if (!node || audioContext.state !== 'running') return false;
    node.setParamValue('/knock/strength', Math.min(0.85, Math.max(0.3, strength)));
    pulse(node, '/knock/knock');
    return true;
}

function triggerBubble(strength = 0.6) {
    const node = audioNodes.bubble;
    if (!node || audioContext.state !== 'running') return false;
    node.setParamValue('/bubble/bubble/freq', 350 + Math.round(1050 * Math.min(1, Math.max(0, strength))));
    node.setParamValue('/bubble/bubble/volume', 0.75);
    pulse(node, '/bubble/drop');
    return true;
}

function setWindForce(force) {
    desiredWindForce = force;
    if (audioNodes.wind) audioNodes.wind.setParamValue('/wind/wind/force', force);
}

async function testOnComputer(name) {
    try {
        // Start the audio context in this click gesture, before waiting for WASM.
        const resume = audioContext.resume();
        testStatus.textContent = `Starting ${name}…`;
        await resume;
        if (!await ready[name]) {
            testStatus.textContent = `Could not load wasm/${name}.wasm.`;
            return;
        }
        if (audioContext.state !== 'running') throw new Error(`AudioContext is ${audioContext.state}`);
        if (name === 'knock') triggerKnock(0.8);
        if (name === 'bubble') triggerBubble(0.7);
        if (name === 'wind') {
            setWindForce(0.7);
            setTimeout(() => setWindForce(0), 1500);
        }
        testStatus.textContent = `Playing ${name}.`;
    } catch (error) {
        console.error(`${name} test failed:`, error);
        testStatus.textContent = `Audio could not start: ${error.message}`;
    }
}

let gravityX = 0, gravityY = 0, gravityZ = 0;
let gravityReady = false;
const axisPeaks = {
    x: { sign: 0, at: -Infinity, reversals: 0 },
    y: { sign: 0, at: -Infinity, reversals: 0 }
};
let lastSoundAt = -Infinity;
let flatSince = null;
let windPlaying = false;
let windStoppedAt = -Infinity;
let nativeMotionSeen = false;

function resetAxisPeaks() {
    for (const state of Object.values(axisPeaks)) {
        state.sign = 0;
        state.at = -Infinity;
        state.reversals = 0;
    }
}

function repeatedAxisChange(axis, value, other, threshold, now) {
    // Ignore weak or diagonal movement; only count clear peaks on one axis.
    if (Math.abs(value) < threshold || Math.abs(value) <= Math.abs(other) * 1.25) return;
    const state = axisPeaks[axis];
    const sign = Math.sign(value);
    if (sign === state.sign) return;
    const interval = now - state.at;
    state.reversals = state.sign !== 0 && interval >= 70 && interval <= 800
        ? state.reversals + 1 : 0;
    state.sign = sign;
    state.at = now;

    // +, -, + (or -, +, -) is one repeated back-and-forth shake.
    if (state.reversals < 2 || now - lastSoundAt < 130) return;
    const intensity = Math.min(1, Math.abs(value) / 24);
    const played = axis === 'x' ? triggerKnock(intensity) : triggerBubble(intensity);
    if (!played) return;
    lastSoundAt = now;
    shaketimer = now;
    statusLabels[0]?.style('color', 'pink');
    testStatus.textContent = axis === 'x'
        ? 'Repeated X acceleration: knock.'
        : 'Repeated Y acceleration: bubbles.';
}

function processMotion(x, y, z, hasGravity, now, linear = null) {
    if (![x, y, z].every(Number.isFinite)) return;
    if (!gravityReady) {
        gravityX = x; gravityY = y; gravityZ = z;
        gravityReady = true;
        return;
    }
    // Low-pass gravity/slow tilt, leaving quick movement on X and Y.
    gravityX = 0.9 * gravityX + 0.1 * x;
    gravityY = 0.9 * gravityY + 0.1 * y;
    gravityZ = 0.9 * gravityZ + 0.1 * z;
    const dx = x - gravityX;
    const dy = y - gravityY;
    const dz = z - gravityZ;
    const shakeX = linear ? linear.x : dx;
    const shakeY = linear ? linear.y : dy;
    const motion = Math.hypot(dx, dy, dz);

    // A flat, nearly still phone has gravity mostly along its Z axis.
    const gravityLength = Math.hypot(gravityX, gravityY, gravityZ);
    const flat = hasGravity && gravityLength > 6 &&
        Math.abs(gravityZ) / gravityLength > 0.9 && motion < 2.5;
    if (flat) {
        if (flatSince === null) flatSince = now;
    } else {
        flatSince = null;
    }
    const shouldPlayWind = flatSince !== null && now - flatSince >= 350;
    const wasWindPlaying = windPlaying;
    if (shouldPlayWind !== windPlaying) {
        windPlaying = shouldPlayWind;
        if (!windPlaying) windStoppedAt = now;
        setWindForce(windPlaying ? 0.7 : 0);
        testStatus.textContent = windPlaying ? 'Phone flat: wind on.' : 'Phone lifted: wind off.';
    }

    const threshold = typeof sliders !== 'undefined' ? (sliders[0]?.value() ?? 8) : 8;
    // A lift from the flat position is an orientation change, not a shake.
    if (wasWindPlaying || now - windStoppedAt < 350) {
        resetAxisPeaks();
        return;
    }
    repeatedAxisChange('x', shakeX, shakeY, threshold, now);
    repeatedAxisChange('y', shakeY, shakeX, threshold, now);
}

// Read native motion as well as p5: some phones report zero p5 acceleration.
window.addEventListener('devicemotion', event => {
    const withGravity = event.accelerationIncludingGravity;
    const validGravity = withGravity && [withGravity.x, withGravity.y, withGravity.z].every(Number.isFinite);
    const sample = validGravity ? withGravity : event.acceleration;
    if (!sample || ![sample.x, sample.y, sample.z].every(Number.isFinite)) return;
    const linear = event.acceleration && [event.acceleration.x, event.acceleration.y, event.acceleration.z].every(Number.isFinite)
        ? event.acceleration : null;
    if (!nativeMotionSeen) {
        // Discard p5's initial zero readings before the first real sensor sample.
        gravityReady = false;
        resetAxisPeaks();
    }
    nativeMotionSeen = true;
    processMotion(sample.x, sample.y, sample.z, Boolean(validGravity), performance.now(), linear);
}, { passive: true });

function accelerationChange(accx, accy, accz) {
    if (nativeMotionSeen) return;
    processMotion(accx, accy, accz, false, millis());
}

function rotationChange() {}
function mousePressed() {} // Desktop testing uses the three buttons above.
function deviceShaken() {} // The axis-specific detector above chooses the sound.
function deviceMoved() {
    movetimer = millis();
    statusLabels[2]?.style('color', 'pink');
}
function deviceTurned() {
    threshVals[1] = turnAxis;
}

// sketch.js calls playAudio on startup; gestures and test buttons own the sounds.
function playAudio() { return false; }
