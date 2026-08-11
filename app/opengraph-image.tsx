import { ImageResponse } from 'next/server';

export const runtime = 'edge';
export const alt = 'OPERAN — The Operating System for Marine Experience Businesses';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Accent glow */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '600px',
            height: '300px',
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,119,255,0.15) 0%, transparent 70%)',
          }}
        />

        {/* Logo circle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '80px',
            height: '80px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #6377FF 0%, #5063E8 100%)',
            marginBottom: '32px',
          }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="8" stroke="white" strokeWidth="2" />
            <circle cx="8" cy="12" r="2" fill="white" />
            <circle cx="16" cy="12" r="2" fill="white" />
            <circle cx="12" cy="12" r="2" fill="white" />
            <line x1="10" y1="12" x2="14" y2="12" stroke="white" strokeWidth="1.5" />
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: '64px',
            fontWeight: 800,
            color: 'white',
            letterSpacing: '-2px',
            marginBottom: '16px',
          }}
        >
          OPERAN
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: '24px',
            color: '#94A3B8',
            textAlign: 'center',
            maxWidth: '700px',
            lineHeight: 1.4,
          }}
        >
          The Operating System for Marine Experience Businesses
        </div>

        {/* Feature pills */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            marginTop: '40px',
          }}
        >
          {['Bookings', 'Payments', 'Automations', 'CRM', 'Waivers'].map((f) => (
            <div
              key={f}
              style={{
                padding: '8px 20px',
                borderRadius: '24px',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)',
                color: '#94A3B8',
                fontSize: '16px',
              }}
            >
              {f}
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: 'absolute',
            bottom: '32px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#22C55E',
            }}
          />
          <span style={{ color: '#94A3B8', fontSize: '14px' }}>
            operan.io — Start Free Trial
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
