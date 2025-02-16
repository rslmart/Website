'use client';

import dynamic from 'next/dynamic';

const HurricaneClient = dynamic(
    () => import('./HurricaneClient'),
    {
        ssr: false,
        loading: () => <div className="loading">Loading visualization...</div>
    }
);

export default function HurricaneWrapper() {
    return <HurricaneClient />;
}