import { Link } from 'react-router-dom';
import type { Spec, HierarchyNode, SpecStatus } from '../../types/api';
import type { SpecsSortOption } from '../../stores/specs-preferences';
import { StatusBadge } from '../status-badge';
import { PriorityBadge } from '../priority-badge';
import { useTranslation } from 'react-i18next';
import { HierarchyList } from './hierarchy-list';
import { TokenBadge } from '../token-badge';
import { ValidationBadge } from '../validation-badge';
import { memo, useEffect, useMemo, useState } from 'react';

const INITIAL_VISIBLE_ROWS = 120;
const ROW_CHUNK_SIZE = 120;

interface SpecListItemProps {
  spec: Spec;
  basePath: string;
  onTokenClick: (specName: string) => void;
  onValidationClick: (specName: string) => void;
  onStatusChange?: (spec: Spec, status: SpecStatus) => void;
  onPriorityChange?: (spec: Spec, priority: string) => void;
}

// Memoized spec item to prevent re-renders when dialog state changes
const SpecListItem = memo(function SpecListItem({
  spec,
  basePath,
  onTokenClick,
  onValidationClick,
  onStatusChange,
  onPriorityChange
}: SpecListItemProps) {
  return (
    <Link
      to={`${basePath}/specs/${spec.specName}`}
      className="block border rounded-lg hover:bg-secondary/50 transition-colors bg-background"
    >
      <div className="flex items-start">
        <div className="w-8 h-full invisible flex items-center text-muted-foreground" />
        <div className="flex-1 p-4 pl-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                  #{spec.specNumber}
                </span>
                <h3 className="font-medium truncate">{spec.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground truncate">{spec.specName}</p>
            </div>
            <div className="flex gap-2 items-center flex-shrink-0 flex-wrap justify-end">
              {spec.status && (
                <StatusBadge
                  status={spec.status}
                  editable={!!onStatusChange}
                  onChange={(status) => onStatusChange?.(spec, status as SpecStatus)}
                />
              )}
              {spec.priority && (
                <PriorityBadge
                  priority={spec.priority}
                  editable={!!onPriorityChange}
                  onChange={(priority) => onPriorityChange?.(spec, priority)}
                />
              )}
              <TokenBadge
                count={spec.tokenCount}
                size="sm"
                onClick={() => onTokenClick(spec.specName)}
              />
              <ValidationBadge
                status={spec.validationStatus}
                size="sm"
                onClick={() => onValidationClick(spec.specName)}
              />
            </div>
          </div>
          {spec.tags && spec.tags.length > 0 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {spec.tags.map((tag: string) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 bg-secondary rounded text-secondary-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
});

interface ListViewProps {
  specs: Spec[];
  /** Pre-built hierarchy from server - if provided, skips client-side tree building */
  hierarchy?: HierarchyNode[];
  basePath?: string;
  groupByParent?: boolean;
  sortBy?: SpecsSortOption;
  onTokenClick?: (specName: string) => void;
  onValidationClick?: (specName: string) => void;
  onStatusChange?: (spec: Spec, status: SpecStatus) => void;
  onPriorityChange?: (spec: Spec, priority: string) => void;
}

export const ListView = memo(function ListView({ specs, hierarchy, basePath = '/projects', groupByParent = false, sortBy = 'id-desc', onTokenClick, onValidationClick, onStatusChange, onPriorityChange }: ListViewProps) {
  const { t } = useTranslation('common');

  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ROWS);

  // Progressive render for large flat lists to avoid a long main-thread block.
  useEffect(() => {
    if (groupByParent) {
      return;
    }

    const total = specs.length;
    const initial = Math.min(INITIAL_VISIBLE_ROWS, total);

    if (typeof window === 'undefined') {
      return;
    }

    let rafId: number | null = null;
    let cancelled = false;

    const start = () => {
      if (cancelled) return;

      setVisibleCount(initial);

      if (total <= INITIAL_VISIBLE_ROWS) {
        return;
      }

      const pump = () => {
        if (cancelled) return;
        setVisibleCount((prev) => {
          const next = Math.min(prev + ROW_CHUNK_SIZE, total);
          if (next < total && !cancelled) {
            rafId = window.requestAnimationFrame(pump);
          }
          return next;
        });
      };

      rafId = window.requestAnimationFrame(pump);
    };

    rafId = window.requestAnimationFrame(start);

    return () => {
      cancelled = true;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [groupByParent, specs.length]);

  const visibleSpecs = useMemo(
    () => (groupByParent ? specs : specs.slice(0, visibleCount)),
    [groupByParent, specs, visibleCount]
  );

  if (specs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground border rounded-lg bg-secondary/10">
        {t('specsPage.list.empty')}
      </div>
    );
  }

  if (groupByParent) {
    return (
      <HierarchyList
        specs={specs}
        hierarchy={hierarchy}
        basePath={basePath}
        sortBy={sortBy}
        onTokenClick={onTokenClick}
        onValidationClick={onValidationClick}
        onStatusChange={onStatusChange}
        onPriorityChange={onPriorityChange}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto space-y-2">
      {visibleSpecs.map((spec) => (
        <SpecListItem
          key={spec.specName}
          spec={spec}
          basePath={basePath}
          onTokenClick={(name) => onTokenClick?.(name)}
          onValidationClick={(name) => onValidationClick?.(name)}
          onStatusChange={onStatusChange}
          onPriorityChange={onPriorityChange}
        />
      ))}
      {!groupByParent && visibleCount < specs.length && (
        <div className="py-3 text-center text-xs text-muted-foreground">
          {t('specsPage.list.loadingMore', { visible: visibleCount, total: specs.length, defaultValue: 'Rendering {{visible}} / {{total}} specs...' })}
        </div>
      )}
    </div>
  );
});
