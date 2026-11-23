//==========================================================================================
// AUDIO SETUP
//------------------------------------------------------------------------------------------
// Load the WASM file and connect it to the audio output.
//------------------------------------------------------------------------------------------
//==========================================================================================
let dspNode = null;
let dspNodeParams = null;
let jsonParams = null;

// Interaction 3 uses the wind sound.
const dspName = "wind";
const instance = new FaustWasm2ScriptProcessor(dspName, { wasmPath: "wasm/wind.wasm" });

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
        // Start silent: wind should play only when the phone is flat.
        dspNode.setParamValue("/wind/wind/force", windOn ? 0.7 : 0);
        dspNode.setParamValue("/wind/volume", 0.8);
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
let gravity = null;
let flatSince = null;
let windOn = false;

function accelerationChange(accx, accy, accz) {
    // Flat detection needs gravity, which comes from the native motion event below.
}

window.addEventListener('devicemotion', event => {
    const a = event.accelerationIncludingGravity;
    if (!a || ![a.x, a.y, a.z].every(Number.isFinite)) return;
    if (!gravity) {
        gravity = { x: a.x, y: a.y, z: a.z };
        return;
    }

    // Smooth the accelerometer values to estimate the direction of gravity.
    gravity.x = gravity.x * 0.9 + a.x * 0.1;
    gravity.y = gravity.y * 0.9 + a.y * 0.1;
    gravity.z = gravity.z * 0.9 + a.z * 0.1;
    const g = Math.hypot(gravity.x, gravity.y, gravity.z);
    const still = Math.hypot(a.x - gravity.x, a.y - gravity.y, a.z - gravity.z) < 2.5;
    const flat = g > 6 && Math.abs(gravity.z) / g > 0.9 && still;
    const now = performance.now();

    if (flat) {
        if (flatSince === null) flatSince = now;
    } else {
        flatSince = null;
    }
    const shouldPlay = flatSince !== null && now - flatSince > 350;
    if (shouldPlay !== windOn) {
        windOn = shouldPlay;
        playAudio(windOn ? 0.7 : 0);
    }
}, { passive: true });

function rotationChange(rotx, roty, rotz) {}

function mousePressed() {
    // Click to preview the wind on a computer.
    playAudio(0.7);
    setTimeout(() => playAudio(0), 1500);
}

function deviceMoved() {
    movetimer = millis();
    statusLabels[2].style("color", "pink");
}

function deviceTurned() {
    threshVals[1] = turnAxis;
}

function deviceShaken() {
    // Shaking does not control the wind sound.
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
function playAudio(force) {
    if (!dspNode) return;
    dspNode.setParamValue("/wind/wind/force", force);
}

//==========================================================================================
// END
//==========================================================================================
