import React from 'react';

const trackMapStyle = {
    flex: 3,
    backgroundColor: 'var(--bg-panel)',
    borderRadius: '8px',
    padding: '20px',
    position: 'relative',
    border: '1px solid var(--border-color)',
};

const trackLineStyle = {
    position: 'absolute',
    left: '20px',
    right: '20px',
    height: '4px',
    backgroundColor: '#4a5b7a',
};

const trainStyle = {
    position: 'absolute',
    top: '-8px',
    width: '30px',
    height: '20px',
    backgroundColor: 'var(--accent-blue)',
    borderRadius: '4px',
    textAlign: 'center',
    fontSize: '10px',
    lineHeight: '20px',
    color: '#fff',
    fontWeight: 'bold',
    transition: 'left 0.5s linear',
};

function TrackMap({ trains }) {
    return (
        <div style={trackMapStyle}>
            <h3>Section Track Overview</h3>
            {/* Main Line UP */}
            <div style={{...trackLineStyle, top: '100px'}}>
                {trains.filter(t => t.id.includes('Exp')).map(train => (
                    <div key={train.id} style={{...trainStyle, left: `${train.position}%`}}>
                        {train.id.split(' ')[0]}
                    </div>
                ))}
            </div>
             {/* Main Line DOWN */}
            <div style={{...trackLineStyle, top: '200px'}}>
                {trains.filter(t => t.id.includes('Fght')).map(train => (
                    <div key={train.id} style={{...trainStyle, backgroundColor: 'var(--accent-yellow)', left: `${train.position}%`}}>
                        {train.id.split(' ')[0]}
                    </div>
                ))}
            </div>
             {/* Siding Line */}
            <div style={{...trackLineStyle, top: '300px'}}>
                {trains.filter(t => t.id.includes('Lcl')).map(train => (
                    <div key={train.id} style={{...trainStyle, backgroundColor: 'var(--accent-green)', left: `${train.position}%`}}>
                        {train.id.split(' ')[0]}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default TrackMap;