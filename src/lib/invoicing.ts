import { supabase } from './supabase';
import { Sale, Product } from '../types';

export interface DocumentMetadata {
  businessId: string;
  customerId?: string;
  cashierId: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  businessName: string;
  businessAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  businessLogoUrl?: string;
  tableNumber?: string;
  guests?: number;
}

export interface InvoiceData {
  id: string;
  invoiceNumber: string;
  documentType: 'proforma' | 'invoice' | 'receipt';
  invoiceDate: string;
  dueDate?: string;
  paidDate?: string;
  customerName: string;
  customerPhone?: string;
  businessName: string;
  items: InvoiceItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  customerEmail?: string; // Added customerEmail to InvoiceData interface
  discount: number;
  grandTotal: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid' | 'overdue';
  paymentMethod?: string;
  transactionReference?: string;
  amountPaid?: number;
  balanceAmount?: number;
  termsConditions?: string;
  notes?: string;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  itemTotal: number;
}

/**
 * Create a proforma invoice from a sale
 */
export async function createProformaInvoice(
  sale: Sale & { items?: any[]; customer?: any },
  business: any,
  user: any,
  taxRate: number = 18
) {
  try {
    const invoiceNumber = await generateDocumentNumber(business.id, 'proforma');
    const subtotal = sale.subtotal || 0;
    const taxAmount = (subtotal * taxRate) / 100;
    const discount = sale.discount || 0;
    const grandTotal = subtotal + taxAmount - discount;

    const { data, error } = await supabase.from('invoices').insert({
      business_id: business.id,
      sale_id: sale.id,
      customer_id: sale.customer_id,
      cashier_id: user.id,
      document_type: 'proforma',
      invoice_number: invoiceNumber,
      invoice_date: new Date().toISOString(),
      customer_name: sale.customer?.full_name || 'Walk-in Customer',
      customer_phone: sale.customer?.phone,
      customer_email: sale.customer?.email,
      customer_address: sale.customer?.address,
      business_name: business.name,
      business_address: business.address,
      business_phone: business.phone,
      business_email: business.email,
      business_logo_url: business.logo_url,
      table_number: sale.table_number,
      guests: sale.guests || 1,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      discount,
      grand_total: grandTotal,
      payment_status: 'unpaid',
      terms_conditions: 'This is not a payment receipt. Payment is required to convert to official invoice.',
    }).select().single();

    if (error) throw error;

    // Create invoice items from sale items
    if (sale.items && sale.items.length > 0) {
      const invoiceItems = sale.items.map((item: any) => ({
        invoice_id: data.id,
        product_id: item.product_id,
        description: item.product?.name || 'Item',
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount || 0,
        item_total: item.total,
      }));

      await supabase.from('invoice_items').insert(invoiceItems);
    }

    return data;
  } catch (error: any) {
    throw new Error(`Failed to create proforma: ${error.message}`);
  }
}

/**
 * Convert proforma to invoice
 */
export async function convertProformaToInvoice(
  proformaId: string,
  dueDateDays: number = 30
) {
  try {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueDateDays);

    const { data, error } = await supabase.rpc('convert_proforma_to_invoice', {
      p_proforma_id: proformaId,
      p_new_due_date: dueDate.toISOString(),
    });

    if (error) throw error;
    return data;
  } catch (error: any) {
    throw new Error(`Failed to convert proforma: ${error.message}`);
  }
}

/**
 * Mark invoice as paid and create receipt
 */
export async function markInvoicePaid(
  invoiceId: string,
  paymentMethod: string,
  amountPaid: number,
  transactionReference?: string
) {
  try {
    const { data, error } = await supabase.rpc('mark_invoice_paid', {
      p_invoice_id: invoiceId,
      p_payment_method: paymentMethod,
      p_amount_paid: amountPaid,
      p_transaction_reference: transactionReference,
    });

    if (error) throw error;
    return data;
  } catch (error: any) {
    throw new Error(`Failed to mark invoice paid: ${error.message}`);
  }
}

/**
 * Generate unique document number
 */
export async function generateDocumentNumber(
  businessId: string,
  documentType: 'proforma' | 'invoice' | 'receipt'
): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('get_next_document_number', {
      p_business_id: businessId,
      p_doc_type: documentType,
    });

    if (error) throw error;
    return data;
  } catch (error: any) {
    throw new Error(`Failed to generate document number: ${error.message}`);
  }
}

/**
 * Format currency value
 */
export function formatCurrency(amount: number, currency: string = 'TZS'): string {
  const symbols: Record<string, string> = {
    TZS: 'Tsh',
    USD: '$',
    EUR: '€',
    GBP: '£',
  };
  const symbol = symbols[currency] || currency;
  return `${symbol} ${Number(amount).toLocaleString()}`;
}

/**
 * Fetch invoice with items
 */
export async function fetchInvoiceWithItems(invoiceId: string) {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', invoiceId)
      .single();

    if (error) throw error;
    return data;
  } catch (error: any) {
    throw new Error(`Failed to fetch invoice: ${error.message}`);
  }
}

/**
 * Fetch receipt with items
 */
export async function fetchReceiptWithItems(receiptId: string) {
  try {
    const { data, error } = await supabase
      .from('receipts')
      .select('*, receipt_items(*)')
      .eq('id', receiptId)
      .single();

    if (error) throw error;
    return data;
  } catch (error: any) {
    throw new Error(`Failed to fetch receipt: ${error.message}`);
  }
}

/**
 * Search invoices
 */
export async function searchInvoices(
  businessId: string,
  query?: string,
  filters?: {
    documentType?: string;
    paymentStatus?: string;
    dateFrom?: string;
    dateTo?: string;
  }
) {
  try {
    let q = supabase
      .from('invoices')
      .select('*')
      .eq('business_id', businessId);

    if (filters?.documentType) {
      q = q.eq('document_type', filters.documentType);
    }

    if (filters?.paymentStatus) {
      q = q.eq('payment_status', filters.paymentStatus);
    }

    if (filters?.dateFrom) {
      q = q.gte('created_at', filters.dateFrom);
    }

    if (filters?.dateTo) {
      q = q.lte('created_at', filters.dateTo);
    }

    if (query) {
      q = q.or(
        `invoice_number.ilike.%${query}%,customer_name.ilike.%${query}%,customer_phone.ilike.%${query}%`
      );
    }

    const { data, error } = await q.order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  } catch (error: any) {
    throw new Error(`Failed to search invoices: ${error.message}`);
  }
}

/**
 * Get invoice statistics
 */
export async function getInvoiceStats(businessId: string, dateFrom?: string, dateTo?: string) {
  try {
    let q = supabase
      .from('invoices')
      .select('payment_status, grand_total', { count: 'exact' })
      .eq('business_id', businessId);

    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo) q = q.lte('created_at', dateTo);

    const { data, error } = await q;

    if (error) throw error;

    const stats = {
      totalInvoices: data?.length || 0,
      totalRevenue: (data || []).reduce((sum: number, inv: any) => sum + Number(inv.grand_total), 0),
      paidInvoices: (data || []).filter((inv: any) => inv.payment_status === 'paid').length,
      unpaidInvoices: (data || []).filter((inv: any) => inv.payment_status === 'unpaid').length,
      partialInvoices: (data || []).filter((inv: any) => inv.payment_status === 'partial').length,
    };

    return stats;
  } catch (error: any) {
    throw new Error(`Failed to get statistics: ${error.message}`);
  }
}

/**
 * Export invoice to PDF HTML
 */
export function buildInvoiceHtml(invoice: InvoiceData, currency: string = 'TZS'): string {
  const itemRows = (invoice.items || [])
    .map(
      (item: InvoiceItem) => `
    <tr>
      <td>${escapeHtml(item.description)}</td>
      <td style="text-align:center;">${Number(item.quantity).toFixed(2)}</td>
      <td style="text-align:right;">${formatCurrency(item.unitPrice, currency)}</td>
      <td style="text-align:right;">${formatCurrency(item.itemTotal, currency)}</td>
    </tr>
  `
    )
    .join('');

  const typeLabel = {
    proforma: 'PROFORMA INVOICE',
    invoice: 'TAX INVOICE',
    receipt: 'PAYMENT RECEIPT',
  }[invoice.documentType];

  const warningMessage =
    invoice.documentType === 'proforma'
      ? '<div class="warning">⚠️ This is not a payment receipt. Payment is required to convert to official invoice.</div>'
      : '';

  const thankYouMessage =
    invoice.documentType === 'receipt'
      ? '<div class="thank-you">Thank you for your business!</div>'
      : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: #111827;
          padding: 40px;
          margin: 0;
          background: #fff;
        }
        .container { max-width: 800px; margin: 0 auto; }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding-bottom: 24px;
          border-bottom: 2px solid #E5E7EB;
          margin-bottom: 24px;
        }
        .business-info h1 { margin: 0; font-size: 28px; color: #1F2937; }
        .business-info p { margin: 4px 0; color: #6B7280; font-size: 14px; }
        .doc-title {
          font-size: 24px;
          font-weight: 700;
          color: #1F2937;
          margin: 0;
          text-align: right;
        }
        .doc-meta {
          font-size: 12px;
          color: #6B7280;
          text-align: right;
          margin-top: 8px;
        }
        .warning {
          background: #FEF3C7;
          border: 1px solid #FCD34D;
          color: #92400E;
          padding: 12px;
          border-radius: 6px;
          margin: 16px 0;
          font-weight: 600;
        }
        .thank-you {
          background: #D1FAE5;
          border: 1px solid #6EE7B7;
          color: #065F46;
          padding: 16px;
          border-radius: 6px;
          text-align: center;
          margin: 16px 0;
          font-weight: 600;
          font-size: 16px;
        }
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-bottom: 24px;
        }
        .grid-item { }
        .grid-label { font-size: 12px; font-weight: 600; color: #6B7280; text-transform: uppercase; margin-bottom: 4px; }
        .grid-value { font-size: 14px; color: #1F2937; }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 24px 0;
        }
        th {
          background: #F3F4F6;
          padding: 12px;
          text-align: left;
          font-size: 12px;
          font-weight: 600;
          color: #374151;
          border-bottom: 1px solid #E5E7EB;
        }
        td {
          padding: 12px;
          border-bottom: 1px solid #E5E7EB;
          font-size: 14px;
        }
        .totals-section {
          margin-top: 24px;
          float: right;
          width: 300px;
        }
        .total-line {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          font-size: 13px;
        }
        .total-label { color: #6B7280; }
        .total-value { color: #111827; font-weight: 600; }
        .total-final {
          border-top: 2px solid #374151;
          padding-top: 8px;
          margin-top: 8px;
          font-size: 16px;
          font-weight: 700;
        }
        .payment-info {
          margin-top: 16px;
          padding: 12px;
          background: #F9FAFB;
          border-radius: 6px;
          font-size: 12px;
        }
        .payment-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          background: #DDD6FE;
          color: #4F46E5;
        }
        .payment-badge.paid { background: #D1FAE5; color: #065F46; }
        .payment-badge.unpaid { background: #FED7AA; color: #92400E; }
        .payment-badge.partial { background: #BFE7FF; color: #0369A1; }
        .footer {
          margin-top: 32px;
          padding-top: 16px;
          border-top: 1px solid #E5E7EB;
          text-align: center;
          font-size: 11px;
          color: #6B7280;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="business-info">
            <h1>${escapeHtml(invoice.businessName)}</h1>
            ${invoice.customerName ? `<p><strong>Bill To:</strong> ${escapeHtml(invoice.customerName)}</p>` : ''}
            ${invoice.customerPhone ? `<p>Phone: ${escapeHtml(invoice.customerPhone)}</p>` : ''}
          </div>
          <div>
            <h2 class="doc-title">${typeLabel}</h2>
            <div class="doc-meta">
              <div><strong>#${escapeHtml(invoice.invoiceNumber)}</strong></div>
              <div>Date: ${new Date(invoice.invoiceDate).toLocaleDateString()}</div>
              ${invoice.dueDate ? `<div>Due: ${new Date(invoice.dueDate).toLocaleDateString()}</div>` : ''}
            </div>
          </div>
        </div>

        ${warningMessage}

        <div class="grid-2">
          <div>
            <div class="grid-label">Bill To</div>
            <div class="grid-value">${escapeHtml(invoice.customerName)}</div>
            ${invoice.customerPhone ? `<div class="grid-value">${escapeHtml(invoice.customerPhone)}</div>` : ''}
            ${invoice.customerEmail ? `<div class="grid-value">${escapeHtml(invoice.customerEmail)}</div>` : ''}
          </div>
          <div>
            <div class="grid-label">Payment Status</div>
            <div class="grid-value">
              <span class="payment-badge ${invoice.paymentStatus}">
                ${invoice.paymentStatus.charAt(0).toUpperCase() + invoice.paymentStatus.slice(1)}
              </span>
            </div>
            ${invoice.paymentMethod ? `<div class="grid-value" style="margin-top: 8px;">Method: ${escapeHtml(invoice.paymentMethod)}</div>` : ''}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 50%;">Description</th>
              <th style="width: 15%; text-align: center;">Qty</th>
              <th style="width: 17%; text-align: right;">Unit Price</th>
              <th style="width: 18%; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows || '<tr><td colspan="4" style="text-align: center; color: #9CA3AF;">No items</td></tr>'}
          </tbody>
        </table>

        <div class="totals-section">
          <div class="total-line">
            <span class="total-label">Subtotal:</span>
            <span class="total-value">${formatCurrency(invoice.subtotal, currency)}</span>
          </div>
          ${invoice.taxRate > 0 ? `
            <div class="total-line">
              <span class="total-label">Tax (${invoice.taxRate}%):</span>
              <span class="total-value">${formatCurrency(invoice.taxAmount, currency)}</span>
            </div>
          ` : ''}
          ${invoice.discount > 0 ? `
            <div class="total-line">
              <span class="total-label">Discount:</span>
              <span class="total-value" style="color: #059669;">-${formatCurrency(invoice.discount, currency)}</span>
            </div>
          ` : ''}
          <div class="total-line total-final">
            <span class="total-label">Total:</span>
            <span class="total-value">${formatCurrency(invoice.grandTotal, currency)}</span>
          </div>
        </div>

        <div style="clear: both;"></div>

        ${
          invoice.documentType === 'receipt'
            ? `
          <div class="payment-info">
            <strong>Payment Received</strong><br />
            Amount Paid: ${formatCurrency(invoice.amountPaid || invoice.grandTotal, currency)}<br />
            ${invoice.balanceAmount ? `Balance: ${formatCurrency(invoice.balanceAmount, currency)}<br />` : ''}
            ${invoice.transactionReference ? `Reference: ${escapeHtml(invoice.transactionReference)}<br />` : ''}
          </div>
        `
            : ''
        }

        ${thankYouMessage}

        ${invoice.notes ? `<p style="margin: 16px 0; padding: 12px; background: #F9FAFB; border-left: 3px solid #E5E7EB;">${escapeHtml(invoice.notes)}</p>` : ''}

        <div class="footer">
          <p>Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
          ${invoice.termsConditions ? `<p>${escapeHtml(invoice.termsConditions)}</p>` : ''}
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
