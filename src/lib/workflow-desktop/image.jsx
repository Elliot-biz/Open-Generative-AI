import React from 'react';

/* eslint-disable @next/next/no-img-element -- Electron has no Next image optimization server. */

// Next's image optimizer has no desktop server. Retain the supplied media URL.
export default function Image({ fill, priority, quality: _quality, unoptimized: _unoptimized, loader: _loader, style, alt = '', ...props }) {
  return <img {...props} alt={alt} loading={priority ? 'eager' : 'lazy'} style={fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%', ...style } : style} />;
}
