/**
 * Footer Component
 * Main footer with contact info, links, and copyright
 */

import Link from 'next/link';
import { Mail, Phone, MapPin } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Company Info */}
          <div>
            <h3 className="mb-4 text-lg font-semibold">Valplas</h3>
            <p className="text-sm text-muted-foreground">
              Distribuidora de artículos plásticos, productos de limpieza y electrodomésticos.
            </p>
          </div>

          {/* Contact */}
          <div>
            <h3 className="mb-4 text-lg font-semibold">Contacto</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <a href="tel:+541122334455" className="hover:text-foreground">
                  +54 11 2233-4455
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <a href="mailto:contacto@valplas.net" className="hover:text-foreground">
                  contacto@valplas.net
                </a>
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>Buenos Aires, Argentina</span>
              </li>
            </ul>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="mb-4 text-lg font-semibold">Enlaces</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/productos" className="hover:text-foreground">
                  Productos
                </Link>
              </li>
              <li>
                <span className="cursor-not-allowed opacity-50">Sobre Nosotros</span>
              </li>
              <li>
                <span className="cursor-not-allowed opacity-50">Contacto</span>
              </li>
              <li>
                <span className="cursor-not-allowed opacity-50">Preguntas Frecuentes</span>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="mb-4 text-lg font-semibold">Legal</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <span className="cursor-not-allowed opacity-50">Términos y Condiciones</span>
              </li>
              <li>
                <span className="cursor-not-allowed opacity-50">Política de Privacidad</span>
              </li>
              <li>
                <span className="cursor-not-allowed opacity-50">Política de Envíos</span>
              </li>
              <li>
                <span className="cursor-not-allowed opacity-50">Devoluciones</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-8 border-t pt-8 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Valplas. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
