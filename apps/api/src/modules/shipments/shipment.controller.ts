// apps/api/src/modules/shipments/shipment.controller.ts

import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ApiResponseBuilder as ApiResponse } from '../../shared/utils/api-response.js';
import * as shipmentDomain from './shipment.domain.js';
import type { ServiceType } from './shipment.types.js';
import type { CreateShipmentBody } from './shipment.validators.js';

const DEFAULT_BRANCH_LIMIT = 20;
const MAX_BRANCH_LIMIT = 50;

export async function preview(req: Request, res: Response, next: NextFunction) {
  try {
    const { service_type, branch_id } = req.query as {
      service_type?: ServiceType;
      branch_id?: string;
    };
    const data = await shipmentDomain.previewForOrder(req.params.orderId as string, {
      serviceType: service_type,
      branchId: branch_id
    });
    return res.json(ApiResponse.success(data));
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as CreateShipmentBody;
    const actor = req.user as AuthenticatedUser;
    const shipment = await shipmentDomain.createForOrder(
      req.params.orderId as string,
      {
        serviceType: body.service_type,
        branchId: body.branch_id,
        localidad: body.localidad,
        packages: body.packages?.map((p) => ({
          kilos: p.kilos,
          volumeCm3: p.volume_cm3,
          largoCm: p.largo_cm,
          anchoCm: p.ancho_cm,
          altoCm: p.alto_cm
        }))
      },
      actor.userId
    );
    // 202: el pedido a Andreani quedó pendiente de confirmación (timeout / error transitorio)
    return res
      .status(shipment.status === 'requesting' ? 202 : 201)
      .json(ApiResponse.success(await shipmentDomain.toAdminView(shipment)));
  } catch (error) {
    next(error);
  }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    const shipment = await shipmentDomain.cancelShipment(req.params.id as string);
    return res.json(ApiResponse.success(await shipmentDomain.toAdminView(shipment)));
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const shipment = await shipmentDomain.refreshShipment(req.params.id as string);
    return res.json(ApiResponse.success(await shipmentDomain.toAdminView(shipment)));
  } catch (error) {
    next(error);
  }
}

export async function discard(req: Request, res: Response, next: NextFunction) {
  try {
    const shipment = await shipmentDomain.discardShipment(req.params.id as string);
    return res.json(ApiResponse.success(await shipmentDomain.toAdminView(shipment)));
  } catch (error) {
    next(error);
  }
}

export function config(_req: Request, res: Response) {
  return res.json(ApiResponse.success(shipmentDomain.getIntegrationConfig()));
}

export async function label(req: Request, res: Response, next: NextFunction) {
  try {
    const file = await shipmentDomain.getLabel(req.params.id as string);
    // El middleware camelCase solo envuelve res.json: el binario sale tal cual.
    res
      .type(file.contentType)
      .setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(file.data);
  } catch (error) {
    next(error);
  }
}

export async function branches(req: Request, res: Response, next: NextFunction) {
  try {
    const { postcode, limit } = req.query as { postcode: string; limit?: string };
    // validate() no escribe los valores parseados: los defaults se aplican acá.
    const parsed = limit ? Number(limit) : DEFAULT_BRANCH_LIMIT;
    const effective = Math.min(Math.max(parsed, 1), MAX_BRANCH_LIMIT);
    const data = await shipmentDomain.listPickupBranches(postcode.trim(), effective);
    return res.json(ApiResponse.paginated(data, { limit: effective, hasMore: false }));
  } catch (error) {
    next(error);
  }
}
