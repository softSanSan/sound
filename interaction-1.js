//==========================================================================================
// AUDIO SETUP
//------------------------------------------------------------------------------------------
// Load the WASM file and connect it to the audio output.
//------------------------------------------------------------------------------------------
//==========================================================================================
let dspNode = null;
let dspNodeParams = null;
let jsonParams = null;

// Interaction 1 uses the door knock sound.
const dspName = "knock";
const instance = new FaustWasm2ScriptProcessor(dspName, { wasmPath: "wasm/knock.wasm" });

if (typeof module === "undefined") {
    window[dspName] = instance;
} else {
    const exp = {};
    exp[dspName] = instance;
    module.exports = exp;
}

instance.createDSP(audioContext, 1024)
    .then(node => {
        if (!node) return;
        dspNode = node;
        dspNode.connect(audioContext.destination);
        console.log('params: ', dspNode.getParams());
        const jsonString = dspNode.getJSON();
        jsonParams = JSON.parse(jsonString)["ui"][0]["items"];
        dspNodeParams = jsonParams;
    });

//==========================================================================================
// INTERACTIONS
//------------------------------------------------------------------------------------------
// Read motion and decide when to call playAudio().
//------------------------------------------------------------------------------------------
//==========================================================================================
let lastXSign = 0;
let xChanges = 0;
let lastXPeak = 0;
let lastKnock = -Infinity;
let nativeMotion = false;
let baselineReady = false;
let baselineX = 0;
let baselineY = 0;

function checkXShake(x, y, now, linear) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!linear) {
        // Remove gravity when the phone only provides raw acceleration.
        if (!baselineReady) {
            baselineX = x;
            baselineY = y;
            baselineReady = true;
            return;
        }
        baselineX = baselineX * 0.9 + x * 0.1;
        baselineY = baselineY * 0.9 + y * 0.1;
        x -= baselineX;
        y -= baselineY;
    }

    const threshold = sliders[0]?.value() ?? 8;
    if (Math.abs(x) < threshold || Math.abs(x) <= Math.abs(y) * 1.25) return;
    const sign = Math.sign(x);
    if (sign === lastXSign) return;

    const gap = now - lastXPeak;
    xChanges = lastXSign && gap >= 70 && gap <= 800 ? xChanges + 1 : 0;
    lastXSign = sign;
    lastXPeak = now;

    // Two reversals (+, -, +) count as a repeated X-axis shake.
    if (xChanges >= 2 && now - lastKnock >= 130) {
        if (playAudio(Math.abs(x) / 24)) lastKnock = now;
    }
}

function accelerationChange(accx, accy, accz) {
    if (!nativeMotion) checkXShake(accx, accy, millis(), false);
}

// Use native motion data when available; p5 acceleration can be zero on some phones.
window.addEventListener('devicemotion', event => {
    const a = event.acceleration;
    const linear = a && Number.isFinite(a.x) && Number.isFinite(a.y);
    const sample = linear ? a : event.accelerationIncludingGravity;
    if (!sample) return;
    if (!nativeMotion) baselineReady = false;
    nativeMotion = true;
    checkXShake(sample.x, sample.y, performance.now(), linear);
}, { passive: true });

function rotationChange(rotx, roty, rotz) {}

function mousePressed() {
    // Click to test the sound on a computer.
    playAudio(0.6);
}

function deviceMoved() {
    movetimer = millis();
    statusLabels[2].style("color", "pink");
}

function deviceTurned() {
    threshVals[1] = turnAxis;
}

function deviceShaken() {
    // The X-axis detector above decides when to play.
}

function getMinMaxParam(address) {
    const param = findByAddress(dspNodeParams, address);
    return getParamMinMax(param);
}

//==========================================================================================
// AUDIO INTERACTION
//------------------------------------------------------------------------------------------
// Set the Faust parameters that produce the sound.
//------------------------------------------------------------------------------------------
//==========================================================================================
function playAudio(strength = 0.6) {
    if (!dspNode || audioContext.state !== 'running') return false;
    dspNode.setParamValue("/knock/strength", Math.min(0.85, Math.max(0.3, strength)));
    dspNode.setParamValue("/knock/knock", 1);
    setTimeout(() => dspNode.setParamValue("/knock/knock", 0), 45);
    return true;
}

//==========================================================================================
// END
//==========================================================================================
