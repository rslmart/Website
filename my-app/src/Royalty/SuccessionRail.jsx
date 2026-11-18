import React from 'react';
import PropTypes from 'prop-types';
import { dynastyColor, formatReignYear } from './reignBars';
import './RoyalTreeStyle.css';

function barLabel(bar) {
  if (bar.missing) return `${bar.label}, no dated reign`;
  const start = formatReignYear(bar.start);
  if (bar.openEnded) return `${bar.label}, ${start}– , open-ended`;
  return `${bar.label}, ${start}–${formatReignYear(bar.end)}`;
}

function barLayout(bar, domain) {
  const span = domain.end - domain.start;
  const year = bar.missing ? bar.markerYear : bar.start;
  if (year == null || !(span > 0)) return null;
  const end = bar.missing ? year : (bar.openEnded || bar.end == null ? domain.end : bar.end);
  const left = ((year - domain.start) / span) * 100;
  const width = ((end - year) / span) * 100;
  return { left, width };
}

function SuccessionRail({
  lanes,
  domain,
  collapsed,
  highlightId = null,
  onToggle,
  onSelect,
}) {
  const count = lanes.length;
  return (
    <section
      className={`succession-rail${collapsed ? ' is-collapsed' : ''}`}
      aria-label="Reigns"
      data-domain-start={domain.start}
      data-domain-end={domain.end}
    >
      <div className="succession-rail-header">
        <button
          type="button"
          className="succession-rail-toggle"
          aria-expanded={!collapsed}
          aria-controls="succession-rail-lanes"
          onClick={onToggle}
        >
          {collapsed ? 'Show reigns' : 'Hide reigns'}
        </button>
        <span className="succession-rail-title">
          {count === 1 ? '1 monarchy' : `${count} monarchies`}
        </span>
      </div>
      <div id="succession-rail-lanes" hidden={collapsed}>
        <div className="succession-rail-axis" aria-hidden="true">
          <span />
          <span className="succession-rail-axis-track">
            <span>{formatReignYear(domain.start)}</span>
            <span>{formatReignYear(Math.round((domain.start + domain.end) / 2))}</span>
            <span>{formatReignYear(domain.end)}</span>
          </span>
        </div>
        {lanes.map((lane) => (
          <div className="succession-rail-lane" key={lane.monarchy} data-lane={lane.monarchy}>
            <span className="succession-rail-name" title={lane.monarchy.replace(/_/g, ' ')}>
              <span className="succession-rail-swatch" style={{ background: lane.color }} />
              {lane.monarchy.replace(/_/g, ' ')}
            </span>
            <div
              className="succession-rail-track"
              data-lane-track={lane.monarchy}
              style={{ height: lane.rowCount * 16 + 4 }}
            >
              {lane.bars.map((bar, index) => {
                const layout = barLayout(bar, domain);
                if (!layout) return null;
                const active = bar.id === highlightId;
                return (
                  <button
                    key={`${bar.id}-${bar.start ?? 'gap'}-${index}`}
                    type="button"
                    className={[
                      'succession-rail-bar',
                      bar.missing ? 'is-gap' : '',
                      bar.openEnded ? 'is-open' : '',
                      active ? 'is-active' : '',
                    ].filter(Boolean).join(' ')}
                    style={{
                      left: `${layout.left}%`,
                      width: bar.missing ? '8px' : `${layout.width}%`,
                      top: 2 + bar.row * 16,
                      backgroundColor: bar.missing ? 'transparent' : dynastyColor(bar.family, lane.color),
                      borderColor: bar.missing ? dynastyColor(bar.family, '#1c1c1c') : undefined,
                    }}
                    title={barLabel(bar)}
                    aria-label={barLabel(bar)}
                    aria-current={active ? 'true' : undefined}
                    data-person={bar.id}
                    data-order={bar.order}
                    data-start={bar.start ?? ''}
                    data-end={bar.end ?? ''}
                    data-open={bar.openEnded ? 'true' : 'false'}
                    data-missing={bar.missing ? 'true' : 'false'}
                    onClick={() => onSelect(bar.id)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

SuccessionRail.propTypes = {
  lanes: PropTypes.arrayOf(PropTypes.shape({
    monarchy: PropTypes.string.isRequired,
    color: PropTypes.string.isRequired,
    rowCount: PropTypes.number.isRequired,
    bars: PropTypes.array.isRequired,
  })).isRequired,
  domain: PropTypes.shape({
    start: PropTypes.number.isRequired,
    end: PropTypes.number.isRequired,
  }).isRequired,
  collapsed: PropTypes.bool.isRequired,
  highlightId: PropTypes.string,
  onToggle: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
};

export default React.memo(SuccessionRail);
