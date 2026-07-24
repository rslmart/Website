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

const swatch = (color) => ({
    display: 'inline-block',
    width: '18px',
    height: '4px',
    marginRight: '8px',
    verticalAlign: 'middle',
    backgroundColor: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
});

const areaSwatch = (rgba) => ({
    display: 'inline-block',
    width: '18px',
    height: '12px',
    marginRight: '8px',
    verticalAlign: 'middle',
    backgroundColor: rgba,
    border: '1px solid #b9b0a2',
});

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
    const {open, categories, visibility, onToggle, togglePanel, embedded} = props;

    const body = (
        <React.Fragment>
            <div style={{marginTop: 6}}>
                <div style={{fontWeight: 600, marginTop: 6}}>Boundaries</div>
                {Object.entries(categories).map(([key, {label, color}]) => (
                    <Checkbox key={key} name={key} checked={visibility[key]} onToggle={onToggle}>
                        <span style={swatch(color)} />
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
                    <span style={{...swatch([40, 40, 40]), height: '2px'}} />
                    Velocity vectors
                </Checkbox>
            </div>

            <div style={{marginTop: 8, fontSize: '11px', color: 'var(--color-text-faint)'}}>
                Data: Bird (2002) PB2002 model
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
