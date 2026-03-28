import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import dayjs from 'dayjs';
import type { Order } from './services/orders.service';
import { formatCurrency } from './utils';

// A4: 210 × 297 mm, margins: left=14, right=196
const LEFT_COL = 14;
const PAGE_WIDTH = 196;
const LABEL_W = 28; // width of labels ("Dirección: " is the widest)

function getClientName(order: Order): string {
  const user = order.user;
  if (!user) return order.userId;
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

function getAddress(order: Order): string {
  const addr = order.shippingAddress;
  if (!addr || !addr.street) return 'Sin dirección';
  return [
    `${addr.street} ${addr.streetNumber}`.trim(),
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
  const ROW_GAP = 3; // mm between rows

  doc.setFontSize(12);

  // Values span full width minus label
  const valueMaxW = PAGE_WIDTH - LEFT_COL - LABEL_W;
  const nameLines = doc.splitTextToSize(getClientName(order), valueMaxW);
  const addrLines = doc.splitTextToSize(getAddress(order), valueMaxW);

  // Layout:
  //   Title                               Fecha: xx/xx/xxxx   ← title row (y=20)
  //   Cliente:   name...                                       ← row1 (y=32)
  //   Dirección: address...                                    ← row2
  //   Celular:   phone         Total: $ xx.xxx,xx              ← row3
  const row1Y = 32;
  const row2Y = row1Y + nameLines.length * LINE_H + ROW_GAP;
  const row3Y = row2Y + addrLines.length * LINE_H + ROW_GAP;
  const tableStartY = row3Y + LINE_H + ROW_GAP;

  // ── Title line: Orden # (left) + Fecha (right) ─────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Orden #${order.orderNumber}`, LEFT_COL, 20);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Fecha:', PAGE_WIDTH - 45, 20);
  doc.setFont('helvetica', 'normal');
  doc.text(dayjs(order.createdAt).format('DD/MM/YYYY'), PAGE_WIDTH, 20, { align: 'right' });

  doc.setFontSize(12);

  // ── Cliente ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.text('Cliente:', LEFT_COL, row1Y);
  doc.setFont('helvetica', 'normal');
  doc.text(nameLines, LEFT_COL + LABEL_W, row1Y);

  // ── Dirección ──────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.text('Dirección:', LEFT_COL, row2Y);
  doc.setFont('helvetica', 'normal');
  doc.text(addrLines, LEFT_COL + LABEL_W, row2Y);

  // ── Celular (left) + Total (right) on same line ────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.text('Celular:', LEFT_COL, row3Y);
  doc.setFont('helvetica', 'normal');
  doc.text(user?.phone ?? '—', LEFT_COL + LABEL_W, row3Y);

  doc.setFont('helvetica', 'bold');
  doc.text('Total:', PAGE_WIDTH - 45, row3Y);
  doc.setFont('helvetica', 'normal');
  doc.text(formatCurrency(order.total), PAGE_WIDTH, row3Y, { align: 'right' });

  // ── Divider ────────────────────────────────────────────────────────────────
  doc.setDrawColor(200, 200, 200);
  doc.line(LEFT_COL, tableStartY - 3, PAGE_WIDTH, tableStartY - 3);

  // ── Items table ────────────────────────────────────────────────────────────
  const tableRows = (order.items ?? []).map((item) => [
    item.productSku,
    item.productName,
    item.quantity,
    formatCurrency(item.unitPrice),
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
