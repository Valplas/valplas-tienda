// apps/api/src/modules/bot/bot.controller.ts

import type { Request, Response, NextFunction } from 'express';
import * as botDomain from './bot.domain.js';
import { ApiResponseBuilder as ApiResponse } from '../../shared/utils/api-response.js';
import type {
  CatalogProductsQuery,
  CreateBotOrderInput,
  CreateCustomerAddressInput,
  FindOrCreateCustomerInput,
  OrderActionInput,
  PaginationQuery,
  QuoteInput
} from './bot.validators.js';

type Handler = (req: Request, res: Response) => Promise<unknown>;

/** Pasa cualquier error al errorHandler global (AppError → ApiResponse.error). */
const handle =
  (fn: Handler) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };

// Los middlewares validateQuery/validateParams/validateBody de cada ruta garantizan estos datos
const validatedQuery = <T>(req: Request) => req.validated?.query as T;
const validatedParams = <T>(req: Request) => req.validated?.params as T;
const validatedBody = <T>(req: Request) => req.validated?.body as T;

function paginationOf(pagination: PaginationQuery, total: number) {
  return {
    page: pagination.page,
    limit: pagination.limit,
    total,
    totalPages: Math.ceil(total / pagination.limit),
    hasMore: pagination.page * pagination.limit < total
  };
}

function paginated<T>(res: Response, data: T[], pagination: PaginationQuery, total: number) {
  return res.json(ApiResponse.paginated(data, paginationOf(pagination, total)));
}

export const getCatalogStatus = handle(async (_req, res) => {
  res.json(ApiResponse.success(await botDomain.getCatalogStatus()));
});

export const getStoreInfo = handle(async (_req, res) => {
  res.json(ApiResponse.success(await botDomain.getStoreInfo()));
});

export const listCategories = handle(async (_req, res) => {
  res.json(ApiResponse.success({ categories: await botDomain.listCategories() }));
});

export const searchProducts = handle(async (req, res) => {
  const filters = validatedQuery<CatalogProductsQuery>(req);
  const { products, total, searchMode } = await botDomain.searchProducts(filters);
  // search_mode va junto a data, fuera de pagination (el middleware lo pasa a searchMode)
  res.json({
    ...ApiResponse.paginated(products, paginationOf(filters, total)),
    search_mode: searchMode
  });
});

export const getProduct = handle(async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  res.json(ApiResponse.success({ product: await botDomain.getProduct(id) }));
});

export const findCustomerByPhone = handle(async (req, res) => {
  const { phone } = validatedParams<{ phone: string }>(req);
  res.json(ApiResponse.success({ customer: await botDomain.findCustomerByPhone(phone) }));
});

export const findOrCreateCustomer = handle(async (req, res) => {
  const result = await botDomain.findOrCreateCustomer(
    validatedBody<FindOrCreateCustomerInput>(req)
  );
  res.status(result.created ? 201 : 200).json(ApiResponse.success(result));
});

export const getCustomerAddresses = handle(async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const pagination = validatedQuery<PaginationQuery>(req);
  const { addresses, total } = await botDomain.getCustomerAddresses(id, pagination);
  paginated(res, addresses, pagination, total);
});

export const addCustomerAddress = handle(async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const address = await botDomain.addCustomerAddress(
    id,
    validatedBody<CreateCustomerAddressInput>(req)
  );
  res.status(201).json(ApiResponse.success({ address }));
});

export const getCustomerOrders = handle(async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const pagination = validatedQuery<PaginationQuery>(req);
  const { orders, total } = await botDomain.getCustomerOrders(id, pagination);
  paginated(res, orders, pagination, total);
});

export const quote = handle(async (req, res) => {
  res.json(ApiResponse.success(await botDomain.quote(validatedBody<QuoteInput>(req))));
});

export const createOrder = handle(async (req, res) => {
  const result = await botDomain.createOrder(validatedBody<CreateBotOrderInput>(req));
  res.status(result.created ? 201 : 200).json(ApiResponse.success(result));
});

export const getOrder = handle(async (req, res) => {
  const { orderNumber } = validatedParams<{ orderNumber: string }>(req);
  const { customer_id } = validatedQuery<{ customer_id: string }>(req);
  res.json(ApiResponse.success({ order: await botDomain.getOrder(orderNumber, customer_id) }));
});

export const regeneratePaymentLink = handle(async (req, res) => {
  const { orderNumber } = validatedParams<{ orderNumber: string }>(req);
  res.json(
    ApiResponse.success(
      await botDomain.regeneratePaymentLink(orderNumber, validatedBody<OrderActionInput>(req))
    )
  );
});

export const cancelOrder = handle(async (req, res) => {
  const { orderNumber } = validatedParams<{ orderNumber: string }>(req);
  const order = await botDomain.cancelOrder(orderNumber, validatedBody<OrderActionInput>(req));
  res.json(ApiResponse.success({ order }));
});
