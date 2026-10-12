import { Navigate } from 'react-router';
import type { RouteObject } from 'react-router';

import { Banner } from '@/components/ErrorBanner.tsx';

import { App, CompanyIndex } from './App.tsx';
import { RoutePattern, Tab } from './paths.ts';

export const routes: RouteObject[] = [
  { path: RoutePattern.Home, element: <CompanyIndex /> },
  // A relative target: "/c/acme" becomes "/c/acme/schedule".
  { path: RoutePattern.Company, element: <Navigate replace to={Tab.Schedule} /> },
  { path: RoutePattern.CompanyTab, element: <App /> },
  {
    path: '*',
    element: (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Banner message="This page does not exist." />
      </div>
    ),
  },
];
