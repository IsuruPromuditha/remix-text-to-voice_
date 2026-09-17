# Reverie — Voice-First Moodboard & Text-to-Voice Event Studio

> Speak your aesthetic to generate dynamic, responsive visual moodboards and synthesize expressive text-to-voice announcements using Gemini.

### Highlights
- 🎙️ **Voice-to-Visual Pinboard**: Speak your aesthetic vision, refine generated concepts conversationally, and say *"next"* to pin prints to an organic pinboard.
- 🔊 **Text-to-Voice Audio Engine**: Synthesize event announcements (such as *Traffic Episode 02 at Park Street Warehouse*) with customizable voice characters (Fenrir, Kore, Puck, Aoede) and energetic DJ/radio delivery styles.
- 📊 **Real-Time Visualizer & Audio Downloader**: Interactive waveform frequencies, live scrubber, and one-click WAV file export.
- 🖼️ **Tactile Physical Canvas**: Drag, inspect, enlarge, zoom, and export moodboard collections directly to a `.zip` archive.
- ⚡ **Full-Stack Architecture**: Real-time WebSocket audio streaming, Express backend with secure Gemini server-side proxying, and responsive React + Tailwind frontend.

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/e4f1934b-da09-4a22-9e48-0bb86a96ea15

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
