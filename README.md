# duncanheidkamp.com

Static homepage replacing the previous WordPress site.

## Stack

- Plain HTML + CSS — no build step, no framework
- [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) via Google Fonts
- Deployed on Vercel (custom domain: duncanheidkamp.com)

## Files

| File | Purpose |
|---|---|
| `index.html` | Full page markup |
| `style.css` | All styles — mobile-first |
| `CNAME` | Custom domain for GitHub Pages (if used) |
| `vercel.json` | Vercel config — enables clean URLs |

## Deployment

Push to `main` → Vercel auto-deploys.

To deploy manually:
```bash
vercel --prod
```

## Local development

Open `index.html` directly in a browser — no server needed.
