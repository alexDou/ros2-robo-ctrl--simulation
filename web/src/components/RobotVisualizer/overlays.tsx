export interface VisualizerErrorInfo {
  title: string;
  message: string;
  hint?: string;
}

export function VisualizerErrorOverlay({ error }: { error: VisualizerErrorInfo }) {
  return (
    <div
      data-testid="visualizer-error-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(17, 24, 39, 0.94)',
        color: '#ef4444',
        padding: '1.5rem',
        textAlign: 'center',
        zIndex: 10,
      }}
    >
      <div style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        {'⚠ '} {error.title}
      </div>
      <div style={{ color: '#e5e7eb', fontSize: '0.875rem', maxWidth: '480px', marginBottom: '0.75rem' }}>
        {error.message}
      </div>
      {error.hint && (
        <div
          style={{
            backgroundColor: 'rgba(31, 41, 55, 0.85)',
            border: '1px solid #374151',
            borderRadius: '0.375rem',
            padding: '0.75rem',
            color: '#93c5fd',
            fontSize: '0.75rem',
            maxWidth: '500px',
            textAlign: 'left',
            lineHeight: 1.4,
          }}
        >
          <span style={{ fontWeight: 600, color: '#60a5fa' }}>Action: </span>
          {error.hint}
        </div>
      )}
    </div>
  );
}

export function VisualizerLoadingOverlay() {
  return (
    <div
      data-testid="visualizer-loading-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(17, 24, 39, 0.75)',
        color: '#9ca3af',
        fontSize: '0.875rem',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      <div
        style={{
          width: '28px',
          height: '28px',
          border: '3px solid #374151',
          borderTopColor: '#3b82f6',
          borderRadius: '50%',
          marginBottom: '0.5rem',
        }}
      />
      <span>Loading UR5e 3D Model...</span>
    </div>
  );
}
