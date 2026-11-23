let dspNode = null;
const audioStatus = document.getElementById('audio-status');
const knock = new FaustWasm2ScriptProcessor("knock", { wasmPath: "wasm/knock.wasm" });

knock.createDSP(audioContext, 1024).then(node => {
    if (!node) {
        if (audioStatus) audioStatus.textContent = 'Could not load wasm/knock.wasm. Open this page through a web server or GitHub Pages, and upload the wasm folder.';
        return;
    }
    dspNode = node;
    dspNode.connect(audioContext.destination);
    console.log("Knock controls:", dspNode.getParams());
    if (audioStatus) audioStatus.textContent = audioContext.state === 'running'
        ? 'Audio on. Shake left/right, or tap to test.'
        : 'Sound ready. Tap “Turn On DSP” to start.';
    if (audioContext.state === 'running') playAudio(0.7);
});

if (location.protocol === 'file:' && audioStatus) {
    audioStatus.textContent = 'Local file mode cannot load WASM. Use Live Server or GitHub Pages.';
}

let restingX = 0;
let previousMotion = 0;
let lastDirection = 0;
let lastKnockAt = -Infinity;

function accelerationChange(accx) {
    if (!Number.isFinite(accx)) return;
    // Remove gravity and slow tilting so a quick left/right motion is detected.
    restingX = restingX * 0.9 + accx * 0.1;
    const motion = accx - restingX;
    const threshold = sliders[0]?.value() ?? 8;
    const direction = Math.sign(motion);
    const now = millis();
    if (Math.abs(motion) >= threshold &&
        (Math.abs(previousMotion) < threshold * 0.6 || direction !== lastDirection) &&
        now - lastKnockAt > 170) {
        const strength = Math.min(0.85, Math.max(0.3, Math.abs(motion) / 24));
        if (playAudio(strength)) {
            lastKnockAt = now;
            lastDirection = direction;
            shaketimer = now;
            statusLabels[0]?.style("color", "pink");
        }
    }
    previousMotion = motion;
}

function rotationChange() {}

// Desktop preview: click the page after turning on the DSP.
function mousePressed() {
    playAudio(0.55);
}

function deviceMoved() {
    movetimer = millis();
    statusLabels[2].style("color", "pink");
}

function deviceTurned() {
    threshVals[1] = turnAxis;
}

// The built-in p5 shake event considers all axes; horizontal motion is handled above.
function deviceShaken() {}

function playAudio(strength = 0.55) {
    if (!dspNode || audioContext.state !== "running") return false;
    dspNode.setParamValue("/knock/strength", strength);
    dspNode.setParamValue("/knock/knock", 1);
    setTimeout(() => dspNode.setParamValue("/knock/knock", 0), 45);
    return true;
}
