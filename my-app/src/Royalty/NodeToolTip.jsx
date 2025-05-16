// NodeToolTip.js
import React from 'react';
import './RoyalTreeStyle.css'

const INCLUDED_KEYS = new Set([
    'label',
    'cause of death',
    'country of citizenship',
    'date of birth',
    'date of death',
    'description',
    'family',
    'noble title',
    'place of birth',
    'place of death',
    'place of burial',
    'position held',
    'religion or worldview',

]);

const formatKey = (key) => {
    return key
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase());
};

function formatDateToYMD(dateStr) {
    if (!dateStr) return '?';

    // Extract date part and parse with regex
    const [fullDate] = dateStr.split('T');
    const match = fullDate.match(/^(-?\+?\d+)-(\d{2})-(\d{2})$/);

    if (!match) return 'Invalid Date';

    let [, yearStr, monthStr, dayStr] = match;
    let isBCE = false;

    // Clean year string
    if (yearStr.startsWith('-')) {
        isBCE = true;
        yearStr = yearStr.slice(1); // Remove negative sign
    } else if (yearStr.startsWith('+')) {
        yearStr = yearStr.slice(1); // Remove positive sign
    }

    // Convert to numbers and format
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    // Handle year 0 edge case (1 BCE)
    const displayYear = year === 0 ? 1 : year;

    if (month === 0 && day === 0) {
        return `${isBCE ? 'BCE ' : ''}${displayYear}`;
    }

    return `${isBCE ? 'BCE ' : ''}${displayYear}/${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}`;
}

const formatValue = (key, value) => {
    // Handle position held objects
    if (key === 'position held' || key === 'noble title') {
        const formatPosition = (position) => {
            const title = position.of || position.label || '';
            const start = position["start time"] ? formatDateToYMD(position["start time"]) : '';
            const end = position["end time"] ? formatDateToYMD(position["end time"]) : '';
            const cause = position["end cause"] ? `, ${position["end cause"]}` : '';

            const dates = [start, end].filter(d => d).join(' - ');
            return `${title}${dates ? ` (${dates}${cause})` : ''}`;
        };

        if (Array.isArray(value)) {
            return value.map(formatPosition).join('; ');
        }
        if (typeof value === 'object' && value !== null) {
            return formatPosition(value);
        }
    }

    if (key === 'date of birth' || key === 'date of death') {
        return formatDateToYMD(value);
    }

    // Handle arrays of simple values
    if (Array.isArray(value)) {
        return value.join(', ');
    }

    // Handle other object types
    if (typeof value === 'object' && value !== null) {
        return Object.entries(value)
            .map(([k, v]) => `${formatKey(k)}: ${v}`)
            .join(', ');
    }

    return value || 'N/A';
};

const NodeToolTip = ({ x, y, data }) => {
    if (!data) return null;

    return (
        <div>
            <div style={{
                fontWeight: 'bold',
                marginBottom: '8px',
                color: '#2c3e50'
            }}>
                {data.label}
            </div>

            {Object.entries(data)
                .filter(([key]) => INCLUDED_KEYS.has(key))
                .map(([key, value]) => (
                    <div key={key} style={{
                        margin: '4px 0',
                        lineHeight: '1.4'
                    }}>
                        <span style={{ fontWeight: '500', color: '#7f8c8d' }}>
                          {formatKey(key)}:
                        </span>
                        <span style={{ marginLeft: '8px', color: '#2c3e50' }}>
                          {formatValue(key, value)}
                        </span>
                    </div>
                ))}
        </div>
    );
};

export default NodeToolTip;