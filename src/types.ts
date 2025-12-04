export interface FineRecord {
  fine_reference: string | null;
  firm_individual: string;
  firm_category: string | null;
  regulator: string;
  final_notice_url: string;
  summary: string;
  breach_type: string | null;
  breach_categories: string[];
  amount: number;
  date_issued: string;
  year_issued: number;
  month_issued: number;
}

export interface StatsResponse {
  success: boolean;
  data: {
    totalFines: number;
    totalAmount: number;
    avgAmount: number;
    maxFine: number;
    maxFirmName: string | null;
    dominantBreach: string | null;
  };
}

export interface TrendsResponse {
  success: boolean;
  data: Array<{
    period_type: string;
    year: number;
    period_value: number;
    fine_count: number;
    total_fines: number;
    average_fine: number;
  }>;
}

export interface ListResponse {
  success: boolean;
  data: FineRecord[];
}

export interface NotificationsResponse {
  success: boolean;
  data: Array<{
    id: string;
    title: string;
    detail: string;
    time: string;
    read?: boolean;
  }>;
}

export interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  time: string;
  read?: boolean;
}
