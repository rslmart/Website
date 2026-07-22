import * as React from 'react';

const panelStyles = {
    position: 'absolute',
    bottom: 0,
    left: 0,
    minWidth: '200px',
    backgroundColor: '#fff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
    padding: '10px 14px',
    margin: '20px',
    fontSize: '13px',
    lineHeight: 1.7,
    color: '#4a4a55',
    zIndex: 9999,
};

function InfoPanel({plate, onClose}) {
    return (
        <div style={panelStyles}>
            <div style={{height: '22px'}}>
                <h3 style={{float: 'left', marginTop: 0, marginBottom: 0}}>{plate.PlateName}</h3>
                <button onClick={onClose} style={{float: 'right'}}>x</button>
            </div>
            <div style={{marginTop: 8}}>
                <div>Plate code: <b>{plate.Code}</b></div>
            </div>
        </div>
    );
}

export default React.memo(InfoPanel);
