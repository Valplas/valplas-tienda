'use client';

/**
 * BreadcrumbNav Component
 * Dynamic breadcrumbs based on current path
 */

import { usePathname } from 'next/navigation';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Fragment } from 'react';

interface BreadcrumbNavProps {
  /**
   * Custom labels for path segments
   * Example: { 'productos': 'Productos', 'admin': 'Panel Admin' }
   */
  customLabels?: Record<string, string>;
  /**
   * Whether to show the home breadcrumb
   */
  showHome?: boolean;
}

export function BreadcrumbNav({ customLabels = {}, showHome = true }: BreadcrumbNavProps) {
  const pathname = usePathname();

  // Don't show breadcrumbs on home page
  if (pathname === '/') {
    return null;
  }

  // Generate breadcrumb items from path
  const paths = pathname.split('/').filter(Boolean);
  const breadcrumbs = paths.map((path, index) => {
    const href = '/' + paths.slice(0, index + 1).join('/');
    const label = customLabels[path] || capitalizeFirst(path);

    return {
      href,
      label,
      isLast: index === paths.length - 1
    };
  });

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {/* Home */}
        {showHome && (
          <>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Inicio</BreadcrumbLink>
            </BreadcrumbItem>
            {breadcrumbs.length > 0 && <BreadcrumbSeparator />}
          </>
        )}

        {/* Dynamic breadcrumbs */}
        {breadcrumbs.map((item) => (
          <Fragment key={item.href}>
            <BreadcrumbItem>
              {item.isLast ? (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {!item.isLast && <BreadcrumbSeparator />}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/**
 * Capitalizes first letter of string
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
