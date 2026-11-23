// Interaction 3: knocking on a wooden door.
// 1. A quick left/right shake (acceleration X) starts a knock.
// 2. A stronger shake makes that knock louder.
// 3. Tilting the phone forward/back by 25 degrees changes one knock to two.
let dspNode = null;
const knock = new FaustWasm2ScriptProcessor('knock', { wasmPath: 'wasm/knock.wasm' });

const description = document.querySelector('#info p');
if (description) {
    description.innerHTML = `
        <b>Knock on a wooden door</b><br><br>
        1. Shake the phone left/right to knock.<br>
        2. Shake harder for a louder knock.<br>
        3. Tilt the phone forward/back for a double knock; hold it normally for a single knock.<br><br>
        Tap “Turn On DSP” first and allow motion access. Adjust the horizontal shake
        threshold to change sensitivity. On a computer, click the left half of the
        page for a single knock or the right half for a double knock.`;
}

knock.createDSP(audioContext, 1024).then(node => {
    if (!node) {
        console.error('Could not load wasm/knock.wasm. Use Live Server or GitHub Pages.');
        if (description) description.insertAdjacentHTML('beforeend', '<br><b>Sound could not load. Open the page through a web server and upload the wasm folder.</b>');
        return;
    }
    dspNode = node;
    dspNode.connect(audioContext.destination);
    console.log('Knock controls:', dspNode.getParams());
});

let restingX = 0;
let previousMotion = 0;
let lastDirection = 0;
let lastKnockAt = -Infinity;
let hasMotionData = false;
let initialTilt = null;
let doubleKnock = false;

function accelerationChange(accx, accy, accz) {
    if (![accx, accy, accz].every(Number.isFinite)) return;
    if (Math.abs(accx) + Math.abs(accy) + Math.abs(accz) > 0.1) hasMotionData = true;

    // Remove gravity and slow tilting; detect a quick horizontal movement.
    restingX = restingX * 0.9 + accx * 0.1;
    const motion = accx - restingX;
    const threshold = sliders[0]?.value() ?? 8;
    const direction = Math.sign(motion);
    const now = millis();
    if (Math.abs(motion) >= threshold &&
        (Math.abs(previousMotion) < threshold * 0.6 || direction !== lastDirection) &&
        now - lastKnockAt >= 220) {
        // Map roughly 8–24 m/s² to a safe strength of 0.3–0.85.
        const strength = Math.min(0.85, Math.max(0.3, Math.abs(motion) / 28));
        if (playAudio(strength, doubleKnock)) {
            lastKnockAt = now;
            lastDirection = direction;
            shaketimer = now;
            statusLabels[0]?.style('color', 'pink');
        }
    }
    previousMotion = motion;
}

function rotationChange(rotx) {
    if (!hasMotionData || !Number.isFinite(rotx)) return;
    if (initialTilt === null) initialTilt = rotx;
    // Signed shortest angle difference handles the -180/180 wraparound.
    const tilt = ((rotx - initialTilt + 540) % 360) - 180;
    doubleKnock = Math.abs(tilt) >= 25;
}

function mousePressed() {
    // Desktop preview; p5 reports the click position in the canvas.
    playAudio(0.6, mouseX >= windowWidth / 2);
}

function deviceMoved() {
    movetimer = millis();
    statusLabels[2]?.style('color', 'pink');
}

function deviceTurned() {
    threshVals[1] = turnAxis;
}

// p5's built-in shake event includes the Y axis; the X-axis detector above is used.
function deviceShaken() {}

function knockOnce(strength) {
    if (!dspNode || audioContext.state !== 'running') return;
    dspNode.setParamValue('/knock/strength', strength);
    dspNode.setParamValue('/knock/knock', 1);
    setTimeout(() => {
        if (dspNode) dspNode.setParamValue('/knock/knock', 0);
    }, 45);
}

function playAudio(strength = 0.6, twice = false) {
    if (!dspNode || audioContext.state !== 'running') return false;
    knockOnce(strength);
    if (twice) setTimeout(() => knockOnce(strength * 0.8), 130);
    return true;
}
