import * as React from 'react';
import { Link } from 'react-router-dom';

/* Persistent link back to the landing page, fixed to the top-left corner of
   every sub-page. Sub-pages that own the top-left area offset their own
   controls to sit clear of this button. */
function HomeButton() {
    return (
        <Link to="/" className="fab home-fab" aria-label="Back to home" title="Home">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                    d="M3 11.5 12 4l9 7.5M5.5 10v9.5h4v-6h5v6h4V10"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        </Link>
    );
}

export default HomeButton;
