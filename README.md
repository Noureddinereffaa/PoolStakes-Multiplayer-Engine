<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/b3c0c477-f683-48b0-8335-9460deb3b1aa

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

If port `3000` is already in use, start on a different port:
- macOS/Linux: `PORT=3001 VITE_HMR_PORT=24679 npm run dev`
- Windows (Command Prompt): `npx cross-env PORT=3001 VITE_HMR_PORT=24679 npm run dev`
