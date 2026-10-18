import { ContractHistoryItem } from '@/types';

const STORAGE_KEY_HISTORY = 'scanhopdong_history_v1';

export function getContractHistory(): ContractHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (!raw) return [];
    const items: ContractHistoryItem[] = JSON.parse(raw);
    return items.sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    console.error('Không thể đọc lịch sử hợp đồng:', err);
    return [];
  }
}

export function saveContractToHistory(item: ContractHistoryItem): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getContractHistory();
    // Prepend new item and keep up to 100 recent items
    const updated = [item, ...current.filter((x) => x.id !== item.id)].slice(0, 100);
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated));
  } catch (err) {
    console.error('Không thể lưu vào lịch sử hợp đồng:', err);
  }
}

export function deleteContractHistoryItem(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getContractHistory();
    const updated = current.filter((x) => x.id !== id);
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated));
  } catch (err) {
    console.error('Không thể xoá mục lịch sử:', err);
  }
}

export function clearContractHistory(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY_HISTORY);
}
