// Premiere Pro represents time internally as "ticks" (a fixed-point integer).
// This constant is documented in Adobe's scripting guide and never changes.
var TICKS_PER_SECOND = 254016000000;

function timeTicksToSeconds(ticksStr) {
    return Number(ticksStr) / TICKS_PER_SECOND;
}

// Finds the first selected clip on any video or audio track of the active
// sequence and returns everything the panel needs to map source-audio time
// (from the underlying media file) onto sequence-timeline time.
function getSelectedClipInfo() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) {
            return JSON.stringify({ error: "No active sequence. Open a sequence first." });
        }

        var found = null;
        var trackGroups = [seq.audioTracks, seq.videoTracks];

        for (var g = 0; g < trackGroups.length && !found; g++) {
            var tracks = trackGroups[g];
            for (var t = 0; t < tracks.numTracks && !found; t++) {
                var track = tracks[t];
                for (var c = 0; c < track.clips.numItems && !found; c++) {
                    var clip = track.clips[c];
                    if (clip.isSelected()) {
                        found = clip;
                    }
                }
            }
        }

        if (!found) {
            return JSON.stringify({ error: "No clip selected. Select an audio or video clip on the timeline." });
        }

        if (!found.projectItem || !found.projectItem.getMediaPath || found.projectItem.getMediaPath() === "") {
            return JSON.stringify({ error: "Selected clip has no linked media file." });
        }

        var mediaPath = found.projectItem.getMediaPath();
        var clipStartSec = timeTicksToSeconds(found.start.ticks);
        var clipEndSec = timeTicksToSeconds(found.end.ticks);
        var inPointSec = timeTicksToSeconds(found.inPoint.ticks);

        return JSON.stringify({
            mediaPath: mediaPath,
            clipName: found.name,
            clipStartSec: clipStartSec,
            clipEndSec: clipEndSec,
            inPointSec: inPointSec,
            sequenceName: seq.name
        });
    } catch (e) {
        return JSON.stringify({ error: "Script error: " + e.toString() });
    }
}

// markersJson: JSON array of { t: seconds, n: name, c: comment, color: colorIndex }
function addMarkersToSequence(markersJson) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) {
            return JSON.stringify({ error: "No active sequence." });
        }
        var markers = JSON.parse(markersJson);
        var added = 0;

        for (var i = 0; i < markers.length; i++) {
            var m = markers[i];
            var marker = seq.markers.createMarker(m.t);
            if (marker) {
                // Explicitly mark as a standard Comment marker (what the M key
                // creates) so Premiere's "Automate to Sequence > At Unnumbered
                // Markers" placement recognizes it - createMarker() alone
                // doesn't reliably set this.
                if (marker.setTypeAsComment) {
                    marker.setTypeAsComment();
                }
                marker.name = m.n;
                marker.comments = m.c || "";
                if (typeof m.color === "number" && marker.setColorByIndex) {
                    marker.setColorByIndex(m.color);
                }
                added++;
            }
        }
        return JSON.stringify({ added: added });
    } catch (e) {
        return JSON.stringify({ error: "Script error: " + e.toString() });
    }
}

function secondsToTicks(seconds) {
    return String(Math.round(seconds * TICKS_PER_SECOND));
}

// Best-effort: adds one empty video track above all existing ones via the
// private QE ("Quality Engineering") DOM, since the public scripting API has
// no supported way to add tracks. This is a convenience only - the actual
// safety against overwriting footage comes from isRangeFreeOnTrack() below,
// so it's fine if this silently fails on some Premiere versions.
function tryAddTopVideoTrack() {
    try {
        app.enableQE();
        var qeSeq = qe.project.getActiveSequence();
        qeSeq.addTracks(1, qeSeq.numVideoTracks, 0, "", 0, 0, 0);
        return true;
    } catch (e) {
        return false;
    }
}

function isRangeFreeOnTrack(track, startSec, endSec) {
    for (var i = 0; i < track.clips.numItems; i++) {
        var clip = track.clips[i];
        var cStart = timeTicksToSeconds(clip.start.ticks);
        var cEnd = timeTicksToSeconds(clip.end.ticks);
        if (cStart < endSec && cEnd > startSec) {
            return false;
        }
    }
    return true;
}

function findProjectItemByPath(path) {
    function search(item) {
        if (!item.children) return null;
        for (var i = 0; i < item.children.numItems; i++) {
            var child = item.children[i];
            if (child.getMediaPath && child.getMediaPath() === path) {
                return child;
            }
            var found = search(child);
            if (found) return found;
        }
        return null;
    }
    return search(app.project.rootItem);
}

function importOrFindProjectItem(path) {
    var existing = findProjectItemByPath(path);
    if (existing) return existing;

    app.project.importFiles([path], true, app.project.rootItem, false);
    return findProjectItemByPath(path);
}

// argsJson: JSON { images: [{ path, start, end }, ...] } (start/end in seconds,
// sequence-timeline-relative). Places each image on the topmost video track,
// trimmed to run from its start to its end (normally one beat marker to the next).
function placeImagesAtBeats(argsJson) {
    try {
        var args = JSON.parse(argsJson);
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No active sequence." });

        if (!args.images || args.images.length === 0) {
            return JSON.stringify({ error: "No images to place." });
        }

        tryAddTopVideoTrack();
        seq = app.project.activeSequence;
        var targetTrack = seq.videoTracks[seq.videoTracks.numTracks - 1];

        var overallStart = args.images[0].start;
        var overallEnd = args.images[args.images.length - 1].end;
        if (!isRangeFreeOnTrack(targetTrack, overallStart, overallEnd)) {
            return JSON.stringify({
                error: "The top video track (V" + seq.videoTracks.numTracks +
                    ") already has clips in that time range. Add a new empty " +
                    "video track above everything else in Premiere, then try again."
            });
        }

        var placed = 0;
        for (var i = 0; i < args.images.length; i++) {
            var img = args.images[i];
            var projectItem = importOrFindProjectItem(img.path);
            if (!projectItem) continue;

            targetTrack.overwriteClip(projectItem, secondsToTicks(img.start));

            for (var c = 0; c < targetTrack.clips.numItems; c++) {
                var clip = targetTrack.clips[c];
                var clipStartSec = timeTicksToSeconds(clip.start.ticks);
                if (Math.abs(clipStartSec - img.start) < 0.05) {
                    try {
                        // Use the same ticks-string conversion as the start
                        // point above (rather than Time.seconds, which can
                        // round differently) so adjacent clips land on
                        // exactly the same frame with zero gap between them.
                        var endTime = new Time();
                        endTime.ticks = secondsToTicks(img.end);
                        clip.end = endTime;
                    } catch (e) {
                        // Leave the clip's default still-image duration if
                        // trimming isn't supported on this Premiere version.
                    }
                    break;
                }
            }
            placed++;
        }

        return JSON.stringify({ placed: placed, totalImages: args.images.length });
    } catch (e) {
        return JSON.stringify({ error: "Script error: " + e.toString() });
    }
}

// Removes any sequence marker whose name starts with namePrefix, so a run
// can be cleanly redone (e.g. after changing sensitivity).
function clearBeatMarkers(namePrefix) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ error: "No active sequence." });

        var toRemove = [];
        var marker = seq.markers.getFirstMarker();
        while (marker) {
            if (marker.name && marker.name.indexOf(namePrefix) === 0) {
                toRemove.push(marker);
            }
            marker = seq.markers.getNextMarker(marker);
        }
        var removed = 0;
        for (var i = 0; i < toRemove.length; i++) {
            seq.markers.deleteMarker(toRemove[i]);
            removed++;
        }
        return JSON.stringify({ removed: removed });
    } catch (e) {
        return JSON.stringify({ error: "Script error: " + e.toString() });
    }
}
