<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy Family Quiz Preview

This contains everything you need to run your app locally.

The included GitHub Actions workflow deploys the app to GitHub Pages whenever `main` is updated.

## Run Locally

**Prerequisites:** Bun


1. Install dependencies:
   `bun install`
2. Run the app:
   `bun run dev`

The Gemini API key is entered in the app and stored in browser `localStorage`. Do not commit a real `.env` file or put a production Gemini key in a `VITE_*` variable: any key bundled into this static site is visible to visitors.

## GitHub Pages Preview

Enable **Settings > Pages > Source: GitHub Actions**. The workflow builds with relative asset paths, so it supports both a repository project URL and a custom domain.

To check the Preview build locally:

`bun run lint && bun run build`
