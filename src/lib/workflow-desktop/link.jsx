import React from 'react';
import { workflowNavigation } from './routes.mjs';

export default function Link({ href, children, onClick, prefetch: _prefetch, ...props }) {
  return <a {...props} href={href} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    workflowNavigation.push(href);
  }}>{children}</a>;
}
