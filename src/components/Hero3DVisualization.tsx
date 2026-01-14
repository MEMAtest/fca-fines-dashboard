import { motion } from 'framer-motion';

export function Hero3DVisualization() {
  return (
    <div className="hero-3d-scene">
      {/* Circular backdrop glow */}
      <div className="circular-backdrop"></div>

      {/* Network grid */}
      <svg className="network-grid" viewBox="0 0 500 500">
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path
              d="M 50 0 L 0 0 0 50"
              fill="none"
              stroke="rgba(15, 162, 148, 0.15)"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="500" height="500" fill="url(#grid)" />
      </svg>

      {/* Central large platform cube */}
      <motion.div
        className="central-platform"
        initial={{ scale: 0, rotateY: -180 }}
        animate={{ scale: 1, rotateY: 0 }}
        transition={{ duration: 1, delay: 0.2 }}
      >
        {/* Multi-layered glowing cube */}
        <div className="platform-layer layer-1"></div>
        <div className="platform-layer layer-2"></div>
        <div className="platform-layer layer-3"></div>
        <div className="platform-glow"></div>
      </motion.div>

      {/* Central stat badge - Total Fines */}
      <motion.div
        className="stat-badge-3d"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.5 }}
      >
        <div className="stat-label">Total Fines</div>
        <div className="stat-value">£4.9bn</div>
      </motion.div>

      {/* Secondary stat badge - Firms Fined */}
      <motion.div
        className="stat-badge-3d stat-badge-secondary"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.7 }}
      >
        <div className="stat-label">Firms Fined</div>
        <div className="stat-value">305</div>
      </motion.div>

      {/* Third stat badge - Peak Year */}
      <motion.div
        className="stat-badge-3d stat-badge-tertiary"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.9 }}
      >
        <div className="stat-label">Peak Year</div>
        <div className="stat-value">2014</div>
      </motion.div>

      {/* Floating stacked server blocks (8 nodes around central platform) */}
      {[
        { className: 'node-1', x: -38, y: -28, delay: 0.6, layers: 3 },
        { className: 'node-2', x: 38, y: -22, delay: 0.7, layers: 2 },
        { className: 'node-3', x: -42, y: 18, delay: 0.8, layers: 2 },
        { className: 'node-4', x: 42, y: 22, delay: 0.9, layers: 3 },
        { className: 'node-5', x: -22, y: -48, delay: 1.0, layers: 2 },
        { className: 'node-6', x: 28, y: -42, delay: 1.1, layers: 3 },
        { className: 'node-7', x: -32, y: 42, delay: 1.2, layers: 2 },
        { className: 'node-8', x: 32, y: 38, delay: 1.3, layers: 3 },
      ].map((node, i) => (
        <motion.div
          key={i}
          className={`floating-node ${node.className}`}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: node.delay }}
          style={{
            left: `calc(50% + ${node.x}%)`,
            top: `calc(50% + ${node.y}%)`,
          }}
        >
          <div className="stacked-block">
            {/* Stacked layers */}
            {[...Array(node.layers)].map((_, layerIndex) => (
              <div key={layerIndex} className="block-layer" style={{ '--layer': layerIndex } as React.CSSProperties}>
                <div className="layer-top"></div>
                <div className="layer-front"></div>
                <div className="layer-right"></div>
              </div>
            ))}
          </div>
        </motion.div>
      ))}

      {/* Connection lines with dots */}
      <svg className="connection-lines" viewBox="0 0 400 400">
        {/* Lines from center to nodes */}
        {[
          { x1: 200, y1: 200, x2: 100, y2: 120 },
          { x1: 200, y1: 200, x2: 300, y2: 130 },
          { x1: 200, y1: 200, x2: 80, y2: 230 },
          { x1: 200, y1: 200, x2: 320, y2: 240 },
          { x1: 200, y1: 200, x2: 120, y2: 80 },
          { x1: 200, y1: 200, x2: 280, y2: 90 },
          { x1: 200, y1: 200, x2: 110, y2: 300 },
          { x1: 200, y1: 200, x2: 290, y2: 290 },
        ].map((line, i) => (
          <motion.g key={i}>
            <motion.line
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="url(#lineGradient)"
              strokeWidth="2"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1, delay: 0.6 + i * 0.1 }}
            />
            {/* Connection dot at endpoint */}
            <motion.circle
              cx={line.x2}
              cy={line.y2}
              r="4"
              fill="#17C3B2"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.4, delay: 1 + i * 0.1 }}
            />
          </motion.g>
        ))}

        {/* Some inter-node connections */}
        {[
          { x1: 100, y1: 120, x2: 120, y2: 80 },
          { x1: 300, y1: 130, x2: 280, y2: 90 },
          { x1: 80, y1: 230, x2: 110, y2: 300 },
          { x1: 320, y1: 240, x2: 290, y2: 290 },
        ].map((line, i) => (
          <motion.line
            key={`inter-${i}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="rgba(99, 102, 241, 0.3)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.5, delay: 1.5 + i * 0.2 }}
          />
        ))}

        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0FA294" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#6366F1" stopOpacity="0.4" />
          </linearGradient>
        </defs>
      </svg>

      {/* Floating particles with glow */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          className="particle-glow"
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0.2, 0.8, 0.2],
            scale: [1, 1.5, 1],
            y: [0, -30, 0],
          }}
          transition={{
            duration: 4 + i * 0.3,
            repeat: Infinity,
            delay: i * 0.2,
          }}
          style={{
            left: `${15 + (i % 4) * 23}%`,
            top: `${20 + Math.floor(i / 4) * 25}%`,
          }}
        />
      ))}
    </div>
  );
}
