/**
 * Tree utility functions for hierarchical data structures
 */

export interface TreeNode<T> {
  item: T;
  children: TreeNode<T>[];
  level: number;
}

/**
 * Build a hierarchical tree from a flat array of items
 * @param items - Flat array of items with id and parentId
 * @param parentId - Parent ID to start building from (null for root)
 * @param level - Current depth level in the tree
 * @returns Array of tree nodes with nested children
 */
export function buildTree<T extends { id: string; parentId: string | null }>(
  items: T[],
  parentId: string | null = null,
  level: number = 0
): TreeNode<T>[] {
  return items
    .filter((item) => item.parentId === parentId)
    .map((item) => ({
      item,
      children: buildTree(items, item.id, level + 1),
      level
    }))
    .sort((a, b) => {
      // Sort by displayOrder if available
      const orderA =
        'displayOrder' in a.item && typeof a.item.displayOrder === 'number'
          ? a.item.displayOrder
          : 0;
      const orderB =
        'displayOrder' in b.item && typeof b.item.displayOrder === 'number'
          ? b.item.displayOrder
          : 0;
      return orderA - orderB;
    });
}

/**
 * Flatten a tree back to an array
 * @param tree - Tree nodes to flatten
 * @returns Flat array of items
 */
export function flattenTree<T>(tree: TreeNode<T>[]): T[] {
  return tree.reduce<T[]>((acc, node) => {
    return [...acc, node.item, ...flattenTree(node.children)];
  }, []);
}

/**
 * Get all descendant IDs of a node
 * @param items - All items
 * @param parentId - Parent ID to find descendants of
 * @returns Array of descendant IDs
 */
export function getDescendantIds<T extends { id: string; parentId: string | null }>(
  items: T[],
  parentId: string
): string[] {
  const children = items.filter((item) => item.parentId === parentId);
  const childIds = children.map((child) => child.id);
  const grandchildIds = children.flatMap((child) => getDescendantIds(items, child.id));
  return [...childIds, ...grandchildIds];
}

/**
 * Check if setting parentId would create a circular reference
 * @param items - All items
 * @param itemId - ID of item being updated
 * @param newParentId - New parent ID to check
 * @returns true if circular reference would be created
 */
export function wouldCreateCircularReference<T extends { id: string; parentId: string | null }>(
  items: T[],
  itemId: string,
  newParentId: string | null
): boolean {
  if (!newParentId || newParentId === itemId) return true;

  // Check if newParentId is a descendant of itemId
  const descendants = getDescendantIds(items, itemId);
  return descendants.includes(newParentId);
}
