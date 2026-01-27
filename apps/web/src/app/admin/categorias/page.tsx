'use client';

import { useState, useEffect } from 'react';
import { Category } from '@/types';
import {
  fake_getCategories,
  fake_createCategory,
  fake_updateCategory,
  fake_deleteCategory,
  fake_getCategoryProductCount
} from '@/lib/mock/services/fake-category-admin.service';
import { CategoryTreeItem } from '@/components/admin/category-tree-item';
import { CategoryForm } from '@/components/admin/category-form';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DeleteConfirmModal } from '@/components/ui/delete-confirm-modal';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { buildTree, type TreeNode } from '@/lib/utils/tree';
import { type CategoryFormData } from '@/lib/validations/category';

export default function CategoriasPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tree, setTree] = useState<TreeNode<Category>[]>([]);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);

  // Load categories
  const loadCategories = async () => {
    setIsLoading(true);
    try {
      const data = await fake_getCategories();
      setCategories(data);

      // Build tree
      const treeData = buildTree(data);
      setTree(treeData);

      // Calculate product counts
      const counts: Record<string, number> = {};
      data.forEach((category) => {
        counts[category.id] = fake_getCategoryProductCount(category.id);
      });
      setProductCounts(counts);
    } catch (error) {
      toast.error('Error al cargar categorías');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  // Handle create
  const handleCreate = () => {
    setSelectedCategory(undefined);
    setSheetOpen(true);
  };

  // Handle edit
  const handleEdit = (category: Category) => {
    setSelectedCategory(category);
    setSheetOpen(true);
  };

  // Handle delete click
  const handleDeleteClick = (category: Category) => {
    setCategoryToDelete(category);
    setDeleteDialogOpen(true);
  };

  // Handle delete confirm
  const handleDeleteConfirm = async () => {
    if (!categoryToDelete) return;

    try {
      await fake_deleteCategory(categoryToDelete.id);
      toast.success('Categoría eliminada correctamente');
      setDeleteDialogOpen(false);
      loadCategories();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al eliminar categoría';
      toast.error(message);
    }
  };

  // Handle form submit
  const handleSubmit = async (data: CategoryFormData) => {
    setIsSubmitting(true);
    try {
      if (selectedCategory) {
        await fake_updateCategory(selectedCategory.id, data);
        toast.success('Categoría actualizada correctamente');
      } else {
        await fake_createCategory(data);
        toast.success('Categoría creada correctamente');
      }
      setSheetOpen(false);
      loadCategories();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al guardar categoría';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Categorías</h1>
          <p className="text-muted-foreground">Gestión de categorías de productos (jerárquica)</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Categoría
        </Button>
      </div>

      {/* Tree View */}
      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b bg-muted/50">
          <div className="flex items-center justify-between text-sm font-medium">
            <div className="flex items-center gap-2">
              <span>Categoría</span>
            </div>
            <div className="flex items-center gap-8 pr-24">
              <span>Productos</span>
              <span className="w-8 text-center">Orden</span>
            </div>
          </div>
        </div>

        <div className="p-2">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : tree.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No hay categorías. Crea la primera categoría para comenzar.
            </div>
          ) : (
            <div className="space-y-1">
              {tree.map((node) => (
                <CategoryTreeItem
                  key={node.item.id}
                  node={node}
                  productCounts={productCounts}
                  onEdit={handleEdit}
                  onDelete={handleDeleteClick}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Form Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedCategory ? 'Editar Categoría' : 'Nueva Categoría'}</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <CategoryForm
              category={selectedCategory}
              allCategories={categories}
              onSubmit={handleSubmit}
              onCancel={() => setSheetOpen(false)}
              isLoading={isSubmitting}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Modal */}
      {categoryToDelete && (
        <DeleteConfirmModal
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          items={[{ id: categoryToDelete.id, name: categoryToDelete.name }]}
          onConfirm={handleDeleteConfirm}
          itemType="categoría"
          countdownSeconds={3}
        />
      )}
    </div>
  );
}
