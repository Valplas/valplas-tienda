/**
 * Quantity Selector Component
 * +/- buttons with input for quantity selection
 */

'use client';

import { useState, useEffect } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface QuantitySelectorProps {
  value?: number;
  min?: number;
  max?: number;
  onChange?: (value: number) => void;
  className?: string;
}

export function QuantitySelector({
  value = 1,
  min = 1,
  max = 999,
  onChange,
  className
}: QuantitySelectorProps) {
  const [quantity, setQuantity] = useState(value);

  useEffect(() => {
    setQuantity(value);
  }, [value]);

  const handleIncrement = () => {
    const newValue = Math.min(quantity + 1, max);
    setQuantity(newValue);
    onChange?.(newValue);
  };

  const handleDecrement = () => {
    const newValue = Math.max(quantity - 1, min);
    setQuantity(newValue);
    onChange?.(newValue);
  };

  const handleInputChange = (e: { target: { value: string } }) => {
    const value = e.target.value;

    // Permitir campo vacío mientras escribe
    if (value === '') {
      setQuantity(min);
      return;
    }

    const numValue = parseInt(value, 10);

    if (!isNaN(numValue)) {
      const clamped = Math.max(min, Math.min(numValue, max));
      setQuantity(clamped);
      onChange?.(clamped);
    }
  };

  const handleBlur = () => {
    // Si está vacío al perder foco, setear al mínimo
    if (quantity < min) {
      setQuantity(min);
      onChange?.(min);
    }
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={handleDecrement}
        disabled={quantity <= min}
        aria-label="Disminuir cantidad"
      >
        <Minus className="h-4 w-4" />
      </Button>

      <Input
        type="number"
        value={quantity}
        onChange={handleInputChange}
        onBlur={handleBlur}
        className="h-9 w-16 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        min={min}
        max={max}
        aria-label="Cantidad"
      />

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={handleIncrement}
        disabled={quantity >= max}
        aria-label="Aumentar cantidad"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
