# TODO Frontend - Valplas E-commerce

## ⚠️ Issues to Fix

### High Priority

- [ ] Login page: Wrap useSearchParams() in Suspense boundary (Build warning)
- [ ] Add loading states on all data fetch operations
- [ ] Test responsiveness on real mobile devices

### Medium Priority

- [ ] Add useMemo for columns in all DataTable usages (performance)
- [ ] Add keyboard shortcuts (Ctrl+N for new, Escape to close modals)
- [ ] Implement column visibility toggle in DataTable
- [ ] Add search highlighting in DataTable results

### Low Priority

- [ ] Add drag & drop for category reordering
- [ ] Add image upload with real file handling (currently mock URLs)
- [ ] Add export to CSV/Excel for admin tables
- [ ] Add print view for orders

## ✨ Enhancements

### UX Improvements

- [ ] Add loading skeletons for all async operations
- [ ] Add optimistic updates for better perceived performance
- [ ] Add undo toast for destructive actions
- [ ] Add confirmation dialog for unsaved form changes

### Accessibility

- [ ] Full keyboard navigation audit
- [ ] Screen reader testing with NVDA/JAWS
- [ ] Color contrast verification (WCAG AA)
- [ ] Add focus indicators on all interactive elements

### Performance

- [ ] Implement virtual scrolling for large tables (react-virtual)
- [ ] Add image optimization and lazy loading
- [ ] Implement code splitting for admin routes
- [ ] Add service worker for offline support

## 📱 Mobile Experience

- [ ] Test all forms on mobile Safari
- [ ] Verify touch targets are at least 44x44px
- [ ] Test gesture navigation (swipe back, pull to refresh)
- [ ] Add PWA manifest and icons

## 🧪 Testing

- [ ] Add unit tests for all utility functions
- [ ] Add component tests for forms
- [ ] Add integration tests for CRUD operations
- [ ] Add E2E tests for critical user flows
- [ ] Add visual regression tests

## 📦 Next Features (Iteration 2+)

- [ ] Login por teléfono con OTP
- [ ] Login con Google/Facebook (OAuth)
- [ ] Precios por cantidad (tiers)
- [ ] Códigos de descuento
- [ ] Módulo chofer para entregas
- [ ] Privilegios granulares para admins
- [ ] Notificaciones push
- [ ] Chat de soporte

## 🔧 Technical Debt

- [ ] Replace mock localStorage with real API calls
- [ ] Add error boundaries for graceful error handling
- [ ] Implement proper cache invalidation strategy
- [ ] Add request deduplication
- [ ] Add rate limiting for API calls
- [ ] Implement proper authentication with refresh tokens

---

**Última actualización:** 2026-01-26
