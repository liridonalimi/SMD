export type PartnerLookupDto = {
  id: string;
  code: string;
  name: string;
};

export type PartnerRecordDto = {
  id: string;
  code: string;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  note?: string | null;
  isActive: boolean;
};

export type UpsertPartnerDto = {
  code: string;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  note?: string | null;
  isActive?: boolean;
};
