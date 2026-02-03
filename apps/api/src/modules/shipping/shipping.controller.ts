// apps/api/src/modules/shipping/shipping.controller.ts

import type { Request, Response, NextFunction } from 'express';
import * as shippingDomain from './shipping.domain.js';
import { ApiResponseBuilder as ApiResponse } from '../../shared/utils/api-response.js';

// ============= SHIPPING ZONES =============

export async function getAllZones(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, is_active } = req.query;

    const result = await shippingDomain.getAllZones({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined
    });

    return res.json(
      ApiResponse.paginated(result.zones, Number(page) || 1, Number(limit) || 20, result.total)
    );
  } catch (error) {
    next(error);
  }
}

export async function getZoneById(req: Request, res: Response, next: NextFunction) {
  try {
    const zone = await shippingDomain.getZoneById(req.params.id as string as string);
    return res.json(ApiResponse.success(zone));
  } catch (error) {
    next(error);
  }
}

export async function createZone(req: Request, res: Response, next: NextFunction) {
  try {
    const zone = await shippingDomain.createZone(req.body);
    return res.status(201).json(ApiResponse.success(zone));
  } catch (error) {
    next(error);
  }
}

export async function updateZone(req: Request, res: Response, next: NextFunction) {
  try {
    const zone = await shippingDomain.updateZone(req.params.id as string as string, req.body);
    return res.json(ApiResponse.success(zone));
  } catch (error) {
    next(error);
  }
}

export async function deleteZone(req: Request, res: Response, next: NextFunction) {
  try {
    await shippingDomain.deleteZone(req.params.id as string as string);
    return res.json(ApiResponse.success({ message: 'Zona eliminada correctamente' }));
  } catch (error) {
    next(error);
  }
}

// ============= SHIPPING CARRIERS =============

export async function getAllCarriers(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, is_active } = req.query;

    const result = await shippingDomain.getAllCarriers({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined
    });

    return res.json(
      ApiResponse.paginated(
        result.carriers,
        Number(page) || 1,
        Number(limit) || 20,
        result.total
      )
    );
  } catch (error) {
    next(error);
  }
}

export async function getCarrierById(req: Request, res: Response, next: NextFunction) {
  try {
    const carrier = await shippingDomain.getCarrierById(req.params.id as string as string);
    return res.json(ApiResponse.success(carrier));
  } catch (error) {
    next(error);
  }
}

export async function createCarrier(req: Request, res: Response, next: NextFunction) {
  try {
    const carrier = await shippingDomain.createCarrier(req.body);
    return res.status(201).json(ApiResponse.success(carrier));
  } catch (error) {
    next(error);
  }
}

export async function updateCarrier(req: Request, res: Response, next: NextFunction) {
  try {
    const carrier = await shippingDomain.updateCarrier(req.params.id as string as string, req.body);
    return res.json(ApiResponse.success(carrier));
  } catch (error) {
    next(error);
  }
}

export async function deleteCarrier(req: Request, res: Response, next: NextFunction) {
  try {
    await shippingDomain.deleteCarrier(req.params.id as string as string);
    return res.json(ApiResponse.success({ message: 'Transportista eliminado correctamente' }));
  } catch (error) {
    next(error);
  }
}

// ============= SHIPPING RATES =============

export async function getAllRates(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, zone_id, carrier_id, is_active } = req.query;

    const result = await shippingDomain.getAllRates({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      zone_id: zone_id as string,
      carrier_id: carrier_id as string,
      is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined
    });

    return res.json(
      ApiResponse.paginated(result.rates, Number(page) || 1, Number(limit) || 20, result.total)
    );
  } catch (error) {
    next(error);
  }
}

export async function getRateById(req: Request, res: Response, next: NextFunction) {
  try {
    const rate = await shippingDomain.getRateById(req.params.id as string as string);
    return res.json(ApiResponse.success(rate));
  } catch (error) {
    next(error);
  }
}

export async function createRate(req: Request, res: Response, next: NextFunction) {
  try {
    const rate = await shippingDomain.createRate(req.body);
    return res.status(201).json(ApiResponse.success(rate));
  } catch (error) {
    next(error);
  }
}

export async function updateRate(req: Request, res: Response, next: NextFunction) {
  try {
    const rate = await shippingDomain.updateRate(req.params.id as string as string, req.body);
    return res.json(ApiResponse.success(rate));
  } catch (error) {
    next(error);
  }
}

export async function deleteRate(req: Request, res: Response, next: NextFunction) {
  try {
    await shippingDomain.deleteRate(req.params.id as string as string);
    return res.json(ApiResponse.success({ message: 'Tarifa eliminada correctamente' }));
  } catch (error) {
    next(error);
  }
}

// ============= SHIPPING QUOTES =============

export async function getShippingQuote(req: Request, res: Response, next: NextFunction) {
  try {
    const { postcode, cart_total } = req.query;

    const quotes = await shippingDomain.getShippingQuote({
      postcode: postcode as string,
      cart_total: Number(cart_total)
    });

    return res.json(ApiResponse.success(quotes));
  } catch (error) {
    next(error);
  }
}
