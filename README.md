# Beat Marker for Premiere Pro

A Premiere Pro panel that analyzes the audio of a selected timeline clip and
drops color-coded markers on the detected beats.

## How it works

- You select an audio (or video-with-audio) clip on your sequence and click
  **Scan Selected Clip**. The panel asks Premiere (via ExtendScript) for that
  clip's source media file path and its position/trim on the timeline.
- **Detect Beats & Add Markers** reads the audio file directly off disk,
  decodes it with the Web Audio API, and runs an energy-spike beat detector
  (bass-emphasized short-window energy compared against its own recent local
  average — the same family of technique used by most "auto beat marker"
  tools). Detected beat times are mapped from source-audio time onto
  sequence-timeline time and sent back to Premiere to create real sequence
  markers.
- **Clear Previous Beat Markers** removes markers whose name starts with the
  current name prefix, so you can retry with different sensitivity.

## Known limitations

- Assumes the clip is not time-remapped/sped-up in a way that changes its
  source-to-timeline mapping (ordinary trims/moves are fine).
- Works best on clean audio files (wav/mp3/m4a/aac). Video containers may or
  may not decode depending on codec.
- This is an onset/energy detector, not an ML downbeat/section classifier —
  it won't label choruses or drops, just rhythmic hits.

## Install (Windows)

1. Copy the whole `PremiereBeatMarker` folder to:
   `%APPDATA%\Adobe\CEP\extensions\PremiereBeatMarker`
   (create the `extensions` folder if it doesn't exist yet).

2. **You'll need to enable Premiere's debug mode yourself** so it will load
   an unsigned/dev extension like this one — this is a registry change, and
   per how I'm configured, I don't make registry/system-setting edits
   myself, so please run this in your own PowerShell:

   ```powershell
   New-Item -Path "HKCU:\Software\Adobe\CSXS.9"  -Force | Out-Null
   New-Item -Path "HKCU:\Software\Adobe\CSXS.10" -Force | Out-Null
   New-Item -Path "HKCU:\Software\Adobe\CSXS.11" -Force | Out-Null
   Set-ItemProperty -Path "HKCU:\Software\Adobe\CSXS.9"  -Name PlayerDebugMode -Value 1
   Set-ItemProperty -Path "HKCU:\Software\Adobe\CSXS.10" -Name PlayerDebugMode -Value 1
   Set-ItemProperty -Path "HKCU:\Software\Adobe\CSXS.11" -Name PlayerDebugMode -Value 1
   ```

   This only affects your own user account and only allows Premiere to load
   unsigned extensions from your local extensions folder — it's the standard
   step every Premiere extension developer does. You can reverse it later by
   setting the values back to `0` or deleting them.

3. Restart Premiere Pro (fully quit, not just close the project).

4. Open **Window > Extensions > Beat Marker**.

## Use

1. Select the audio (or video) clip on your timeline whose beats you want
   marked.
2. Click **Scan Selected Clip** — confirm it shows the right clip name.
3. Adjust sensitivity / min-max BPM / marker color if you like.
4. Click **Detect Beats & Add Markers**.
5. Check the Log panel for how many beats were found and the estimated BPM.

If it over- or under-detects, raise/lower the **Sensitivity** slider and
click **Clear Previous Beat Markers** before re-running.

## Troubleshooting

- If the panel doesn't appear in the Extensions menu, double check the
  install path and that Premiere was fully restarted after the registry
  change.
- Right-click inside the panel and choose "Inspect Element" (available once
  debug mode is on) to see console errors, or check `http://localhost:8088`
  while Premiere is running for a remote Chrome DevTools view.
