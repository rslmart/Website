import * as React from 'react';

// Viewport detection for the mobile-only experience. `isMobile` gates the
// mobile UI branches on the data-viz pages; `isShort` lets those branches adapt
// to landscape phones (little vertical room). Desktop (>=769px wide) always
// reports isMobile=false, so its layout is untouched.
// Portrait phones (narrow) OR landscape phones (short and not-too-wide). The
// second clause catches landscape orientation, where width exceeds 768px but
// the screen is only ~400px tall. Kept in sync with the mobile CSS media
// queries in global.css.
const MOBILE_QUERY = '(max-width: 768px), (max-width: 900px) and (max-height: 480px)';
const SHORT_QUERY = '(max-height: 480px)';

const readState = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return { isMobile: false, isShort: false };
    }
    return {
        isMobile: window.matchMedia(MOBILE_QUERY).matches,
        isShort: window.matchMedia(SHORT_QUERY).matches,
    };
};

// Subscribe to a MediaQueryList across old/new Safari APIs.
const subscribe = (mql, handler) => {
    if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', handler);
        return () => mql.removeEventListener('change', handler);
    }
    // Safari < 14 fallback.
    mql.addListener(handler);
    return () => mql.removeListener(handler);
};

export function useViewport() {
    const [state, setState] = React.useState(readState);

    React.useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return undefined;
        }
        const update = () => setState(readState());
        const unsubMobile = subscribe(window.matchMedia(MOBILE_QUERY), update);
        const unsubShort = subscribe(window.matchMedia(SHORT_QUERY), update);
        // Re-read once in case the media state changed between initial render and
        // effect (e.g. an orientation change during hydration).
        update();
        return () => {
            unsubMobile();
            unsubShort();
        };
    }, []);

    return state;
}

// HOC so the class-based viz pages (Hurricane, RoyalTree, Snow) can receive the
// same viewport info as a `viewport` prop without converting to hooks.
export function withViewport(Wrapped) {
    function WithViewport(props) {
        const viewport = useViewport();
        // Use createElement (not JSX) so this file can keep its .js extension.
        return React.createElement(Wrapped, { ...props, viewport });
    }
    WithViewport.displayName = `withViewport(${Wrapped.displayName || Wrapped.name || 'Component'})`;
    return WithViewport;
}

export default useViewport;
