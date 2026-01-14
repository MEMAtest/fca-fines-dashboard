// 3D Isometric Icon Components

export const TrendChart3D = () => (
  <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
    {/* Isometric platform base */}
    <path
      d="M60 85 L30 97 L30 100 L60 88 L90 100 L90 97 Z"
      fill="url(#platformGradient)"
      opacity="0.6"
    />

    {/* Bars (isometric rectangles) - Left bar (shortest) */}
    <g className="bar-group">
      {/* Front face */}
      <path d="M35 70 L35 55 L45 50 L45 65 Z" fill="#0FA294" />
      {/* Top face */}
      <path d="M35 55 L45 50 L55 55 L45 60 Z" fill="#17C3B2" opacity="0.8" />
      {/* Right face */}
      <path d="M45 65 L45 50 L55 55 L55 70 Z" fill="#0d7d70" />
    </g>

    {/* Middle bar (medium) */}
    <g className="bar-group">
      {/* Front face */}
      <path d="M50 65 L50 40 L60 35 L60 60 Z" fill="#6366F1" />
      {/* Top face */}
      <path d="M50 40 L60 35 L70 40 L60 45 Z" fill="#818CF8" opacity="0.8" />
      {/* Right face */}
      <path d="M60 60 L60 35 L70 40 L70 65 Z" fill="#4F46E5" />
    </g>

    {/* Right bar (tallest) */}
    <g className="bar-group">
      {/* Front face */}
      <path d="M65 60 L65 25 L75 20 L75 55 Z" fill="#0FA294" />
      {/* Top face */}
      <path d="M65 25 L75 20 L85 25 L75 30 Z" fill="#17C3B2" opacity="0.8" />
      {/* Right face */}
      <path d="M75 55 L75 20 L85 25 L85 60 Z" fill="#0d7d70" />
    </g>

    <defs>
      <linearGradient id="platformGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#E0F7F5" />
        <stop offset="100%" stopColor="#BAE6FD" />
      </linearGradient>
    </defs>
  </svg>
);

export const Shield3D = () => (
  <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
    {/* Shield body - isometric */}
    <g className="shield-group">
      {/* Front face */}
      <path
        d="M60 30 L35 42 L35 65 Q 35 75 45 82 Q 55 88 60 92 Q 65 88 75 82 Q 85 75 85 65 L85 42 Z"
        fill="#6366F1"
      />
      {/* Top face (3D depth) */}
      <path
        d="M60 25 L35 37 L35 42 L60 30 L85 42 L85 37 Z"
        fill="#818CF8"
        opacity="0.9"
      />
      {/* Checkmark */}
      <path
        d="M50 55 L56 62 L72 45"
        stroke="#FFFFFF"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </g>

    {/* Glow effect */}
    <circle cx="60" cy="60" r="45" fill="url(#shieldGlow)" opacity="0.15" />

    <defs>
      <radialGradient id="shieldGlow">
        <stop offset="0%" stopColor="#6366F1" />
        <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
      </radialGradient>
    </defs>
  </svg>
);

export const Clock3D = () => (
  <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
    {/* Clock body - isometric circle */}
    <g className="clock-group">
      {/* Base ellipse (3D depth) */}
      <ellipse cx="60" cy="68" rx="32" ry="10" fill="#0d7d70" opacity="0.6" />

      {/* Main clock face */}
      <circle cx="60" cy="60" r="32" fill="#0FA294" />

      {/* Inner circle */}
      <circle cx="60" cy="60" r="28" fill="url(#clockGradient)" />

      {/* Clock marks */}
      <circle cx="60" cy="38" r="2" fill="#1F2937" />
      <circle cx="82" cy="60" r="2" fill="#1F2937" />
      <circle cx="60" cy="82" r="2" fill="#1F2937" />
      <circle cx="38" cy="60" r="2" fill="#1F2937" />

      {/* Clock hands */}
      <line x1="60" y1="60" x2="60" y2="45" stroke="#1F2937" strokeWidth="3" strokeLinecap="round" />
      <line x1="60" y1="60" x2="70" y2="60" stroke="#1F2937" strokeWidth="2" strokeLinecap="round" />

      {/* Center dot */}
      <circle cx="60" cy="60" r="3" fill="#1F2937" />
    </g>

    {/* Arrow (circular motion indicator) */}
    <path
      d="M 90 60 Q 95 50 85 45"
      stroke="#6366F1"
      strokeWidth="3"
      strokeLinecap="round"
      fill="none"
    />
    <path
      d="M 85 45 L 83 50 L 88 48 Z"
      fill="#6366F1"
    />

    <defs>
      <linearGradient id="clockGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#E0F7F5" />
        <stop offset="100%" stopColor="#17C3B2" />
      </linearGradient>
    </defs>
  </svg>
);
