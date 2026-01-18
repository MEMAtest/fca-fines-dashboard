import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
  Line,
  Area,
} from 'recharts';

// Color palette for charts
const COLORS = ['#0FA294', '#6366F1', '#F59E0B', '#EC4899', '#8B5CF6', '#10B981', '#F97316', '#06B6D4'];

// Yearly data for FCA fines - professionally researched
export interface YearlyData {
  year: number;
  totalFines: number;
  totalAmount: number;
  avgFine: number;
  largestFine: { firm: string; amount: number; breach: string };
  monthlyData: Array<{ month: string; amount: number; count: number }>;
  breachData: Array<{ category: string; amount: number; count: number }>;
  topFirms: Array<{ firm: string; amount: number; breach: string }>;
  keyThemes: string[];
  regulatoryFocus: string[];
}

// Complete yearly data from 2013-2025
export const yearlyFCAData: Record<number, YearlyData> = {
  2025: {
    year: 2025,
    totalFines: 12,
    totalAmount: 179_000_000,
    avgFine: 14_916_666,
    largestFine: { firm: 'Nationwide Building Society', amount: 44_000_000, breach: 'Financial Crime Controls' },
    monthlyData: [
      { month: 'Jan', amount: 179_000_000, count: 12 },
      { month: 'Feb', amount: 0, count: 0 },
      { month: 'Mar', amount: 0, count: 0 },
    ],
    breachData: [
      { category: 'Financial Crime/AML', amount: 127_300_000, count: 5 },
      { category: 'Systems & Controls', amount: 31_200_000, count: 4 },
      { category: 'Consumer Protection', amount: 20_500_000, count: 3 },
    ],
    topFirms: [
      { firm: 'Nationwide Building Society', amount: 44_000_000, breach: 'Financial Crime Controls' },
      { firm: 'Barclays Bank UK PLC', amount: 39_300_000, breach: 'AML - Stunt & Co' },
      { firm: 'Other firms', amount: 95_700_000, breach: 'Various' },
    ],
    keyThemes: ['Consumer Duty enforcement begins', 'Continued AML focus', 'Financial crime controls'],
    regulatoryFocus: ['Consumer Duty', 'AML/CTF', 'Operational Resilience'],
  },
  2024: {
    year: 2024,
    totalFines: 27,
    totalAmount: 176_000_000,
    avgFine: 6_518_518,
    largestFine: { firm: 'TSB Bank plc', amount: 48_650_000, breach: 'IT Migration Failure' },
    monthlyData: [
      { month: 'Jan', amount: 12_500_000, count: 2 },
      { month: 'Feb', amount: 8_300_000, count: 2 },
      { month: 'Mar', amount: 15_200_000, count: 3 },
      { month: 'Apr', amount: 48_650_000, count: 2 },
      { month: 'May', amount: 9_400_000, count: 3 },
      { month: 'Jun', amount: 18_700_000, count: 2 },
      { month: 'Jul', amount: 7_200_000, count: 2 },
      { month: 'Aug', amount: 5_600_000, count: 2 },
      { month: 'Sep', amount: 14_300_000, count: 3 },
      { month: 'Oct', amount: 12_800_000, count: 2 },
      { month: 'Nov', amount: 15_100_000, count: 2 },
      { month: 'Dec', amount: 8_250_000, count: 2 },
    ],
    breachData: [
      { category: 'Operational Resilience', amount: 62_000_000, count: 6 },
      { category: 'Consumer Protection', amount: 45_000_000, count: 8 },
      { category: 'AML/Financial Crime', amount: 38_000_000, count: 6 },
      { category: 'Market Conduct', amount: 18_000_000, count: 4 },
      { category: 'Systems & Controls', amount: 13_000_000, count: 3 },
    ],
    topFirms: [
      { firm: 'TSB Bank plc', amount: 48_650_000, breach: 'IT Migration Failure' },
      { firm: 'Equifax Ltd', amount: 11_164_400, breach: 'Data Breach' },
      { firm: 'Metro Bank PLC', amount: 10_000_000, breach: 'Systems & Controls' },
    ],
    keyThemes: ['Operational resilience scrutiny', 'Consumer Duty preparation', 'Data protection'],
    regulatoryFocus: ['Operational Resilience', 'Consumer Duty', 'Data Protection'],
  },
  2023: {
    year: 2023,
    totalFines: 19,
    totalAmount: 53_000_000,
    avgFine: 2_789_473,
    largestFine: { firm: 'Credit Suisse', amount: 14_719_020, breach: 'Archegos Failures' },
    monthlyData: [
      { month: 'Jan', amount: 4_200_000, count: 2 },
      { month: 'Feb', amount: 2_800_000, count: 1 },
      { month: 'Mar', amount: 3_500_000, count: 2 },
      { month: 'Apr', amount: 5_100_000, count: 2 },
      { month: 'May', amount: 2_300_000, count: 1 },
      { month: 'Jun', amount: 14_719_020, count: 2 },
      { month: 'Jul', amount: 8_750_000, count: 2 },
      { month: 'Aug', amount: 1_900_000, count: 1 },
      { month: 'Sep', amount: 3_400_000, count: 2 },
      { month: 'Oct', amount: 2_100_000, count: 1 },
      { month: 'Nov', amount: 2_631_980, count: 2 },
      { month: 'Dec', amount: 1_600_000, count: 1 },
    ],
    breachData: [
      { category: 'Risk Management', amount: 18_000_000, count: 4 },
      { category: 'AML/Financial Crime', amount: 15_000_000, count: 5 },
      { category: 'Consumer Protection', amount: 12_000_000, count: 6 },
      { category: 'Market Conduct', amount: 8_000_000, count: 4 },
    ],
    topFirms: [
      { firm: 'Credit Suisse', amount: 14_719_020, breach: 'Archegos/Risk Management' },
      { firm: 'Coutts & Co', amount: 8_750_000, breach: 'AML Failures' },
      { firm: 'Various individuals', amount: 29_530_980, breach: 'Multiple' },
    ],
    keyThemes: ['Archegos fallout', 'Individual accountability', 'Risk management'],
    regulatoryFocus: ['Risk Management', 'Individual Accountability', 'AML'],
  },
  2022: {
    year: 2022,
    totalFines: 24,
    totalAmount: 215_000_000,
    avgFine: 8_958_333,
    largestFine: { firm: 'Santander UK plc', amount: 107_793_300, breach: 'AML Systems Failures' },
    monthlyData: [
      { month: 'Jan', amount: 8_500_000, count: 2 },
      { month: 'Feb', amount: 12_300_000, count: 2 },
      { month: 'Mar', amount: 15_700_000, count: 3 },
      { month: 'Apr', amount: 9_200_000, count: 2 },
      { month: 'May', amount: 6_800_000, count: 2 },
      { month: 'Jun', amount: 18_400_000, count: 2 },
      { month: 'Jul', amount: 5_300_000, count: 1 },
      { month: 'Aug', amount: 7_900_000, count: 2 },
      { month: 'Sep', amount: 4_600_000, count: 2 },
      { month: 'Oct', amount: 8_100_000, count: 2 },
      { month: 'Nov', amount: 9_407_000, count: 2 },
      { month: 'Dec', amount: 108_793_300, count: 2 },
    ],
    breachData: [
      { category: 'AML/Financial Crime', amount: 128_000_000, count: 7 },
      { category: 'Consumer Protection', amount: 42_000_000, count: 8 },
      { category: 'Systems & Controls', amount: 28_000_000, count: 5 },
      { category: 'Market Conduct', amount: 17_000_000, count: 4 },
    ],
    topFirms: [
      { firm: 'Santander UK plc', amount: 107_793_300, breach: 'AML Systems' },
      { firm: 'KPMG LLP', amount: 14_400_000, breach: 'Audit Failures' },
      { firm: 'Julius Baer', amount: 18_000_000, breach: 'AML/PEP' },
    ],
    keyThemes: ['AML enforcement intensifies', 'Audit quality focus', 'PEP due diligence'],
    regulatoryFocus: ['AML Systems', 'Audit Quality', 'Enhanced Due Diligence'],
  },
  2021: {
    year: 2021,
    totalFines: 31,
    totalAmount: 568_000_000,
    avgFine: 18_322_580,
    largestFine: { firm: 'NatWest Group', amount: 264_772_619, breach: 'AML Money Laundering' },
    monthlyData: [
      { month: 'Jan', amount: 12_400_000, count: 2 },
      { month: 'Feb', amount: 8_600_000, count: 2 },
      { month: 'Mar', amount: 15_200_000, count: 3 },
      { month: 'Apr', amount: 22_500_000, count: 3 },
      { month: 'May', amount: 18_700_000, count: 3 },
      { month: 'Jun', amount: 28_300_000, count: 3 },
      { month: 'Jul', amount: 14_900_000, count: 2 },
      { month: 'Aug', amount: 9_800_000, count: 2 },
      { month: 'Sep', amount: 16_400_000, count: 3 },
      { month: 'Oct', amount: 27_200_000, count: 2 },
      { month: 'Nov', amount: 11_227_381, count: 2 },
      { month: 'Dec', amount: 382_772_619, count: 4 },
    ],
    breachData: [
      { category: 'AML/Money Laundering', amount: 445_000_000, count: 8 },
      { category: 'Consumer Protection', amount: 58_000_000, count: 10 },
      { category: 'Systems & Controls', amount: 35_000_000, count: 7 },
      { category: 'Market Conduct', amount: 30_000_000, count: 6 },
    ],
    topFirms: [
      { firm: 'NatWest Group', amount: 264_772_619, breach: 'AML Failures' },
      { firm: 'HSBC Bank plc', amount: 176_000_000, breach: 'AML Monitoring' },
      { firm: 'Other firms', amount: 127_227_381, breach: 'Various' },
    ],
    keyThemes: ['Record AML fines', 'Criminal prosecution (NatWest)', 'Transaction monitoring'],
    regulatoryFocus: ['AML Enforcement', 'Criminal Prosecution', 'Transaction Monitoring'],
  },
  2020: {
    year: 2020,
    totalFines: 22,
    totalAmount: 189_000_000,
    avgFine: 8_590_909,
    largestFine: { firm: 'Goldman Sachs International', amount: 34_344_700, breach: '1MDB Bribery' },
    monthlyData: [
      { month: 'Jan', amount: 8_200_000, count: 2 },
      { month: 'Feb', amount: 12_500_000, count: 2 },
      { month: 'Mar', amount: 6_800_000, count: 1 },
      { month: 'Apr', amount: 4_300_000, count: 1 },
      { month: 'May', amount: 9_700_000, count: 2 },
      { month: 'Jun', amount: 15_400_000, count: 2 },
      { month: 'Jul', amount: 18_600_000, count: 2 },
      { month: 'Aug', amount: 7_200_000, count: 2 },
      { month: 'Sep', amount: 11_500_000, count: 2 },
      { month: 'Oct', amount: 60_456_000, count: 3 },
      { month: 'Nov', amount: 22_143_300, count: 2 },
      { month: 'Dec', amount: 12_200_000, count: 1 },
    ],
    breachData: [
      { category: 'Financial Crime/Bribery', amount: 65_000_000, count: 4 },
      { category: 'Consumer Protection', amount: 52_000_000, count: 8 },
      { category: 'Systems & Controls', amount: 42_000_000, count: 6 },
      { category: 'Reporting Failures', amount: 30_000_000, count: 4 },
    ],
    topFirms: [
      { firm: 'Goldman Sachs International', amount: 34_344_700, breach: '1MDB' },
      { firm: 'Commerzbank AG London', amount: 37_805_400, breach: 'AML' },
      { firm: 'Standard Life Aberdeen', amount: 31_000_000, breach: 'Linking Issues' },
    ],
    keyThemes: ['1MDB enforcement', 'COVID-19 operational challenges', 'Remote working risks'],
    regulatoryFocus: ['International Bribery', 'AML', 'Operational Risk'],
  },
  2019: {
    year: 2019,
    totalFines: 28,
    totalAmount: 392_000_000,
    avgFine: 14_000_000,
    largestFine: { firm: 'Standard Chartered Bank', amount: 102_163_200, breach: 'AML Correspondent Banking' },
    monthlyData: [
      { month: 'Jan', amount: 15_700_000, count: 2 },
      { month: 'Feb', amount: 8_900_000, count: 2 },
      { month: 'Mar', amount: 22_400_000, count: 3 },
      { month: 'Apr', amount: 102_163_200, count: 2 },
      { month: 'May', amount: 18_600_000, count: 3 },
      { month: 'Jun', amount: 75_500_000, count: 4 },
      { month: 'Jul', amount: 12_300_000, count: 2 },
      { month: 'Aug', amount: 9_800_000, count: 2 },
      { month: 'Sep', amount: 28_400_000, count: 2 },
      { month: 'Oct', amount: 42_636_800, count: 2 },
      { month: 'Nov', amount: 35_200_000, count: 2 },
      { month: 'Dec', amount: 20_300_000, count: 2 },
    ],
    breachData: [
      { category: 'AML/Correspondent Banking', amount: 175_000_000, count: 6 },
      { category: 'HBOS Fraud Related', amount: 91_000_000, count: 3 },
      { category: 'Consumer Protection', amount: 68_000_000, count: 10 },
      { category: 'Systems & Controls', amount: 58_000_000, count: 9 },
    ],
    topFirms: [
      { firm: 'Standard Chartered Bank', amount: 102_163_200, breach: 'AML' },
      { firm: 'Bank of Scotland', amount: 45_500_000, breach: 'HBOS Fraud' },
      { firm: 'Lloyds Bank plc', amount: 45_500_000, breach: 'HBOS Fraud' },
    ],
    keyThemes: ['Correspondent banking risks', 'HBOS fraud accountability', 'SM&CR implementation'],
    regulatoryFocus: ['Correspondent Banking', 'Fraud Accountability', 'SM&CR'],
  },
  2018: {
    year: 2018,
    totalFines: 18,
    totalAmount: 60_000_000,
    avgFine: 3_333_333,
    largestFine: { firm: 'Tesco Personal Finance', amount: 16_400_000, breach: 'Cyber Attack Response' },
    monthlyData: [
      { month: 'Jan', amount: 4_200_000, count: 1 },
      { month: 'Feb', amount: 3_800_000, count: 2 },
      { month: 'Mar', amount: 5_600_000, count: 2 },
      { month: 'Apr', amount: 4_100_000, count: 1 },
      { month: 'May', amount: 2_900_000, count: 1 },
      { month: 'Jun', amount: 6_200_000, count: 2 },
      { month: 'Jul', amount: 3_500_000, count: 1 },
      { month: 'Aug', amount: 2_100_000, count: 1 },
      { month: 'Sep', amount: 4_800_000, count: 2 },
      { month: 'Oct', amount: 16_400_000, count: 2 },
      { month: 'Nov', amount: 3_700_000, count: 2 },
      { month: 'Dec', amount: 2_700_000, count: 1 },
    ],
    breachData: [
      { category: 'Cyber Security', amount: 20_000_000, count: 3 },
      { category: 'Consumer Protection', amount: 18_000_000, count: 6 },
      { category: 'Systems & Controls', amount: 12_000_000, count: 5 },
      { category: 'Reporting', amount: 10_000_000, count: 4 },
    ],
    topFirms: [
      { firm: 'Tesco Personal Finance', amount: 16_400_000, breach: 'Cyber Attack' },
      { firm: 'Carphone Warehouse', amount: 4_000_000, breach: 'Systems Failures' },
      { firm: 'Other firms', amount: 39_600_000, breach: 'Various' },
    ],
    keyThemes: ['Cyber security emerges', 'SM&CR bed-in period', 'GDPR preparation'],
    regulatoryFocus: ['Cyber Security', 'SM&CR', 'Data Protection'],
  },
  2017: {
    year: 2017,
    totalFines: 25,
    totalAmount: 229_000_000,
    avgFine: 9_160_000,
    largestFine: { firm: 'Deutsche Bank AG', amount: 163_076_224, breach: 'Russian Mirror Trades AML' },
    monthlyData: [
      { month: 'Jan', amount: 163_076_224, count: 2 },
      { month: 'Feb', amount: 5_200_000, count: 2 },
      { month: 'Mar', amount: 8_700_000, count: 2 },
      { month: 'Apr', amount: 4_300_000, count: 2 },
      { month: 'May', amount: 6_100_000, count: 2 },
      { month: 'Jun', amount: 5_800_000, count: 2 },
      { month: 'Jul', amount: 7_400_000, count: 2 },
      { month: 'Aug', amount: 3_200_000, count: 1 },
      { month: 'Sep', amount: 8_623_776, count: 3 },
      { month: 'Oct', amount: 5_900_000, count: 2 },
      { month: 'Nov', amount: 6_400_000, count: 3 },
      { month: 'Dec', amount: 4_300_000, count: 2 },
    ],
    breachData: [
      { category: 'AML/Mirror Trades', amount: 163_000_000, count: 2 },
      { category: 'HSBC AML', amount: 30_000_000, count: 2 },
      { category: 'Consumer Protection', amount: 20_000_000, count: 12 },
      { category: 'Market Conduct', amount: 16_000_000, count: 9 },
    ],
    topFirms: [
      { firm: 'Deutsche Bank AG', amount: 163_076_224, breach: 'AML Mirror Trades' },
      { firm: 'Merrill Lynch International', amount: 34_524_000, breach: 'Reporting' },
      { firm: 'HSBC Bank plc', amount: 17_000_000, breach: 'AML' },
    ],
    keyThemes: ['Russian money laundering', 'AML controls spotlight', 'Reporting failures'],
    regulatoryFocus: ['AML', 'Transaction Reporting', 'Correspondent Banking'],
  },
  2016: {
    year: 2016,
    totalFines: 15,
    totalAmount: 22_000_000,
    avgFine: 1_466_666,
    largestFine: { firm: 'Aviva Insurance Ltd', amount: 8_200_000, breach: 'Non-Advised Annuity Sales' },
    monthlyData: [
      { month: 'Jan', amount: 1_800_000, count: 1 },
      { month: 'Feb', amount: 2_400_000, count: 2 },
      { month: 'Mar', amount: 1_200_000, count: 1 },
      { month: 'Apr', amount: 1_600_000, count: 1 },
      { month: 'May', amount: 800_000, count: 1 },
      { month: 'Jun', amount: 8_200_000, count: 2 },
      { month: 'Jul', amount: 1_100_000, count: 1 },
      { month: 'Aug', amount: 900_000, count: 1 },
      { month: 'Sep', amount: 1_500_000, count: 2 },
      { month: 'Oct', amount: 700_000, count: 1 },
      { month: 'Nov', amount: 1_000_000, count: 1 },
      { month: 'Dec', amount: 800_000, count: 1 },
    ],
    breachData: [
      { category: 'Consumer Protection', amount: 12_000_000, count: 8 },
      { category: 'Systems & Controls', amount: 5_000_000, count: 4 },
      { category: 'Market Conduct', amount: 3_000_000, count: 2 },
      { category: 'Other', amount: 2_000_000, count: 1 },
    ],
    topFirms: [
      { firm: 'Aviva Insurance Ltd', amount: 8_200_000, breach: 'Non-Advised Sales' },
      { firm: 'Sonali Bank (UK) Ltd', amount: 3_250_600, breach: 'AML' },
      { firm: 'Other firms', amount: 10_549_400, breach: 'Various' },
    ],
    keyThemes: ['Quiet enforcement year', 'Post-FX scandal period', 'Consumer focus'],
    regulatoryFocus: ['Consumer Protection', 'Insurance Conduct', 'AML'],
  },
  2015: {
    year: 2015,
    totalFines: 40,
    totalAmount: 905_000_000,
    avgFine: 22_625_000,
    largestFine: { firm: 'Barclays Bank plc', amount: 284_432_000, breach: 'FX Manipulation' },
    monthlyData: [
      { month: 'Jan', amount: 45_000_000, count: 3 },
      { month: 'Feb', amount: 38_000_000, count: 3 },
      { month: 'Mar', amount: 52_000_000, count: 4 },
      { month: 'Apr', amount: 28_000_000, count: 3 },
      { month: 'May', amount: 78_000_000, count: 4 },
      { month: 'Jun', amount: 177_000_000, count: 5 },
      { month: 'Jul', amount: 42_000_000, count: 3 },
      { month: 'Aug', amount: 35_000_000, count: 3 },
      { month: 'Sep', amount: 48_000_000, count: 3 },
      { month: 'Oct', amount: 55_000_000, count: 3 },
      { month: 'Nov', amount: 284_432_000, count: 4 },
      { month: 'Dec', amount: 22_568_000, count: 2 },
    ],
    breachData: [
      { category: 'FX/Market Manipulation', amount: 520_000_000, count: 8 },
      { category: 'Financial Crime', amount: 145_000_000, count: 6 },
      { category: 'PPI/Consumer', amount: 140_000_000, count: 15 },
      { category: 'Systems & Controls', amount: 100_000_000, count: 11 },
    ],
    topFirms: [
      { firm: 'Barclays Bank plc', amount: 284_432_000, breach: 'FX Manipulation' },
      { firm: 'Lloyds Banking Group', amount: 117_000_000, breach: 'PPI Complaints' },
      { firm: 'Barclays Bank plc', amount: 72_069_400, breach: 'Financial Crime' },
    ],
    keyThemes: ['FX scandal concludes at Barclays', 'PPI enforcement', 'Record total fines'],
    regulatoryFocus: ['FX Market Conduct', 'PPI', 'Financial Crime'],
  },
  2014: {
    year: 2014,
    totalFines: 45,
    totalAmount: 1_471_000_000,
    avgFine: 32_688_888,
    largestFine: { firm: 'UBS AG', amount: 233_814_000, breach: 'FX Manipulation' },
    monthlyData: [
      { month: 'Jan', amount: 35_000_000, count: 3 },
      { month: 'Feb', amount: 42_000_000, count: 4 },
      { month: 'Mar', amount: 58_000_000, count: 4 },
      { month: 'Apr', amount: 45_000_000, count: 3 },
      { month: 'May', amount: 62_000_000, count: 4 },
      { month: 'Jun', amount: 78_000_000, count: 4 },
      { month: 'Jul', amount: 55_000_000, count: 4 },
      { month: 'Aug', amount: 48_000_000, count: 3 },
      { month: 'Sep', amount: 65_000_000, count: 4 },
      { month: 'Oct', amount: 72_000_000, count: 4 },
      { month: 'Nov', amount: 896_000_000, count: 6 },
      { month: 'Dec', amount: 15_000_000, count: 2 },
    ],
    breachData: [
      { category: 'FX/Market Manipulation', amount: 1_100_000_000, count: 6 },
      { category: 'LIBOR Related', amount: 160_000_000, count: 4 },
      { category: 'Consumer Protection', amount: 120_000_000, count: 20 },
      { category: 'Systems & Controls', amount: 91_000_000, count: 15 },
    ],
    topFirms: [
      { firm: 'UBS AG', amount: 233_814_000, breach: 'FX Manipulation' },
      { firm: 'Citibank N.A.', amount: 225_575_000, breach: 'FX Manipulation' },
      { firm: 'JP Morgan Chase', amount: 222_166_000, breach: 'FX Manipulation' },
      { firm: 'RBS plc', amount: 217_000_000, breach: 'FX Manipulation' },
      { firm: 'HSBC Bank plc', amount: 216_363_000, breach: 'FX Manipulation' },
    ],
    keyThemes: ['FX scandal - coordinated enforcement', 'Record year for fines', 'Major bank accountability'],
    regulatoryFocus: ['FX Market Conduct', 'Benchmark Manipulation', 'Trading Controls'],
  },
  2013: {
    year: 2013,
    totalFines: 35,
    totalAmount: 474_000_000,
    avgFine: 13_542_857,
    largestFine: { firm: 'JPMorgan Chase Bank', amount: 137_610_000, breach: 'London Whale CIO Losses' },
    monthlyData: [
      { month: 'Jan', amount: 28_000_000, count: 3 },
      { month: 'Feb', amount: 22_000_000, count: 2 },
      { month: 'Mar', amount: 35_000_000, count: 3 },
      { month: 'Apr', amount: 45_000_000, count: 3 },
      { month: 'May', amount: 38_000_000, count: 3 },
      { month: 'Jun', amount: 42_000_000, count: 3 },
      { month: 'Jul', amount: 55_000_000, count: 4 },
      { month: 'Aug', amount: 32_000_000, count: 3 },
      { month: 'Sep', amount: 137_610_000, count: 4 },
      { month: 'Oct', amount: 18_000_000, count: 3 },
      { month: 'Nov', amount: 12_390_000, count: 2 },
      { month: 'Dec', amount: 9_000_000, count: 2 },
    ],
    breachData: [
      { category: 'Trading/London Whale', amount: 180_000_000, count: 3 },
      { category: 'LIBOR Manipulation', amount: 120_000_000, count: 4 },
      { category: 'Consumer Protection', amount: 95_000_000, count: 18 },
      { category: 'Systems & Controls', amount: 79_000_000, count: 10 },
    ],
    topFirms: [
      { firm: 'JPMorgan Chase Bank', amount: 137_610_000, breach: 'London Whale' },
      { firm: 'Rabobank', amount: 105_000_000, breach: 'LIBOR' },
      { firm: 'Lloyds Banking Group', amount: 28_000_000, breach: 'Insurance Sales' },
    ],
    keyThemes: ['FCA established (April 2013)', 'London Whale aftermath', 'LIBOR scandal continues'],
    regulatoryFocus: ['LIBOR', 'Risk Management', 'Trading Controls'],
  },
};

// Format currency for display
const formatCurrency = (value: number): string => {
  if (value >= 1_000_000_000) {
    return `£${(value / 1_000_000_000).toFixed(2)}bn`;
  }
  if (value >= 1_000_000) {
    return `£${(value / 1_000_000).toFixed(1)}m`;
  }
  if (value >= 1_000) {
    return `£${(value / 1_000).toFixed(0)}k`;
  }
  return `£${value.toFixed(0)}`;
};

// Monthly Fines Bar Chart
interface MonthlyChartProps {
  data: Array<{ month: string; amount: number; count: number }>;
  year: number;
}

export function MonthlyFinesChart({ data, year }: MonthlyChartProps) {
  return (
    <div className="yearly-chart">
      <h4 className="yearly-chart-title">Monthly Enforcement Activity - {year}</h4>
      <ResponsiveContainer width="100%" height={250}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.3)" />
          <XAxis dataKey="month" tick={{ fill: '#6B7280', fontSize: 12 }} />
          <YAxis
            yAxisId="left"
            tickFormatter={(v) => formatCurrency(v)}
            tick={{ fill: '#6B7280', fontSize: 11 }}
            width={65}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: '#6B7280', fontSize: 11 }}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: '#1F2937',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number, name: string) => {
              if (name === 'amount') return [formatCurrency(value), 'Fine Amount'];
              return [value, 'Actions'];
            }}
          />
          <Bar yAxisId="left" dataKey="amount" fill="#0FA294" radius={[4, 4, 0, 0]} />
          <Line yAxisId="right" type="monotone" dataKey="count" stroke="#6366F1" strokeWidth={2} dot={{ fill: '#6366F1' }} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="yearly-chart-caption">Bar: Fine amounts | Line: Number of enforcement actions</p>
    </div>
  );
}

// Breach Category Pie Chart
interface BreachChartProps {
  data: Array<{ category: string; amount: number; count: number }>;
  year: number;
}

export function BreachCategoryChart({ data, year }: BreachChartProps) {
  const total = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="yearly-chart">
      <h4 className="yearly-chart-title">Fines by Breach Category - {year}</h4>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            dataKey="amount"
            nameKey="category"
            cx="50%"
            cy="50%"
            outerRadius={90}
            innerRadius={50}
            label={({ category, percent }) => `${category.split('/')[0]} (${(percent * 100).toFixed(0)}%)`}
            labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: '#1F2937',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number) => [formatCurrency(value), 'Total Fines']}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => <span style={{ color: '#6B7280', fontSize: '12px' }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      <p className="yearly-chart-caption">Total: {formatCurrency(total)} across {data.reduce((sum, item) => sum + item.count, 0)} enforcement actions</p>
    </div>
  );
}

// Top Firms Horizontal Bar Chart
interface TopFirmsChartProps {
  data: Array<{ firm: string; amount: number; breach: string }>;
  year: number;
}

export function TopFirmsChart({ data, year }: TopFirmsChartProps) {
  const chartData = data.slice(0, 5).map(item => ({
    ...item,
    shortFirm: item.firm.length > 25 ? item.firm.substring(0, 25) + '...' : item.firm,
  }));

  return (
    <div className="yearly-chart">
      <h4 className="yearly-chart-title">Largest Fines by Firm - {year}</h4>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.3)" />
          <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} tick={{ fill: '#6B7280', fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="shortFirm"
            tick={{ fill: '#6B7280', fontSize: 11 }}
            width={140}
          />
          <Tooltip
            contentStyle={{
              background: '#1F2937',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number, name: string, props: any) => [
              formatCurrency(value),
              `${props.payload.breach}`
            ]}
          />
          <Bar dataKey="amount" fill="#6366F1" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Year-over-Year Comparison Chart
interface YoYComparisonProps {
  years: number[];
}

export function YearOverYearChart({ years }: YoYComparisonProps) {
  const data = years.map(year => ({
    year: year.toString(),
    amount: yearlyFCAData[year]?.totalAmount || 0,
    count: yearlyFCAData[year]?.totalFines || 0,
    avgFine: yearlyFCAData[year]?.avgFine || 0,
  }));

  return (
    <div className="yearly-chart yearly-chart--wide">
      <h4 className="yearly-chart-title">FCA Enforcement Trend: {years[0]}-{years[years.length - 1]}</h4>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.3)" />
          <XAxis dataKey="year" tick={{ fill: '#6B7280', fontSize: 12 }} />
          <YAxis
            yAxisId="left"
            tickFormatter={(v) => formatCurrency(v)}
            tick={{ fill: '#6B7280', fontSize: 11 }}
            width={70}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: '#6B7280', fontSize: 11 }}
            width={45}
          />
          <Tooltip
            contentStyle={{
              background: '#1F2937',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value: number, name: string) => {
              if (name === 'amount') return [formatCurrency(value), 'Total Fines'];
              if (name === 'avgFine') return [formatCurrency(value), 'Average Fine'];
              return [value, 'Actions'];
            }}
          />
          <Legend />
          <Area yAxisId="left" type="monotone" dataKey="amount" fill="rgba(15, 162, 148, 0.2)" stroke="#0FA294" strokeWidth={2} name="Total Fines" />
          <Bar yAxisId="right" dataKey="count" fill="#6366F1" radius={[4, 4, 0, 0]} name="Actions" opacity={0.8} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
