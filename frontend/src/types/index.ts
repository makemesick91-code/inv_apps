export type Role = 'Kepala_Cabang' | 'Perawat';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_owner?: boolean;
  branch: { id: number; branch_name: string } | null;
  room: {
    id: number;
    room_name: string;
    branch: { id: number; branch_name: string } | null;
  } | null;
}

export interface Branch {
  id: number;
  branch_name: string;
  location: string | null;
}

export interface Room {
  id: number;
  branch_id: number;
  room_name: string;
  branch?: Branch;
}

export type CategoryColor = 'blue' | 'emerald' | 'amber' | 'red' | 'violet' | 'slate';

export interface Category {
  id: number;
  name: string;
  color: CategoryColor;
  items_count?: number;
}

export interface Item {
  id: number;
  item_name: string;
  sku: string | null;
  unit: string;
  min_stock_level: number;
  category_id?: number | null;
  category?: Category | null;
  total_stock?: number | null;
}

export interface Inventory {
  id: number;
  room_id: number;
  item_id: number;
  quantity: number;
  room?: Room;
  item?: Item;
  batches?: InventoryBatch[];
}

export interface InventoryBatch {
  id: number;
  room_id: number;
  item_id: number;
  batch_code: string | null;
  quantity: number;
  expiration_date: string | null;
  room?: Room;
  item?: Item;
}

export interface Transaction {
  id: number;
  batch_id: number;
  user_id: number;
  type: 'in' | 'out';
  quantity: number;
  transaction_date: string;
  notes: string | null;
  batch?: InventoryBatch;
  user?: User;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
}
