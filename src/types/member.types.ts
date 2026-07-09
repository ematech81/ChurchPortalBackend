import { Gender, MaritalStatus, BaptismStatus, MemberStatus } from './enums';

export interface IMember {
  id: string;
  churchId: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  gender?: Gender;
  dateOfBirth?: string;
  maritalStatus?: MaritalStatus;
  occupation?: string;
  photoUrl?: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  status: MemberStatus;
  salvationDate?: string;
  baptismStatus: BaptismStatus;
  baptismDate?: string;
  holyGhostBaptism: boolean;
  membershipDate?: string;
  householdId?: string;
  cellGroupId?: string;
  tags: string[];
  customFields: Record<string, unknown>;
  whatsappOptIn: boolean;
  smsOptIn: boolean;
  createdAt: string;
  updatedAt: string;
}
