//basing on peaky audio
function detectBeats(audioBuffer, opts) {
    opts = opts || {};
    var sensitivity = opts.sensitivity || 1.2;
    var minBpm = opts.minBpm || 60;
    var maxBpm = opts.maxBpm || 200;

    var sampleRate = audioBuffer.sampleRate;
    var mono = mixToMono(audioBuffer);
    // detec accuracy
    var filtered = lowPass(mono, sampleRate, 150);
    filtered = lowPass(filtered, sampleRate, 150);

    var windowSec = 0.01;
    var windowSize = Math.max(1, Math.floor(sampleRate * windowSec));
    var numWindows = Math.floor(filtered.length / windowSize);

    var energies = new Float64Array(numWindows);
    for (var i = 0; i < numWindows; i++) {
        var sum = 0;
        var start = i * windowSize;
        for (var j = start; j < start + windowSize; j++) {
            sum += filtered[j] * filtered[j];
        }
        energies[i] = sum / windowSize;
    }

    var historyWindows = Math.max(4, Math.round(1.0 / windowSec));
    var minIntervalWindows = Math.max(1, Math.round((60 / maxBpm) / windowSec));

    var beatSampleIndices = [];
    var lastBeat = -Infinity;

    for (var k = historyWindows; k < numWindows; k++) {
        var sumE = 0, sumSq = 0;
        for (var h = k - historyWindows; h < k; h++) {
            sumE += energies[h];
            sumSq += energies[h] * energies[h];
        }
        var avg = sumE / historyWindows;
        var variance = sumSq / historyWindows - avg * avg;

        var c = -0.0025714 * variance + 1.5142857;
        c = Math.max(1.0, c);
        var threshold = avg * c * sensitivity;

        if (avg > 0 && energies[k] > threshold && (k - lastBeat) >= minIntervalWindows) {
            // The window that first crosses the threshold lags peak...
            var searchStart = k * windowSize;
            var searchEnd = Math.min(filtered.length, searchStart + Math.round(sampleRate * 0.06));
            var peakIdx = searchStart;
            var peakVal = -Infinity;
            for (var s = searchStart; s < searchEnd; s++) {
                var v = filtered[s] * filtered[s];
                if (v > peakVal) {
                    peakVal = v;
                    peakIdx = s;
                }
            }
            beatSampleIndices.push(peakIdx);
            lastBeat = k;
        }
    }

    var beats = beatSampleIndices.map(function (idx) {
        return idx / sampleRate;
    });

    var bpm = estimateBpm(beats, minBpm, maxBpm);
    return { beats: beats, bpm: bpm };
}

function mixToMono(audioBuffer) {
    var ch = audioBuffer.numberOfChannels;
    var length = audioBuffer.length;
    var out = new Float32Array(length);
    for (var c = 0; c < ch; c++) {
        var data = audioBuffer.getChannelData(c);
        for (var i = 0; i < length; i++) {
            out[i] += data[i] / ch;
        }
    }
    return out;
}
// rc filter
function lowPass(data, sampleRate, cutoffHz) {
    var rc = 1.0 / (cutoffHz * 2 * Math.PI);
    var dt = 1.0 / sampleRate;
    var alpha = dt / (rc + dt);
    var out = new Float32Array(data.length);
    out[0] = data[0];
    for (var i = 1; i < data.length; i++) {
        out[i] = out[i - 1] + alpha * (data[i] - out[i - 1]);
    }
    return out;
}

function estimateBpm(beats, minBpm, maxBpm) {
    if (beats.length < 2) return null;
    var intervals = [];
    for (var i = 1; i < beats.length; i++) {
        intervals.push(beats[i] - beats[i - 1]);
    }
    intervals.sort(function (a, b) { return a - b; });
    var median = intervals[Math.floor(intervals.length / 2)];
    if (!median) return null;

    var bpm = 60 / median;
    while (bpm < minBpm) bpm *= 2;
    while (bpm > maxBpm) bpm /= 2;
    return bpm;
}
