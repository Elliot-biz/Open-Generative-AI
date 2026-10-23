import React, { lazy, Suspense } from 'react';

export default function dynamic(loader, { loading: Loading } = {}) {
  const Component = lazy(loader);
  return function DesktopLazyComponent(props) {
    return <Suspense fallback={Loading ? <Loading /> : null}><Component {...props} /></Suspense>;
  };
}
