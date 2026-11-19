import * as React from 'react';

const panelStyles = {
    position: 'absolute',
    top: 0,
    left: 0,
    maxWidth: '280px',
    maxHeight: 'calc(100vh - 92px)',
    overflowY: 'auto',
    backgroundColor: 'var(--color-surface)',
    boxShadow: 'var(--shadow-panel)',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    margin: '72px 20px 20px',
    fontSize: '13px',
    lineHeight: 1.8,
    color: 'var(--color-text-muted)',
    outline: 'none',
    zIndex: 9999,
};

const SWATCH_HEIGHT = 4;

// One cycle of the same [on, off, ...] pixel run the map draws as segments.
function DashSwatch({color, dash}) {
    const rgb = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    if (!dash) {
        return (
            <span
                data-dash="solid"
                style={{
                    display: 'inline-block',
                    width: 18,
                    height: SWATCH_HEIGHT,
                    marginRight: 8,
                    verticalAlign: 'middle',
                    backgroundColor: rgb,
                }}
            />
        );
    }
    const cycle = dash.reduce((sum, run) => sum + run, 0);
    const target = cycle * Math.max(1, Math.ceil(18 / cycle));
    const pieces = [];
    let used = 0;
    let index = 0;
    while (used < target - 0.01 && index < 24) {
        const run = dash[index % dash.length];
        const draw = index % 2 === 0;
        pieces.push(
            <span
                key={index}
                style={{
                    display: 'inline-block',
                    width: run,
                    height: SWATCH_HEIGHT,
                    backgroundColor: draw ? rgb : 'transparent',
                }}
            />
        );
        used += run;
        index += 1;
    }
    return (
        <span
            data-dash={dash.join(',')}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                marginRight: 8,
                verticalAlign: 'middle',
            }}
        >
            {pieces}
        </span>
    );
}

const areaSwatch = (rgba) => ({
    display: 'inline-block',
    width: '18px',
    height: '12px',
    marginRight: '8px',
    verticalAlign: 'middle',
    backgroundColor: rgba,
    border: '1px solid var(--color-border-strong)',
});

const CREDIT_LINKS = {
    bird: 'https://doi.org/10.1029/2001GC000252',
    gis: 'https://github.com/fraxen/tectonicplates',
    licence: 'https://opendatacommons.org/licenses/by/1-0/',
};

const creditLink = {color: 'inherit', textDecoration: 'underline'};

const row = {display: 'flex', alignItems: 'center', margin: '2px 0'};
const labelStyle = {display: 'flex', alignItems: 'center', cursor: 'pointer', flex: 1};

function Checkbox({name, checked, onToggle, children}) {
    return (
        <div style={row}>
            <label style={labelStyle}>
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(name)}
                    style={{marginRight: 8}}
                />
                {children}
            </label>
        </div>
    );
}

function LegendPanel(props) {
    const {open, categories, velocityScale, visibility, onToggle, togglePanel, embedded} = props;
    const scaleLabel = velocityScale
        ? `${velocityScale.minMmYr}–${velocityScale.maxMmYr} mm/yr`
        : null;

    const body = (
        <React.Fragment>
            <div style={{marginTop: 6}}>
                <div style={{fontWeight: 600, marginTop: 6}}>Boundaries</div>
                {Object.entries(categories).map(([key, {label, color, dash}]) => (
                    <Checkbox key={key} name={key} checked={visibility[key]} onToggle={onToggle}>
                        <DashSwatch color={color} dash={dash} />
                        {label}
                    </Checkbox>
                ))}

                <div style={{fontWeight: 600, marginTop: 8}}>Overlays</div>
                <Checkbox name="orogens" checked={visibility.orogens} onToggle={onToggle}>
                    <span style={areaSwatch('rgba(150,140,120,0.5)')} />
                    Orogeny
                </Checkbox>
                <Checkbox name="plates" checked={visibility.plates} onToggle={onToggle}>
                    <span style={areaSwatch('rgba(120,120,140,0.35)')} />
                    Plates (click to identify)
                </Checkbox>
                <Checkbox name="velocity" checked={visibility.velocity} onToggle={onToggle}>
                    {/* Same ink as the arrows. The two strokes are the 16 px floor and the 48 px cap. */}
                    {velocityScale && (
                        <span style={{display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 8}}>
                            <span
                                data-velocity-px={velocityScale.minPx}
                                style={{width: velocityScale.minPx, height: 2, backgroundColor: 'var(--map-ink)'}}
                            />
                            <span
                                data-velocity-px={velocityScale.maxPx}
                                style={{width: velocityScale.maxPx, height: 2, backgroundColor: 'var(--map-ink)'}}
                            />
                        </span>
                    )}
                    Velocity vectors{scaleLabel ? `, ${scaleLabel}` : ''}
                </Checkbox>
            </div>

            {/* ODC-By 1.0 §4.3 notice, and the credit fraxen/tectonicplates asks for. */}
            <div style={{marginTop: 8, fontSize: '11px', lineHeight: 1.5, color: 'var(--color-text-faint)'}}>
                Data: PB2002 model,{' '}
                <a href={CREDIT_LINKS.bird} style={creditLink} target="_blank" rel="noopener noreferrer">
                    Peter Bird (2003)
                </a>
                ; GIS data{' '}
                <a href={CREDIT_LINKS.gis} style={creditLink} target="_blank" rel="noopener noreferrer">
                    Hugo Ahlenius, Nordpil
                </a>
                ,{' '}
                <a href={CREDIT_LINKS.licence} style={creditLink} target="_blank" rel="noopener noreferrer">
                    ODC-By 1.0
                </a>
            </div>
        </React.Fragment>
    );

    if (embedded) {
        return body;
    }

    if (!open) {
        return (
            <button
                onClick={togglePanel}
                style={{
                    position: 'absolute',
                    top: 72,
                    left: 20,
                    zIndex: 9999,
                    border: 'none',
                    backgroundColor: 'var(--color-surface)',
                    boxShadow: 'var(--shadow-panel)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 12px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-text)',
                    cursor: 'pointer',
                }}
            >
                Legend +
            </button>
        );
    }

    return (
        <div style={panelStyles}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <h3 style={{margin: 0, fontSize: 16, color: 'var(--color-text)'}}>Tectonic Plates</h3>
                <button
                    onClick={togglePanel}
                    aria-label="Collapse panel"
                    style={{border: 'none', background: 'none', fontSize: 20, lineHeight: 1, cursor: 'pointer', color: 'var(--color-text-muted)'}}
                >
                    −
                </button>
            </div>
            {body}
        </div>
    );
}

export default React.memo(LegendPanel);
