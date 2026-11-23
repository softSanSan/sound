//==========================================================================================
// AUDIO SETUP
//------------------------------------------------------------------------------------------
// Load the WASM file and connect it to the audio output.
//------------------------------------------------------------------------------------------
//==========================================================================================
let dspNode = null;
let dspNodeParams = null;
let jsonParams = null;

// Interaction 2 uses the bubble sound.
const dspName = "bubble";
const instance = new FaustWasm2ScriptProcessor(dspName, { wasmPath: "wasm/bubble.wasm" });

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
let lastYSign = 0;
let yChanges = 0;
let lastYPeak = 0;
let lastBubble = -Infinity;
let nativeMotion = false;
let baselineReady = false;
let baselineX = 0;
let baselineY = 0;
let thresholdReady = false;

function checkYShake(x, y, now, linear) {
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

    // The shared page starts at 30; use 8 for a practical Y-axis threshold.
    if (!thresholdReady && sliders[0]) {
        sliders[0].value(8);
        thresholdReady = true;
    }
    const threshold = sliders[0]?.value() ?? 8;
    if (Math.abs(y) < threshold || Math.abs(y) <= Math.abs(x) * 1.25) return;
    const sign = Math.sign(y);
    if (sign === lastYSign) return;

    const gap = now - lastYPeak;
    yChanges = lastYSign && gap >= 70 && gap <= 800 ? yChanges + 1 : 0;
    lastYSign = sign;
    lastYPeak = now;

    // Two reversals (+, -, +) count as a repeated Y-axis shake.
    if (yChanges >= 2 && now - lastBubble >= 130) {
        if (playAudio(Math.abs(y) / 24)) lastBubble = now;
    }
}

function accelerationChange(accx, accy, accz) {
    if (!nativeMotion) checkYShake(accx, accy, millis(), false);
}

window.addEventListener('devicemotion', event => {
    const a = event.acceleration;
    const linear = a && Number.isFinite(a.x) && Number.isFinite(a.y);
    const sample = linear ? a : event.accelerationIncludingGravity;
    if (!sample) return;
    if (!nativeMotion) baselineReady = false;
    nativeMotion = true;
    checkYShake(sample.x, sample.y, performance.now(), linear);
}, { passive: true });

function rotationChange(rotx, roty, rotz) {}

function mousePressed() {
    // Click to test the sound on a computer.
    playAudio(0.7);
}

function deviceMoved() {
    movetimer = millis();
    statusLabels[2].style("color", "pink");
}

function deviceTurned() {
    threshVals[1] = turnAxis;
}

function deviceShaken() {
    // The Y-axis detector above decides when to play.
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
function playAudio(strength = 0.7) {
    if (!dspNode || audioContext.state !== 'running') return false;
    const frequency = 350 + Math.round(1050 * Math.min(1, strength));
    dspNode.setParamValue("/bubble/bubble/freq", frequency);
    dspNode.setParamValue("/bubble/bubble/volume", 0.75);
    dspNode.setParamValue("/bubble/drop", 1);
    setTimeout(() => dspNode.setParamValue("/bubble/drop", 0), 45);
    return true;
}

//==========================================================================================
// END
//==========================================================================================
