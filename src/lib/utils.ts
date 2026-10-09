import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format angka ke format Indonesia (titik sebagai pemisah ribuan)
export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Format angka qty dengan 3 desimal (sesuai numeric(20,3))
export function formatQty(qty: number): string {
  if (qty % 1 === 0) return qty.toLocaleString('id-ID');
  return qty.toLocaleString('id-ID', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 3,
  });
}

// Tanggal hari ini (YYYY-MM-DD) menurut jam lokal, bukan UTC.
// toISOString() memakai UTC sehingga jam 00.00–07.00 WIB masih terbaca "kemarin".
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Format tanggal ke format Indonesia
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatDateShort(date: string | Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
}

// Format jam saja (HH.MM) — sesuai tampilan iPOS4
export function formatTime(date: string | Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

// Format tanggal + jam (DD/MM/YYYY HH.MM) — untuk field TIMESTAMPTZ dari iPOS4
export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

// Generate DO number: DO-{STORE_CODE}-{YYYYMMDD}-{NNN}
export function generateDoNumber(storeCode: string, sequence: number): string {
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    (today.getMonth() + 1).toString().padStart(2, '0') +
    today.getDate().toString().padStart(2, '0');
  return `DO-${storeCode}-${dateStr}-${sequence.toString().padStart(3, '0')}`;
}
