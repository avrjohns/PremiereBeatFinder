var fs = require("fs");
var csInterface = new CSInterface();

var els = {
    scanBtn: document.getElementById("scanBtn"),
    detectBtn: document.getElementById("detectBtn"),
    clearBtn: document.getElementById("clearBtn"),
    clipInfo: document.getElementById("clipInfo"),
    sensitivity: document.getElementById("sensitivity"),
    sensitivityVal: document.getElementById("sensitivityVal"),
    minBpm: document.getElementById("minBpm"),
    maxBpm: document.getElementById("maxBpm"),
    color: document.getElementById("color"),
    prefix: document.getElementById("prefix"),
    log: document.getElementById("log"),
    bpmResult: document.getElementById("bpmResult"),
    chooseImagesBtn: document.getElementById("chooseImagesBtn"),
    imageFiles: document.getElementById("imageFiles"),
    imageList: document.getElementById("imageList"),
    placeBtn: document.getElementById("placeBtn")
};

var currentClip = null;
var lastBeatTimes = [];
var selectedImagePaths = [];

function log(msg) {
    var time = new Date().toLocaleTimeString();
    els.log.textContent = "[" + time + "] " + msg + "\n" + els.log.textContent;
}

function evalScript(script) {
    return new Promise(function (resolve) {
        csInterface.evalScript(script, function (result) {
            resolve(result);
        });
    });
}

els.sensitivity.addEventListener("input", function () {
    els.sensitivityVal.textContent = els.sensitivity.value;
});

els.scanBtn.addEventListener("click", async function () {
    var raw = await evalScript("getSelectedClipInfo()");
    var data;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        log("Failed to read response from Premiere.");
        return;
    }
    if (data.error) {
        els.clipInfo.textContent = data.error;
        currentClip = null;
        log(data.error);
        return;
    }
    currentClip = data;
    els.clipInfo.textContent = data.clipName + "  (" +
        (data.clipEndSec - data.clipStartSec).toFixed(1) + "s on timeline)";
    log("Selected clip: " + data.clipName);
});

els.detectBtn.addEventListener("click", async function () {
    if (!currentClip) {
        log("Scan a selected clip first.");
        return;
    }
    els.detectBtn.disabled = true;
    els.bpmResult.textContent = "";
    try {
        log("Reading audio file...");
        var fileBuffer = fs.readFileSync(currentClip.mediaPath);
        var arrayBuffer = fileBuffer.buffer.slice(
            fileBuffer.byteOffset,
            fileBuffer.byteOffset + fileBuffer.byteLength
        );

        log("Decoding audio...");
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        var ctx = new AudioCtx();
        var audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        log("Analyzing beats...");
        var sensitivity = parseFloat(els.sensitivity.value);
        var minBpm = parseFloat(els.minBpm.value) || 60;
        var maxBpm = parseFloat(els.maxBpm.value) || 200;

        var result = detectBeats(audioBuffer, {
            sensitivity: sensitivity,
            minBpm: minBpm,
            maxBpm: maxBpm
        });

        log("Found " + result.beats.length + " beats. Estimated BPM: " +
            (result.bpm ? result.bpm.toFixed(1) : "n/a"));
        els.bpmResult.textContent = result.bpm ? "Estimated BPM: " + result.bpm.toFixed(1) : "";

        // Map source-file-relative beat times to sequence-timeline times,
        // keeping only beats that fall inside the clip's trimmed (visible) range.
        var markers = [];
        for (var i = 0; i < result.beats.length; i++) {
            var t = result.beats[i];
            var timelineT = currentClip.clipStartSec + (t - currentClip.inPointSec);
            if (timelineT < currentClip.clipStartSec || timelineT > currentClip.clipEndSec) continue;
            markers.push({
                t: timelineT,
                n: (els.prefix.value || "Beat"),
                c: "",
                color: parseInt(els.color.value, 10)
            });
        }

        if (markers.length === 0) {
            log("No beats fell within the clip's trimmed range. Try lowering sensitivity.");
            return;
        }

        log("Adding " + markers.length + " markers to the sequence...");
        var resultRaw = await evalScript(
            "addMarkersToSequence(" + JSON.stringify(JSON.stringify(markers)) + ")"
        );
        var addResult = JSON.parse(resultRaw);
        if (addResult.error) {
            log("Error adding markers: " + addResult.error);
        } else {
            log("Done. Added " + addResult.added + " markers.");
            lastBeatTimes = markers.map(function (m) { return m.t; }).sort(function (a, b) { return a - b; });
        }
    } catch (e) {
        log("Error: " + e.message);
    } finally {
        els.detectBtn.disabled = false;
    }
});

els.clearBtn.addEventListener("click", async function () {
    var prefix = els.prefix.value || "Beat";
    var raw = await evalScript("clearBeatMarkers(" + JSON.stringify(prefix) + ")");
    var result = JSON.parse(raw);
    if (result.error) log(result.error);
    else log("Removed " + result.removed + " markers starting with \"" + prefix + "\".");
});

els.chooseImagesBtn.addEventListener("click", function () {
    els.imageFiles.click();
});

els.imageFiles.addEventListener("change", function () {
    var files = Array.prototype.slice.call(els.imageFiles.files);
    // Natural sort (image2 before image10) so sequentially-named frames land in order.
    files.sort(function (a, b) {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });
    selectedImagePaths = files.map(function (f) { return f.path; });

    if (selectedImagePaths.length === 0) {
        els.imageList.textContent = "No images selected.";
    } else {
        els.imageList.textContent = selectedImagePaths.length + " image(s): " +
            files.map(function (f) { return f.name; }).join(", ");
    }
});

els.placeBtn.addEventListener("click", async function () {
    if (!currentClip) {
        log("Scan a selected clip first, so we know the clip's timeline range.");
        return;
    }
    if (lastBeatTimes.length === 0) {
        log("Detect beats first - image placement uses the last detected beat markers.");
        return;
    }
    if (selectedImagePaths.length === 0) {
        log("Select images first.");
        return;
    }

    var count = Math.min(selectedImagePaths.length, lastBeatTimes.length);
    if (selectedImagePaths.length > lastBeatTimes.length) {
        log("More images than beats - only the first " + count + " image(s) will be placed.");
    }

    var images = [];
    for (var i = 0; i < count; i++) {
        var start = lastBeatTimes[i];
        var end = (i + 1 < lastBeatTimes.length) ? lastBeatTimes[i + 1] : currentClip.clipEndSec;
        images.push({ path: selectedImagePaths[i], start: start, end: end });
    }

    els.placeBtn.disabled = true;
    try {
        log("Placing " + images.length + " image(s) at beat markers...");
        var raw = await evalScript(
            "placeImagesAtBeats(" + JSON.stringify(JSON.stringify({ images: images })) + ")"
        );
        var result = JSON.parse(raw);
        if (result.error) {
            log("Error placing images: " + result.error);
        } else {
            log("Done. Placed " + result.placed + " of " + result.totalImages + " image(s).");
        }
    } catch (e) {
        log("Error: " + e.message);
    } finally {
        els.placeBtn.disabled = false;
    }
});
