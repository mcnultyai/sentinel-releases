# Camera Measure

A phone-camera measuring tool that runs in the browser. It's one HTML file with no install, no build step and no dependencies.

## How it works

1. Lay a **reference object** of known size flat on the same surface as the thing you want to measure:
   a bank/ID card, an A4 or US Letter sheet, a custom rectangle, or any known length.
2. Open the camera (or pick a photo) and capture a frame with both objects in view.
3. **Calibrate:** tap the 4 corners of the reference (or both ends of a known length).
4. **Measure:** tap two points to add a line. You can add as many lines as you want; every point can be dragged,
   and a magnifier appears under your finger for precise placement.

With a rectangular reference the app computes a **perspective (homography) correction**, so
measurements stay accurate even when the photo isn't taken straight-on. They're only valid
for things lying on the same flat surface as the reference.

Units: mm, cm, m, inches.

## Running it

Live camera access (`getUserMedia`) requires HTTPS, so host `index.html` anywhere with HTTPS
(GitHub Pages, Netlify, Vercel, …) and open it on your phone. The **Photo…** button works
everywhere, including from a local file, and uses the phone's camera app.

## Tips for accuracy

- Hold the phone as parallel to the surface as you can, and fill the frame.
- Use a larger reference (A4 paper) for larger objects.
- Use the magnifier to place points exactly on corners and edges.
