# Singing Quakers Alumni Choir

Website: https://sqachoir.com

## Local development

Requires Node.js 22 or newer.

```sh
npm run check
python3 -m http.server 8080 --directory dist
```

Open http://localhost:8080.

## Publishing

Push changes to `main`. GitHub Actions builds, checks, and deploys the site to GitHub Pages.
