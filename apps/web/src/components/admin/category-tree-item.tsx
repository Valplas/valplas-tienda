'use client';

import { useState } from 'react';
import { Category } from '@/types';
import { TreeNode } from '@/lib/utils/tree';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, ChevronDown, Edit, Trash2, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CategoryTreeItemProps {
  node: TreeNode<Category>;
  productCounts: Record<string, number>;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}

export function CategoryTreeItem({ node, productCounts, onEdit, onDelete }: CategoryTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const productCount = productCounts[node.item.id] ?? 0;

  return (
    <div className="select-none">
      {/* Current item */}
      <div
        className={cn(
          'flex items-center gap-2 py-2 px-3 rounded-md hover:bg-accent/50 transition-colors group',
          !node.item.is_active && 'opacity-60'
        )}
        style={{ paddingLeft: `${node.level * 24 + 12}px` }}
      >
        {/* Expand/Collapse button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 p-0"
          onClick={() => setIsExpanded(!isExpanded)}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : (
            <div className="w-4 h-4" />
          )}
        </Button>

        {/* Category name */}
        <div className="flex-1 flex items-center gap-2">
          <span className="font-medium">{node.item.name}</span>
          <span className="text-xs text-muted-foreground">({node.item.slug})</span>
          {!node.item.is_active && (
            <Badge variant="outline" className="text-xs">
              Inactiva
            </Badge>
          )}
        </div>

        {/* Product count */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Package className="h-3.5 w-3.5" />
          <span>{productCount}</span>
        </div>

        {/* Display order */}
        <div className="text-xs text-muted-foreground w-8 text-center">
          #{node.item.display_order}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(node.item)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-500 hover:text-red-600"
            onClick={() => onDelete(node.item)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <CategoryTreeItem
              key={child.item.id}
              node={child}
              productCounts={productCounts}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
