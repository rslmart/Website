# Resume / CV (`/Bio`)

A static resume page. Unlike the data-visualization pages, there is **no data
pipeline and no external data source** — all content is hardcoded in the JSX.

- Page component: [`Bio.jsx`](Bio.jsx)
- Styling: [`Bio.module.css`](Bio.module.css) (scoped CSS Module)

## Notes

- Content (summary, experience, skills, education) lives directly in `Bio.jsx`;
  edit that file to update the resume.
- Styles use the `global.css` design tokens and the site font, so the page
  follows the light/dark theme like the rest of the site (moved in
  `website-prop-bio-readability-a11y`). Links use `--color-primary` and are
  underlined; the cover letter is capped at ~75 characters per line; job headers
  stack into two lines below 768px.
- Shared dependencies: the `HomeButton` component and the theme menu (from the
  root layout). The page's top padding keeps both buttons clear of the header.

To change the resume, edit the markup in [`Bio.jsx`](Bio.jsx) and redeploy with
`npm run deploy`.
