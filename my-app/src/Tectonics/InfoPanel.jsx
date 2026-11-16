import * as React from 'react';

const panelStyles = {
    position: 'absolute',
    bottom: 0,
    left: 0,
    minWidth: '200px',
    backgroundColor: 'var(--color-surface)',
    boxShadow: 'var(--shadow-panel)',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    margin: '20px',
    fontSize: '13px',
    lineHeight: 1.7,
    color: 'var(--color-text-muted)',
    zIndex: 9999,
};

function InfoPanel({plate, onClose, embedded}) {
    if (embedded) {
        return (
            <div style={{color: 'var(--color-text-muted)', fontSize: '13px', lineHeight: 1.7}}>
                <h3 style={{marginTop: 0, marginBottom: 8, color: 'var(--color-text)'}}>{plate.PlateName}</h3>
                <div>Plate code: <b>{plate.Code}</b></div>
            </div>
        );
    }

    return (
        <div style={panelStyles}>
            <div style={{height: '22px'}}>
                <h3 style={{float: 'left', marginTop: 0, marginBottom: 0, color: 'var(--color-text)'}}>{plate.PlateName}</h3>
                <button onClick={onClose} style={{float: 'right'}}>x</button>
            </div>
            <div style={{marginTop: 8}}>
                <div>Plate code: <b>{plate.Code}</b></div>
            </div>
        </div>
    );
}

export default React.memo(InfoPanel);
