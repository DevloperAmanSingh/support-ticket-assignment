import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';

import { Providers } from '@/app/providers.tsx';
import { routes } from '@/app/routes.tsx';

import './index.css';

const root = document.getElementById('root');
if (root === null) throw new Error('The page has no #root element');

createRoot(root).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={createBrowserRouter(routes)} />
    </Providers>
  </StrictMode>,
);
