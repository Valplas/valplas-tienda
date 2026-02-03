import type { Request, Response, NextFunction } from 'express';
import * as categoryService from './category.service.js';
import { ApiResponse } from '../../shared/utils/api-response.js';

export async function listCategories(req: Request, res: Response, next: NextFunction) {
  try {
    const categories = await categoryService.listCategories();
    return res.json(ApiResponse.success({ categories }));
  } catch (error) {
    next(error);
  }
}

export async function getCategoryById(req: Request, res: Response, next: NextFunction) {
  try {
    const category = await categoryService.getCategoryById(req.params.id);
    return res.json(ApiResponse.success({ category }));
  } catch (error) {
    next(error);
  }
}

export async function createCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const category = await categoryService.createCategory(req.body);
    return res.status(201).json(ApiResponse.success({ category }));
  } catch (error) {
    next(error);
  }
}

export async function updateCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const category = await categoryService.updateCategory(req.params.id, req.body);
    return res.json(ApiResponse.success({ category }));
  } catch (error) {
    next(error);
  }
}

export async function deleteCategory(req: Request, res: Response, next: NextFunction) {
  try {
    await categoryService.deleteCategory(req.params.id);
    return res.json(ApiResponse.success({ message: 'Categoría eliminada exitosamente' }));
  } catch (error) {
    next(error);
  }
}

export async function reorderCategories(req: Request, res: Response, next: NextFunction) {
  try {
    await categoryService.reorderCategories(req.body.categories);
    return res.json(ApiResponse.success({ message: 'Categorías reordenadas exitosamente' }));
  } catch (error) {
    next(error);
  }
}
