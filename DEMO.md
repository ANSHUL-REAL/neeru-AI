# Neeru demo script (60 seconds)

Say this over the live site at http://127.0.0.1:5173/

**0:00 sky and houses**  
"This is Neeru. It tells you where floodwater is coming from, and how to leave before it gets there."

**0:08 tap Use my location**  
"It starts on you. Not a dashboard. Your street."

**0:18 leave Demo flood on**  
"Red is flooded. White is still clear. That is the model, not a news graphic."

**0:28 tap Demo: go to [clear point] or type a hospital**  
"I want to go here. It measures the drive, skips the wet underpass, and writes one warning: go from here, not there."

**0:48 point at the warning**  
"That line is the product. Prepare, then move."

---

## Photo prompt (16:9 still)

Wide cinematic still of a dense modern city at late afternoon, tall apartment towers packed on the right side of the frame, pale blue-white sky, teal floodwater filling the street in the foreground, a city bus half-submerged on the left, a small wooden boat drifting on the water, two tiny drones in the distant sky, quiet disaster-preparedness film look, photoreal illustration, no text, no logos, no UI.

Night edit of the same still: same buildings, bus, boat, and camera. Darker sky, windows lit warm, floodwater a little higher. No text.

## Video prompt (animate the still, 6 seconds)

Floodwater slowly rises in the street. The wooden boat drifts left. The bus stays put. Gentle camera push-in. Drones drift in the sky.

## How to make the photos

1. Generate a 16:9 still of the city (prompt below).
2. Keep that still as the master. Every other photo is an edit of it, not a new generation.
3. Day still = master. Night still = same frame, darker sky, windows lit, water higher.
4. Do not put UI text or logos in the generated photo. Overlay those in the site or in an editor.

## How to make the video

Video is image-first. There is no text-to-video.

1. Generate the master still (16:9).
2. Animate that still for 6 seconds: water rises, boat drifts, camera slowly pushes in. One motion only.
3. Optional second shot: night version of the same still, same camera, water a little higher.
4. Concatenate with ffmpeg if you have two clips:

```bash
ffmpeg -f concat -safe 0 -i shots.txt -c copy neeru-demo.mp4
```

`shots.txt`:

```
file 'day.mp4'
file 'night.mp4'
```
