/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shipping Step Component
 * Step 2: Shipping method selection
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { ShippingOption } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { formatPrice } from '@/lib/formatters';
import { Loader2, Truck } from 'lucide-react';
import { quoteShipping } from '@/services';
import { toast } from 'sonner';

interface ShippingStepProps {
  postcode: string;
  cartTotal: number;
  onNext: (option: ShippingOption) => void;
  onBack: () => void;
}

const FREE_SHIPPING_THRESHOLD = 10000;

export function ShippingStep({ postcode, cartTotal, onNext, onBack }: ShippingStepProps) {
  const [options, setOptions] = useState<ShippingOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<ShippingOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadShippingOptions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await quoteShipping({
        postalCode: postcode,
        cartTotal
      });

      if (response.success && response.data) {
        // Map service rates to ShippingOptions
        const mappedOptions: ShippingOption[] = response.data.rates.map((rate) => ({
          carrierId: rate.carrier.id,
          carrierName: rate.carrier.name,
          cost: rate.cost,
          estimatedDays: parseInt(rate.estimatedDays.split('-')[0])
        }));

        setOptions(mappedOptions);
        // Auto-select first option
        if (mappedOptions.length > 0) {
          setSelectedOption(mappedOptions[0]);
        }
      } else {
        setError(response.error?.message || 'Error al cargar opciones de envío');
        toast.error(response.error?.message || 'Error al cargar opciones de envío');
      }
    } catch (error: any) {
      const errorMsg = error?.message || 'Error al cargar opciones de envío';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [postcode, cartTotal]);

  useEffect(() => {
    loadShippingOptions();
  }, [loadShippingOptions]);

  const handleNext = () => {
    if (selectedOption) {
      onNext(selectedOption);
    }
  };

  const isFreeShipping = cartTotal >= FREE_SHIPPING_THRESHOLD;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Método de envío</h2>
        <p className="text-muted-foreground text-sm">Seleccioná cómo querés recibir tu pedido</p>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <Card className="border-destructive">
          <CardContent className="p-6 text-center">
            <p className="text-destructive font-medium mb-2">{error}</p>
            <p className="text-sm text-muted-foreground">
              Por favor, verificá el código postal o contactanos para más información
            </p>
          </CardContent>
        </Card>
      )}

      {/* Shipping Options */}
      {!loading && !error && options.length > 0 && (
        <RadioGroup
          value={selectedOption?.carrierId}
          onValueChange={(value) => {
            const option = options.find((opt) => opt.carrierId === value);
            if (option) setSelectedOption(option);
          }}
        >
          <div className="space-y-3">
            {options.map((option) => {
              const displayCost = isFreeShipping ? 0 : option.cost;

              return (
                <div key={option.carrierId} className="flex items-start space-x-3">
                  <RadioGroupItem value={option.carrierId} id={option.carrierId} className="mt-1" />
                  <Label htmlFor={option.carrierId} className="flex-1 cursor-pointer">
                    <Card className="hover:border-primary transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-full bg-primary/10">
                              <Truck className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <div className="font-medium">{option.carrierName}</div>
                              <div className="text-sm text-muted-foreground mt-1">
                                Entrega en {option.estimatedDays}{' '}
                                {option.estimatedDays === 1 ? 'día hábil' : 'días hábiles'}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            {isFreeShipping ? (
                              <div className="font-semibold text-green-600">Gratis</div>
                            ) : displayCost === 0 ? (
                              <div className="font-semibold text-green-600">Gratis</div>
                            ) : (
                              <div className="font-semibold">{formatPrice(displayCost)}</div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Label>
                </div>
              );
            })}
          </div>
        </RadioGroup>
      )}

      {/* Free Shipping Badge */}
      {!loading && !error && isFreeShipping && (
        <div className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          ¡Tu pedido califica para envío gratis!
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <Button type="button" variant="outline" onClick={onBack}>
          Volver
        </Button>
        <Button type="button" onClick={handleNext} disabled={!selectedOption || loading}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
