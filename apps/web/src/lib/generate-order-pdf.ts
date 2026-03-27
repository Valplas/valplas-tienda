import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import dayjs from 'dayjs';
import type { Order } from './services/orders.service';
import { formatCurrency } from './utils';

// A4: 210 × 297 mm, margins: left=14, right=196
const LEFT_COL = 14;
const RIGHT_COL = 85;
const PAGE_WIDTH = 196;

function getClientName(order: Order): string {
  const user = order.user;
  if (!user) return order.user_id;
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;
}

function getAddress(order: Order): string {
  const addr = order.shipping_address;
  if (!addr || !addr.street) return 'Sin dirección';
  return [
    `${addr.street} ${addr.street_number}`.trim(),
    addr.floor ? `Piso ${addr.floor}` : null,
    addr.apartment ? `Dpto ${addr.apartment}` : null,
    addr.city,
    addr.province
  ]
    .filter(Boolean)
    .join(', ');
}

function addOrderPage(doc: jsPDF, order: Order) {
  const user = order.user;
  const LINE_H = 5; // mm per text line at 12pt
  const ROW_GAP = 3; // mm between header rows

  doc.setFontSize(12);

  // Pre-wrap text that may overflow
  const nameMaxW = RIGHT_COL - LEFT_COL - 22; // left col minus label width (~49mm)
  const nameLines = doc.splitTextToSize(getClientName(order), nameMaxW);

  const addrMaxW = PAGE_WIDTH - RIGHT_COL - 28; // right col minus label width (~83mm)
  const addrLines = doc.splitTextToSize(getAddress(order), addrMaxW);

  // Dynamic row Y positions — each row is as tall as its tallest content
  const row1H = nameLines.length * LINE_H;
  const row2H = Math.max(addrLines.length, 1) * LINE_H;

  const row1Y = 32;
  const row2Y = row1Y + row1H + ROW_GAP;
  const row3Y = row2Y + row2H + ROW_GAP;
  const tableStartY = row3Y + (user?.phone ? LINE_H + ROW_GAP : 0);

  // ── Title ──────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(`Orden #${order.order_number}`, LEFT_COL, 20);

  // ── 2-column header ────────────────────────────────────────────────────────
  doc.setFontSize(12);

  // Row 1: Cliente / Fecha
  doc.setFont('helvetica', 'bold');
  doc.text('Cliente:', LEFT_COL, row1Y);
  doc.setFont('helvetica', 'normal');
  doc.text(nameLines, LEFT_COL + 22, row1Y);

  doc.setFont('helvetica', 'bold');
  doc.text('Fecha:', RIGHT_COL, row1Y);
  doc.setFont('helvetica', 'normal');
  doc.text(dayjs(order.created_at).format('DD/MM/YYYY'), RIGHT_COL + 20, row1Y);

  // Row 2: Total / Dirección
  doc.setFont('helvetica', 'bold');
  doc.text('Total:', LEFT_COL, row2Y);
  doc.setFont('helvetica', 'normal');
  doc.text(formatCurrency(order.total), LEFT_COL + 22, row2Y);

  doc.setFont('helvetica', 'bold');
  doc.text('Dirección:', RIGHT_COL, row2Y);
  doc.setFont('helvetica', 'normal');
  doc.text(addrLines, RIGHT_COL + 28, row2Y);

  // Row 3: Celular (optional)
  if (user?.phone) {
    doc.setFont('helvetica', 'bold');
    doc.text('Celular:', LEFT_COL, row3Y);
    doc.setFont('helvetica', 'normal');
    doc.text(user.phone, LEFT_COL + 22, row3Y);
  }

  // ── Divider ────────────────────────────────────────────────────────────────
  doc.setDrawColor(200, 200, 200);
  doc.line(LEFT_COL, tableStartY - 3, PAGE_WIDTH, tableStartY - 3);

  // ── Items table ────────────────────────────────────────────────────────────
  const tableRows = (order.items ?? []).map((item) => [
    item.product_sku,
    item.product_name,
    item.quantity,
    formatCurrency(item.unit_price),
    formatCurrency(item.subtotal)
  ]);

  autoTable(doc, {
    startY: tableStartY,
    head: [['Código', 'Producto', 'Cantidad', 'Precio unitario', 'Subtotal']],
    body: tableRows,
    theme: 'grid',
    tableWidth: PAGE_WIDTH - LEFT_COL,
    margin: { left: LEFT_COL },
    styles: {
      fontSize: 11,
      fontStyle: 'bold',
      textColor: '#000000',
      fillColor: [255, 255, 255]
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: '#000000',
      fontStyle: 'bold',
      halign: 'left'
    },
    columnStyles: {
      0: { cellWidth: 22 },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 32, halign: 'right' },
      4: { cellWidth: 32, halign: 'right' }
    },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    foot: [
      [
        { content: 'Total', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: formatCurrency(order.total), styles: { halign: 'right', fontStyle: 'bold' } }
      ]
    ],
    footStyles: { fillColor: [255, 255, 255], textColor: '#000000', fontStyle: 'bold' }
  });
}

function openBlob(doc: jsPDF) {
  const url = URL.createObjectURL(doc.output('blob'));
  window.open(url, '_blank');
}

export function printOrder(order: Order) {
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  addOrderPage(doc, order);
  openBlob(doc);
}

export function printOrders(orders: Order[]) {
  if (orders.length === 0) return;
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  orders.forEach((order, i) => {
    if (i > 0) doc.addPage();
    addOrderPage(doc, order);
  });
  openBlob(doc);
}
