// NodeToolTip.js
import React from 'react';
import './RoyalTreeStyle.css'
import { formatDate } from './formatDate';

// Reading order. The name is the heading, so `label` is not a row.
const FIELD_ORDER = [
    'description',
    'date of birth',
    'date of death',
    'place of birth',
    'place of death',
    'place of burial',
    'family',
    'noble title',
    'position held',
    'country of citizenship',
    'religion or worldview',
    'cause of death',
];

const formatKey = (key) => {
    return key
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase());
};

const formatPosition = (position) => {
    if (!position || typeof position !== 'object') return '';
    const title = position.of || position.label || '';
    const start = position["start time"] ? formatDate(position["start time"]) : '';
    const end = position["end time"] ? formatDate(position["end time"]) : '';
    const cause = position["end cause"] ? `, ${position["end cause"]}` : '';
    const dates = [start, end].filter(d => d && d !== '?').join(' - ');
    if (!title && !dates) return '';
    return `${title}${dates ? ` (${dates}${cause})` : ''}`;
};

const uniqueParts = (parts) => {
    const seen = new Set();
    const out = [];
    parts.forEach((part) => {
        const text = String(part ?? '').trim();
        if (!text || text === '?' || seen.has(text)) return;
        seen.add(text);
        out.push(text);
    });
    return out.join(', ');
};

const formatValue = (key, value) => {
    if (key === 'position held' || key === 'noble title') {
        if (Array.isArray(value)) {
            const seen = new Set();
            const parts = [];
            value.forEach((position) => {
                const text = formatPosition(position);
                if (!text || seen.has(text)) return;
                seen.add(text);
                parts.push(text);
            });
            return parts.join('; ');
        }
        if (typeof value === 'object' && value !== null) {
            return formatPosition(value);
        }
    }

    if (key === 'date of birth' || key === 'date of death') {
        return formatDate(value);
    }

    if (Array.isArray(value)) {
        return uniqueParts(value.map((item) => (
            item && typeof item === 'object' ? formatValue(key, item) : item
        )));
    }

    if (typeof value === 'object' && value !== null) {
        return Object.entries(value)
            .map(([k, v]) => `${formatKey(k)}: ${v}`)
            .filter((part) => part && !part.endsWith(': '))
            .join(', ');
    }

    return value == null ? '' : String(value);
};

const isBlank = (value) => {
    if (value == null || value === '') return true;
    if (Array.isArray(value)) return value.length === 0 || value.every(isBlank);
    return false;
};

export function tooltipRows(data) {
    if (!data) return [];
    const title = String(data.label || '').split('\n')[0].trim().toLowerCase();
    const rows = [];
    const seen = new Set();
    FIELD_ORDER.forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(data, key)) return;
        const raw = data[key];
        if (isBlank(raw)) return;
        const text = String(formatValue(key, raw) ?? '').trim();
        if (!text || text === '?' || text === 'N/A') return;
        if (title && text.toLowerCase() === title) return;
        const signature = `${formatKey(key)}: ${text}`;
        if (seen.has(signature)) return;
        seen.add(signature);
        rows.push({ key, label: formatKey(key), value: text });
    });
    return rows;
}

const NodeToolTip = ({ data, onFocus }) => {
    if (!data) return null;

    const title = String(data.label || '').split('\n')[0];
    const showFocus = typeof onFocus === 'function' && data.id && data.type !== 'marriage';
    const rows = tooltipRows(data);

    return (
        <div>
            {showFocus && (
                <button
                    type="button"
                    className="royal-tree-focus-enter"
                    onClick={() => onFocus(data.id)}
                    aria-label={`Focus on ${title}`}
                >
                    Focus
                </button>
            )}
            <div style={{
                fontWeight: 'bold',
                marginBottom: '8px',
                color: 'var(--color-text)'
            }}>
                {title}
            </div>

            {rows.map((row) => (
                <div key={row.key} style={{
                    margin: '4px 0',
                    lineHeight: '1.4'
                }}>
                    <span style={{ fontWeight: '500', color: 'var(--color-text-muted)' }}>
                      {row.label}:
                    </span>
                    <span style={{ marginLeft: '8px', color: 'var(--color-text)' }}>
                      {row.value}
                    </span>
                </div>
            ))}
        </div>
    );
};

export default NodeToolTip;
