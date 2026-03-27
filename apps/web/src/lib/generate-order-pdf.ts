import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import dayjs from 'dayjs';
import type { Order } from './services/orders.service';
import { formatCurrency } from './utils';

// A4: 210 × 297 mm, margins: left=14, right=196
const LEFT_COL = 14;
const RIGHT_COL = 125; // where right block starts
const PAGE_WIDTH = 196;
const LABEL_W = 28; // width of left-column labels ("Dirección: " is the widest)

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
  const ROW_GAP = 3; // mm between rows

  doc.setFontSize(12);

  // Pre-wrap: left block values can be up to RIGHT_COL minus label width
  const leftValueMaxW = RIGHT_COL - LEFT_COL - LABEL_W - 4;
  const nameLines = doc.splitTextToSize(getClientName(order), leftValueMaxW);
  const addrLines = doc.splitTextToSize(getAddress(order), leftValueMaxW);

  // Left block rows (stacked): Cliente → Dirección → Celular
  const row1Y = 32;
  const row2Y = row1Y + nameLines.length * LINE_H + ROW_GAP;
  const row3Y = row2Y + addrLines.length * LINE_H + ROW_GAP;
  const tableStartY = row3Y + (user?.phone ? LINE_H + ROW_GAP : 0);

  // ── Title ──────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(`Orden #${order.order_number}`, LEFT_COL, 20);

  doc.setFontSize(12);

  // ── Left block ─────────────────────────────────────────────────────────────
  // Cliente
  doc.setFont('helvetica', 'bold');
  doc.text('Cliente:', LEFT_COL, row1Y);
  doc.setFont('helvetica', 'normal');
  doc.text(nameLines, LEFT_COL + LABEL_W, row1Y);

  // Dirección
  doc.setFont('helvetica', 'bold');
  doc.text('Dirección:', LEFT_COL, row2Y);
  doc.setFont('helvetica', 'normal');
  doc.text(addrLines, LEFT_COL + LABEL_W, row2Y);

  // Celular
  if (user?.phone) {
    doc.setFont('helvetica', 'bold');
    doc.text('Celular:', LEFT_COL, row3Y);
    doc.setFont('helvetica', 'normal');
    doc.text(user.phone, LEFT_COL + LABEL_W, row3Y);
  }

  // ── Right block (Fecha + Total, top-right) ─────────────────────────────────
  const rightValueX = PAGE_WIDTH; // right-align values to page edge
  doc.setFont('helvetica', 'bold');
  doc.text('Fecha:', RIGHT_COL, row1Y);
  doc.setFont('helvetica', 'normal');
  doc.text(dayjs(order.created_at).format('DD/MM/YYYY'), rightValueX, row1Y, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.text('Total:', RIGHT_COL, row1Y + LINE_H + ROW_GAP);
  doc.setFont('helvetica', 'normal');
  doc.text(formatCurrency(order.total), rightValueX, row1Y + LINE_H + ROW_GAP, {
    align: 'right'
  });

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
