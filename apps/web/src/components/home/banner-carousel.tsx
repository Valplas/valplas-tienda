'use client';

import * as React from 'react';
import Link from 'next/link';
import { getImageProps } from 'next/image';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildBannerHref } from '@/lib/banners';
import type { PublicBanner } from '@/types';

const AUTOPLAY_DELAY_MS = 5000;
// Las primeras slides cargan sin lazy: el lazy-load en carruseles horizontales
// puede llegar tarde y mostrar la slide vacía al pasar.
const EAGER_SLIDES = 2;

interface BannerSlideProps {
  banner: PublicBanner;
  index: number;
}

/**
 * Art direction: recorte 4:3 en celular y 3:1 en computadora. Sin recorte de
 * celular se usa la imagen de PC encuadrada al centro. El contenedor tiene la
 * proporción fija, así la página no salta al cargar (CLS).
 */
function BannerSlide({ banner, index }: BannerSlideProps) {
  const common = { alt: banner.title, sizes: '(min-width: 1400px) 1400px, 100vw' };

  const {
    props: { srcSet: desktopSrcSet }
  } = getImageProps({
    ...common,
    src: banner.desktopImageUrl,
    width: banner.desktopWidth,
    height: banner.desktopHeight,
    quality: 80
  });

  const {
    props: { srcSet: mobileSrcSet, ...imgProps }
  } = getImageProps({
    ...common,
    src: banner.mobileImageUrl ?? banner.desktopImageUrl,
    width: banner.mobileWidth ?? banner.desktopWidth,
    height: banner.mobileHeight ?? banner.desktopHeight,
    quality: 75,
    loading: index < EAGER_SLIDES ? 'eager' : 'lazy',
    fetchPriority: index === 0 ? 'high' : undefined
  });

  const picture = (
    <picture>
      <source media="(min-width: 768px)" srcSet={desktopSrcSet} />
      <source media="(max-width: 767px)" srcSet={mobileSrcSet} />
      <img {...imgProps} alt={banner.title} className="h-full w-full object-cover" />
    </picture>
  );

  const href = buildBannerHref(banner);

  return href ? (
    <Link href={href} className="block h-full w-full" aria-label={banner.title}>
      {picture}
    </Link>
  ) : (
    picture
  );
}

interface BannerCarouselProps {
  banners: PublicBanner[];
}

export function BannerCarousel({ banners }: BannerCarouselProps) {
  const hasMany = banners.length > 1;
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: hasMany, active: hasMany },
    hasMany
      ? [Autoplay({ delay: AUTOPLAY_DELAY_MS, stopOnInteraction: false, stopOnMouseEnter: true })]
      : []
  );
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  React.useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on('select', onSelect);

    // Respetar "reducir movimiento" del sistema: sin autoplay
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      emblaApi.plugins().autoplay?.stop();
    }

    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Promociones"
      className="relative overflow-hidden rounded-lg bg-muted"
    >
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex">
          {banners.map((banner, index) => (
            <div
              key={banner.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} de ${banners.length}`}
              className="relative aspect-[4/3] min-w-0 shrink-0 grow-0 basis-full md:aspect-[3/1]"
            >
              <BannerSlide banner={banner} index={index} />
            </div>
          ))}
        </div>
      </div>

      {hasMany && (
        <>
          <button
            type="button"
            onClick={() => emblaApi?.scrollPrev()}
            aria-label="Banner anterior"
            className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 shadow transition hover:bg-background md:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => emblaApi?.scrollNext()}
            aria-label="Banner siguiente"
            className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 shadow transition hover:bg-background md:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {banners.map((banner, index) => (
              <button
                key={banner.id}
                type="button"
                onClick={() => emblaApi?.scrollTo(index)}
                aria-label={`Ir al banner ${index + 1}`}
                aria-current={index === selectedIndex}
                // Área táctil de 24px con el punto visible chico
                className="flex h-6 w-6 items-center justify-center"
              >
                <span
                  className={cn(
                    'block h-2 rounded-full bg-white/70 shadow transition-all',
                    index === selectedIndex ? 'w-5 bg-white' : 'w-2'
                  )}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
