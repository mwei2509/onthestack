export interface Account {
  id: string;
  displayName: string;
  email: string;
}

export interface Passkey {
  id: string;
  label: string;
  createdAt: string;
  usedAt: string | null;
}
