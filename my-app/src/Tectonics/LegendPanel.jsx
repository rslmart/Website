import * as React from 'react';

const panelStyles = {
    position: 'absolute',
    top: 0,
    left: 0,
    maxWidth: '280px',
    backgroundColor: '#fff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
    padding: '6px 12px',
    margin: '20px',
    fontSize: '13px',
    lineHeight: 1.8,
    color: '#4a4a55',
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
    const {open, categories, visibility, onToggle, togglePanel} = props;

    if (!open) {
        return (
            <button onClick={togglePanel} style={{position: 'absolute', top: 20, left: 20, zIndex: 9999}}>
                Legend +
            </button>
        );
    }

    return (
        <div style={panelStyles}>
            <div style={{height: '25px'}}>
                <h3 style={{float: 'left', marginTop: 0, marginBottom: 0}}>Tectonic Plates</h3>
                <button onClick={togglePanel} style={{float: 'right'}}>-</button>
            </div>

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

            <div style={{marginTop: 8, fontSize: '11px', color: '#9a9aa5'}}>
                Data: Bird (2002) PB2002 model
            </div>
        </div>
    );
}

export default React.memo(LegendPanel);
