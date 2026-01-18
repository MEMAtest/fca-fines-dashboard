import { motion } from 'framer-motion';

export function Blog3DVisualization() {
  return (
    <div className="blog-3d-scene">
      {/* Circular backdrop glow */}
      <div className="blog-circular-backdrop"></div>

      {/* Central floating document stack */}
      <motion.div
        className="central-document-stack"
        initial={{ scale: 0, rotateY: -180 }}
        animate={{ scale: 1, rotateY: 0 }}
        transition={{ duration: 1, delay: 0.2 }}
      >
        <div className="document-layer doc-layer-1"></div>
        <div className="document-layer doc-layer-2"></div>
        <div className="document-layer doc-layer-3"></div>
        <div className="document-glow"></div>
      </motion.div>

      {/* Central badge - Insights */}
      <motion.div
        className="blog-stat-badge"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.5 }}
      >
        <div className="blog-stat-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div className="blog-stat-label">Expert Insights</div>
      </motion.div>

      {/* Floating 3D elements around */}
      {[
        { className: 'float-element-1', x: -35, y: -30, delay: 0.6, type: 'chart' },
        { className: 'float-element-2', x: 38, y: -25, delay: 0.7, type: 'scale' },
        { className: 'float-element-3', x: -40, y: 20, delay: 0.8, type: 'doc' },
        { className: 'float-element-4', x: 42, y: 25, delay: 0.9, type: 'trend' },
        { className: 'float-element-5', x: -15, y: -45, delay: 1.0, type: 'shield' },
        { className: 'float-element-6', x: 20, y: 40, delay: 1.1, type: 'book' },
      ].map((element, i) => (
        <motion.div
          key={i}
          className={`blog-float-element ${element.className}`}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: element.delay }}
          style={{
            left: `calc(50% + ${element.x}%)`,
            top: `calc(50% + ${element.y}%)`,
          }}
        >
          <FloatingIcon type={element.type} />
        </motion.div>
      ))}

      {/* Connection lines */}
      <svg className="blog-connection-lines" viewBox="0 0 400 400">
        {[
          { x1: 200, y1: 200, x2: 110, y2: 110 },
          { x1: 200, y1: 200, x2: 300, y2: 120 },
          { x1: 200, y1: 200, x2: 90, y2: 250 },
          { x1: 200, y1: 200, x2: 310, y2: 260 },
          { x1: 200, y1: 200, x2: 150, y2: 75 },
          { x1: 200, y1: 200, x2: 250, y2: 320 },
        ].map((line, i) => (
          <motion.g key={i}>
            <motion.line
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="url(#blogLineGradient)"
              strokeWidth="1.5"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.6 }}
              transition={{ duration: 1, delay: 0.6 + i * 0.1 }}
            />
            <motion.circle
              cx={line.x2}
              cy={line.y2}
              r="3"
              fill="#0FA294"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.4, delay: 1 + i * 0.1 }}
            />
          </motion.g>
        ))}

        <defs>
          <linearGradient id="blogLineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0FA294" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#6366F1" stopOpacity="0.3" />
          </linearGradient>
        </defs>
      </svg>

      {/* Floating particles */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="blog-particle"
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0.3, 0.7, 0.3],
            scale: [1, 1.3, 1],
            y: [0, -20, 0],
          }}
          transition={{
            duration: 3 + i * 0.4,
            repeat: Infinity,
            delay: i * 0.25,
          }}
          style={{
            left: `${20 + (i % 4) * 20}%`,
            top: `${25 + Math.floor(i / 4) * 35}%`,
          }}
        />
      ))}
    </div>
  );
}

// Floating icon components
function FloatingIcon({ type }: { type: string }) {
  switch (type) {
    case 'chart':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="float-icon">
          <rect x="5" y="20" width="8" height="15" rx="2" fill="#0FA294" />
          <rect x="16" y="12" width="8" height="23" rx="2" fill="#6366F1" />
          <rect x="27" y="5" width="8" height="30" rx="2" fill="#0FA294" />
        </svg>
      );
    case 'scale':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="float-icon">
          <path d="M20 5V35" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M8 12L20 8L32 12" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="8" cy="18" r="5" fill="#0FA294" />
          <circle cx="32" cy="18" r="5" fill="#0FA294" />
        </svg>
      );
    case 'doc':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="float-icon">
          <rect x="8" y="4" width="24" height="32" rx="3" fill="#6366F1" />
          <rect x="12" y="10" width="16" height="2" rx="1" fill="white" opacity="0.8" />
          <rect x="12" y="16" width="12" height="2" rx="1" fill="white" opacity="0.6" />
          <rect x="12" y="22" width="14" height="2" rx="1" fill="white" opacity="0.6" />
          <rect x="12" y="28" width="10" height="2" rx="1" fill="white" opacity="0.4" />
        </svg>
      );
    case 'trend':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="float-icon">
          <path d="M5 30L15 20L22 25L35 10" stroke="#0FA294" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M28 10H35V17" stroke="#0FA294" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'shield':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="float-icon">
          <path d="M20 4L6 10V18C6 26.8 12 33.4 20 36C28 33.4 34 26.8 34 18V10L20 4Z" fill="#6366F1" />
          <path d="M15 19L18 22L25 15" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'book':
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="float-icon">
          <path d="M6 6H16C18.2 6 20 7.8 20 10V34C20 32.3 18.2 31 16 31H6V6Z" fill="#0FA294" />
          <path d="M34 6H24C21.8 6 20 7.8 20 10V34C20 32.3 21.8 31 24 31H34V6Z" fill="#6366F1" />
        </svg>
      );
    default:
      return null;
  }
}
