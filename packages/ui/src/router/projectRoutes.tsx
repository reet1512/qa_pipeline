import { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';

import { SpecDetailLayout } from '../components/spec-detail-layout';
import { SessionDetailLayout } from '../components/session-detail-layout';

// Lazy-load page components to reduce initial bundle size
const ContextPage = lazy(() => import('../pages/ContextPage').then(m => ({ default: m.ContextPage })));
const DashboardPage = lazy(() => import('../pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const DependenciesPage = lazy(() => import('../pages/DependenciesPage').then(m => ({ default: m.DependenciesPage })));
const ChatSettingsPage = lazy(() => import('../pages/ChatSettingsPage').then(m => ({ default: m.ChatSettingsPage })));
const FilesPage = lazy(() => import('../pages/FilesPage').then(m => ({ default: m.FilesPage })));
const SessionDetailPage = lazy(() => import('../pages/SessionDetailPage').then(m => ({ default: m.SessionDetailPage })));
const SessionsPage = lazy(() => import('../pages/SessionsPage').then(m => ({ default: m.SessionsPage })));
const SpecDetailPage = lazy(() => import('../pages/SpecDetailPage').then(m => ({ default: m.SpecDetailPage })));
const SpecsPage = lazy(() => import('../pages/SpecsPage').then(m => ({ default: m.SpecsPage })));
const StatsPage = lazy(() => import('../pages/StatsPage').then(m => ({ default: m.StatsPage })));

const lazy_ = (C: React.LazyExoticComponent<React.ComponentType>) => (
  <Suspense fallback={null}><C /></Suspense>
);

/**
 * Shared project-scoped route definitions.
 *
 * Both the web app (@leanspec/ui) and desktop app (@leanspec/desktop)
 * compose these under their own top-level layouts and router types
 * (browser vs hash).
 */
export function createProjectRoutes(): RouteObject[] {
  return [
    { index: true, element: lazy_(DashboardPage) },
    {
      path: 'specs',
      children: [
        { index: true, element: lazy_(SpecsPage) },
        {
          element: <SpecDetailLayout />,
          children: [{ path: ':specName', element: lazy_(SpecDetailPage) }],
        },
      ],
    },
    {
      path: 'sessions',
      children: [
        { index: true, element: lazy_(SessionsPage) },
        {
          element: <SessionDetailLayout />,
          children: [{ path: ':sessionId', element: lazy_(SessionDetailPage) }],
        },
      ],
    },
    { path: 'stats', element: lazy_(StatsPage) },
    { path: 'dependencies', element: lazy_(DependenciesPage) },
    { path: 'dependencies/:specName', element: lazy_(DependenciesPage) },
    { path: 'context', element: lazy_(ContextPage) },
    { path: 'files', element: lazy_(FilesPage) },
    { path: 'chat/settings', element: lazy_(ChatSettingsPage) },
  ];
}
