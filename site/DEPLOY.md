# Deploying the DriftGuard landing page

This folder is a static site. Nothing to build.

## Vercel (CLI)

    npm i -g vercel
    cd site
    vercel            # preview
    vercel --prod     # production

You'll get a `*.vercel.app` URL. No framework preset needed — pick "Other".

## Vercel (dashboard)

Drag this `site/` folder onto vercel.com/new.

## Contents

- `index.html`  — the page
- `DriftGuard-MVP-test-build.zip` — the extension build the download button serves
- `icons/`      — favicon + og image source
- `vercel.json` — forces the zip to download rather than open in-browser

## After each extension rebuild

The download button serves the sibling zip, so refresh it:

    cp ../DriftGuard-MVP-test-build.zip .
    vercel --prod

(The claude.ai artifact version embeds the zip inside the page instead, so that
one needs a republish to pick up a new build.)
