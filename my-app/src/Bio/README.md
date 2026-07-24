# Resume / CV (`/Bio`)

A static resume page. Unlike the data-visualization pages, there is **no data
pipeline and no external data source** — all content is hardcoded in the JSX.

- Page component: [`Bio.jsx`](Bio.jsx)
- Styling: [`Bio.module.css`](Bio.module.css) (scoped CSS Module)

## Notes

- Content (summary, experience, skills, education) lives directly in `Bio.jsx`;
  edit that file to update the resume.
- This page uses its own CSS Module rather than the app-wide design tokens, and
  intentionally keeps a distinct font stack from the rest of the site.
- The only shared dependency is the `HomeButton` component for navigation back to
  the landing page.

To change the resume, edit the markup in [`Bio.jsx`](Bio.jsx) and redeploy with
`npm run deploy`.
